import { readFileSync } from 'node:fs'
import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  type Firestore,
} from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ensureUserBootstrap } from '../src/features/auth/bootstrap'
import { parseBackup } from '../src/features/data/backup'
import type { ImportedTx } from '../src/features/data/csvImport'
import {
  PartialWriteError,
  importTransactions,
  readBackup,
  restoreBackup,
} from '../src/features/data/writes'

let env: RulesTestEnvironment
const asDb = (uid: string) => env.authenticatedContext(uid).firestore() as unknown as Firestore

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-ledgerly-data',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  })
})

afterAll(async () => {
  await env.cleanup()
})

const past = Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'))
const stamps = { createdAt: past, updatedAt: past, createdBy: 'alice' }
const CATEGORY_COUNT = 25

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'users/alice'), {
      displayName: 'Alice',
      email: 'alice@example.com',
      photoURL: '',
      settings: { baseCurrency: 'INR', locale: 'en-IN', theme: 'dark', weekStartsOn: 1 },
      fcmTokens: ['secret-token'],
      ...stamps,
    })
    const account = (name: string, currency: string) => ({
      name,
      type: 'bank',
      currency,
      openingBalance: 5000,
      txTotal: 0,
      color: '#2563eb',
      icon: 'landmark',
      archived: false,
      ...stamps,
    })
    await setDoc(doc(db, 'users/alice/accounts/bank'), account('Bank', 'INR'))
    await setDoc(doc(db, 'users/alice/accounts/card'), account('Card', 'INR'))
    await setDoc(doc(db, 'users/alice/accounts/usd'), account('USD wallet', 'USD'))
    for (let i = 0; i < CATEGORY_COUNT; i++) {
      await setDoc(doc(db, `users/alice/categories/c${i}`), {
        name: `Cat ${i}`,
        kind: 'expense',
        icon: 'tag',
        color: '#2563eb',
        order: i,
        archived: false,
        ...stamps,
      })
    }
    await setDoc(doc(db, 'users/alice/categories/c0sub'), {
      name: 'Sub',
      kind: 'expense',
      icon: 'tag',
      color: '#2563eb',
      parentId: 'c0',
      order: 0,
      archived: false,
      ...stamps,
    })
    await setDoc(doc(db, 'users/alice/categories/salary'), {
      name: 'Salary',
      kind: 'income',
      icon: 'banknote',
      color: '#16a34a',
      order: 0,
      archived: false,
      ...stamps,
    })
  })
})

const currencies = { bank: 'INR', card: 'INR', usd: 'USD' }

function imported(i: number): ImportedTx {
  const base = {
    day: '2026-09-15',
    date: new Date(Date.UTC(2026, 8, 1 + (i % 28), 6)).toISOString(),
    currency: 'INR',
    fxRateToBase: 1,
    payee: `Payee ${i % 7}`,
    note: '',
    tags: [],
  }
  if (i % 50 === 0) {
    return {
      ...base,
      type: 'transfer',
      amount: 1000,
      baseAmount: 1000,
      accountId: 'bank',
      toAccountId: 'card',
    }
  }
  if (i % 10 === 0) {
    return {
      ...base,
      type: 'income',
      amount: 2000,
      baseAmount: 2000,
      accountId: 'bank',
      categoryId: 'salary',
    }
  }
  return {
    ...base,
    type: 'expense',
    amount: 100 + i,
    baseAmount: 100 + i,
    accountId: i % 3 === 0 ? 'card' : 'bank',
    categoryId: `c${i % CATEGORY_COUNT}`,
  }
}

async function txTotals(uid: string) {
  const out: Record<string, number> = {}
  await env.withSecurityRulesDisabled(async (ctx) => {
    const snap = await getDocs(collection(ctx.firestore(), `users/${uid}/accounts`))
    for (const d of snap.docs) out[d.id] = (d.get('txTotal') as number | undefined) ?? 0
  })
  return out
}

function expectedTotals(txs: ImportedTx[]) {
  const out: Record<string, number> = { bank: 0, card: 0, usd: 0 }
  for (const t of txs) {
    if (t.type === 'income') out[t.accountId]! += t.amount
    else if (t.type === 'expense') out[t.accountId]! -= t.amount
    else {
      out[t.accountId]! -= t.amount
      out[t.toAccountId!]! += t.amount
    }
  }
  return out
}

