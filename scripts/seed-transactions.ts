/**
 * Dev-only: seeds a user with a few hundred realistic transactions for testing the list.
 *
 *   npm run seed:transactions -- --email you@example.com --password secret [--count 250]
 *
 * By default it talks to the local emulators (start them with `npm run emulators`), signs in
 * as an existing email/password user, and writes through the normal security rules, so the
 * data is exactly what the app would write: transactions plus the cached `txTotal` on each
 * account, in the same batches. Every seeded transaction is tagged #seed, so you can filter
 * by that tag and bulk-delete them in the app.
 *
 * `--live` targets the Firebase project in .env.local instead. It refuses any project id
 * containing "prod".
 */
import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import {
  Timestamp,
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  increment,
  initializeFirestore,
  serverTimestamp,
  setDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore'

const { values: args } = parseArgs({
  options: {
    email: { type: 'string' },
    password: { type: 'string' },
    count: { type: 'string', default: '250' },
    days: { type: 'string', default: '180' },
    live: { type: 'boolean', default: false },
  },
})

function fail(message: string): never {
  console.error(`seed: ${message}`)
  process.exit(1)
}

if (!args.email || !args.password) {
  fail(
    'usage: npm run seed:transactions -- --email you@example.com --password secret [--count 250]',
  )
}
const count = Number(args.count)
const days = Number(args.days)
if (!Number.isInteger(count) || count < 1 || count > 5000) fail('--count must be 1..5000')
if (!Number.isInteger(days) || days < 1) fail('--days must be a positive whole number')

function readEnv(): Record<string, string> {
  try {
    const text = readFileSync('.env.local', 'utf8')
    return Object.fromEntries(
      text
        .split('\n')
        .map((line) => /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line))
        .filter((m): m is RegExpExecArray => m !== null)
        .map((m) => [m[1] as string, (m[2] as string).replace(/^['"]|['"]$/g, '')]),
    )
  } catch {
    return {}
  }
}

const env = readEnv()
const projectId = env.VITE_FIREBASE_PROJECT_ID || 'demo-ledgerly'
if (args.live) {
  if (!env.VITE_FIREBASE_API_KEY) fail('--live needs the Firebase config in .env.local')
  if (/prod/i.test(projectId)) fail(`refusing to seed "${projectId}": this script is dev-only`)
}

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY || 'demo-api-key',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
  projectId,
  appId: env.VITE_FIREBASE_APP_ID || 'demo-app',
})
const auth = getAuth(app)
const db = initializeFirestore(app, {})
if (!args.live) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
}

// Small seeded PRNG so runs are reproducible.
let state = 0x2f6b9a1d
function random(): number {
  state = (state + 0x6d2b79f5) | 0
  let t = Math.imul(state ^ (state >>> 15), 1 | state)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T
const between = (min: number, max: number) => Math.round(min + random() * (max - min))

interface Account {
  id: string
  name: string
  currency: string
}
interface Category {
  id: string
  kind: 'expense' | 'income'
}

const PAYEES = [
  'Big Basket',
  'Swiggy',
  'Zomato',
  'Uber',
  'Ola',
  'Amazon',
  'Flipkart',
  'Starbucks',
  'Local Kirana',
  'Shell',
  'Netflix',
  'Spotify',
  'Apollo Pharmacy',
  'DMart',
  'Airtel',
  'Electricity Board',
  'Landlord',
  'Cafe Coffee Day',
  'BookMyShow',
  'Decathlon',
]
const TAGS = ['work', 'family', 'trip', 'weekend', 'gift', 'reimbursable', 'subscription']
const NOTES = ['', '', '', 'Split with friends', 'Monthly', 'Card payment', 'Paid in cash']

async function ensureAccount(
  firestore: Firestore,
  uid: string,
  id: string,
  name: string,
  currency: string,
): Promise<Account> {
  const ref = doc(firestore, 'users', uid, 'accounts', id)
  const snap = await getDoc(ref)
  if (!snap.exists()) {
    await setDoc(ref, {
      name,
      type: 'bank',
      currency,
      openingBalance: 5000000,
      txTotal: 0,
      color: '#2563eb',
      icon: 'landmark',
      archived: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: uid,
    })
  }
  return { id, name, currency }
}

async function main() {
  const { user } = await signInWithEmailAndPassword(
    auth,
    args.email as string,
    args.password as string,
  )
  const uid = user.uid
  console.log(
    `seed: signed in as ${user.email} (${uid}) on ${args.live ? projectId : 'the emulators'}`,
  )

  const userDoc = await getDoc(doc(db, 'users', uid))
  if (!userDoc.exists()) fail('the user has no profile yet: sign in to the app once first')
  const baseCurrency = (userDoc.get('settings.baseCurrency') as string | undefined) ?? 'INR'
  const foreign = baseCurrency === 'USD' ? 'EUR' : 'USD'
  const rate = baseCurrency === 'INR' ? '83.25' : baseCurrency === 'USD' ? '1.08' : '1.10'

  const accountsSnap = await getDocs(collection(db, 'users', uid, 'accounts'))
  const accounts: Account[] = accountsSnap.docs
    .filter((d) => !d.get('archived'))
    .map((d) => ({
      id: d.id,
      name: d.get('name') as string,
      currency: d.get('currency') as string,
    }))
  if (!accounts.some((a) => a.id === 'seed-bank')) {
    accounts.push(await ensureAccount(db, uid, 'seed-bank', 'Seed Bank', baseCurrency))
  }
  if (!accounts.some((a) => a.id === 'seed-travel')) {
    accounts.push(await ensureAccount(db, uid, 'seed-travel', `Travel ${foreign}`, foreign))
  }
  const baseAccounts = accounts.filter((a) => a.currency === baseCurrency)
  const travel = accounts.find((a) => a.id === 'seed-travel') as Account

  const categoriesSnap = await getDocs(collection(db, 'users', uid, 'categories'))
  const categories: Category[] = categoriesSnap.docs
    .filter((d) => !d.get('archived'))
    .map((d) => ({ id: d.id, kind: d.get('kind') as 'expense' | 'income' }))
  const expenseCats = categories.filter((c) => c.kind === 'expense')
  const incomeCats = categories.filter((c) => c.kind === 'income')

  const currencyOf = new Map(accounts.map((a) => [a.id, a.currency]))
  const now = Date.now()
  let written = 0

  for (let start = 0; start < count; start += 10) {
    // Ten transactions per batch keeps each commit well inside the rules' document-read limit.
    const batch = writeBatch(db)
    const deltas = new Map<string, number>()
    const effect = (
      accountId: string,
      sign: number,
      amount: number,
      baseAmount: number,
      currency: string,
    ) => {
      const value = currencyOf.get(accountId) === currency ? amount : baseAmount
      deltas.set(accountId, (deltas.get(accountId) ?? 0) + sign * value)
    }

    for (let i = start; i < Math.min(start + 10, count); i++) {
      const roll = random()
      const type = roll < 0.8 ? 'expense' : roll < 0.92 ? 'income' : 'transfer'
      const useForeign = type === 'expense' && random() < 0.1
      const currency = useForeign ? foreign : baseCurrency
      const account =
        useForeign && random() < 0.5
          ? travel
          : ((pick(baseAccounts) as Account | undefined) ?? travel)
      const amount =
        type === 'income'
          ? between(500000, 15000000)
          : type === 'transfer'
            ? between(100000, 2000000)
            : between(2000, 500000) / (useForeign ? 50 : 1)
      const minor = Math.max(1, Math.round(amount))
      const baseAmount = useForeign
        ? Math.round((minor * Number(rate.replace('.', ''))) / 100)
        : minor
      const date = new Date(now - random() * days * 86_400_000)
      const tags = random() < 0.3 ? [pick(TAGS), 'seed'] : ['seed']
      const data: Record<string, unknown> = {
        type,
        amount: minor,
        currency: type === 'transfer' ? account.currency : currency,
        fxRateToBase: useForeign ? Number(rate) : 1,
        baseAmount: type === 'transfer' ? minor : baseAmount,
        accountId: account.id,
        tags: [...new Set(tags)],
        payee: type === 'transfer' ? '' : pick(PAYEES),
        note: pick(NOTES),
        date: Timestamp.fromDate(date),
        attachments: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: uid,
      }
      if (type === 'transfer') {
        const others = baseAccounts.filter((a) => a.id !== account.id)
        const to = others.length > 0 ? pick(others) : null
        if (!to || account.currency !== baseCurrency) {
          data.type = 'expense'
        } else {
          data.toAccountId = to.id
        }
      }
      const finalType = data.type as string
      const category =
        finalType === 'income'
          ? pick(incomeCats)
          : finalType === 'expense'
            ? pick(expenseCats)
            : undefined
      if (category) data.categoryId = category.id

      const amt = data.amount as number
      const base = data.baseAmount as number
      const cur = data.currency as string
      if (finalType === 'income') effect(account.id, 1, amt, base, cur)
      else if (finalType === 'expense') effect(account.id, -1, amt, base, cur)
      else {
        effect(account.id, -1, amt, base, cur)
        effect(data.toAccountId as string, 1, amt, base, cur)
      }
      batch.set(doc(collection(db, 'users', uid, 'transactions')), data)
    }
    for (const [accountId, delta] of deltas) {
      batch.update(doc(db, 'users', uid, 'accounts', accountId), {
        txTotal: increment(delta),
        updatedAt: serverTimestamp(),
      })
    }
    await batch.commit()
    written = Math.min(start + 10, count)
    process.stdout.write(`\rseed: wrote ${written}/${count} transactions`)
  }
  process.stdout.write('\n')
  console.log('seed: done. Filter by #seed in the app to find (and bulk delete) them.')
  process.exit(0)
}

main().catch((error: unknown) => {
  console.error('\nseed: failed', error)
  process.exit(1)
})