describe('CSV import writes', () => {
  it('imports 900 transactions over 25 categories in rule-safe batches with balances', async () => {
    const txs = Array.from({ length: 900 }, (_, i) => imported(i))
    const db = asDb('alice')
    const progress: number[] = []
    const written = await importTransactions(db, 'alice', txs, currencies, (done) =>
      progress.push(done),
    )
    expect(written).toBe(900)
    expect(progress[0]).toBe(0)
    expect(progress.at(-1)).toBe(900)
    expect(
      Math.max(...progress.slice(1).map((d, i) => d - (progress[i] ?? 0))),
    ).toBeLessThanOrEqual(400)
    const snap = await getDocs(collection(db, 'users/alice/transactions'))
    expect(snap.size).toBe(900)
    expect(await txTotals('alice')).toEqual(expectedTotals(txs))
  }, 120_000)

  it("can't import into another user's data", async () => {
    const db = asDb('bob')
    const error = await importTransactions(db, 'alice', [imported(1)], currencies).catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(PartialWriteError)
    await assertFails(Promise.reject((error as PartialWriteError).cause))
  })
})

describe('backup and restore', () => {
  it('restores a backup into a fresh account, replacing the seeded data', async () => {
    const aliceDb = asDb('alice')
    const txs = Array.from({ length: 120 }, (_, i) => imported(i))
    await importTransactions(aliceDb, 'alice', txs, currencies)
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await setDoc(doc(db, 'users/alice/recurring/rent'), {
        template: {
          type: 'expense',
          amount: 50000,
          currency: 'INR',
          fxRateToBase: 1,
          baseAmount: 50000,
          accountId: 'bank',
          categoryId: 'c0sub',
          tags: [],
          payee: 'Landlord',
          note: '',
        },
        frequency: 'monthly',
        interval: 1,
        byMonthDay: 1,
        startDate: past,
        timeZone: 'Asia/Kolkata',
        nextRunAt: Timestamp.fromDate(new Date('2026-11-01T00:00:00+05:30')),
        lastRunAt: null,
        mode: 'auto',
        paused: false,
        skippedKeys: [],
        ...stamps,
      })
      await setDoc(doc(db, 'users/alice/transactions/rent_2026-10-01'), {
        type: 'expense',
        amount: 50000,
        currency: 'INR',
        fxRateToBase: 1,
        baseAmount: 50000,
        accountId: 'bank',
        categoryId: 'c0sub',
        tags: ['home'],
        payee: 'Landlord',
        note: '',
        date: Timestamp.fromDate(new Date('2026-10-01T00:00:00+05:30')),
        attachments: [],
        recurringId: 'rent',
        occurrenceKey: '2026-10-01',
        ...stamps,
      })
      await setDoc(doc(db, 'users/alice/budgets/food'), {
        name: 'Food',
        period: 'monthly',
        categoryIds: ['c0'],
        amount: 100000,
        rollover: false,
        alertThresholds: [80, 100],
        startDate: past,
        ...stamps,
      })
    })
    // The rent occurrence was added behind the rules, so add its balance effect by hand.
    const aliceTotals = await txTotals('alice')
    aliceTotals.bank! -= 50000

    const backup = await readBackup(aliceDb, 'alice')
    expect(backup.user?.fcmTokens).toBeUndefined()
    const text = JSON.stringify(backup)
    const check = parseBackup(text)
    if (!check.ok) throw new Error(check.error)
    expect(check.counts.transactions).toBe(121)

    // Carol signs up (seeded categories and a Cash account), then restores Alice's file.
    const carolDb = asDb('carol')
    await ensureUserBootstrap(
      carolDb,
      { uid: 'carol', email: 'carol@example.com', displayName: 'Carol', photoURL: null },
      'en-US',
    )
    await restoreBackup(carolDb, 'carol', check.backup)

    const ids = async (uid: string, name: string) =>
      (await getDocs(collection(asDb(uid), `users/${uid}/${name}`))).docs.map((d) => d.id).sort()
    for (const name of ['accounts', 'categories', 'transactions', 'budgets', 'recurring']) {
      expect(await ids('carol', name)).toEqual(await ids('alice', name))
    }
    const carolTotals = await txTotals('carol')
    expect(carolTotals).toEqual(aliceTotals)

    const rent = await getDoc(doc(carolDb, 'users/carol/transactions/rent_2026-10-01'))
    expect(rent.get('createdBy')).toBe('carol')
    expect((rent.get('date') as Timestamp).toDate().toISOString()).toBe('2026-09-30T18:30:00.000Z')
    const user = await getDoc(doc(carolDb, 'users/carol'))
    expect(user.get('settings.baseCurrency')).toBe('INR')
    expect(user.get('email')).toBe('carol@example.com')
  }, 120_000)

  it("can't restore into another user's account", async () => {
    const backup = await readBackup(asDb('alice'), 'alice')
    const bobDb = asDb('bob')
    await assertFails(restoreBackup(bobDb, 'alice', backup))
  })
})
