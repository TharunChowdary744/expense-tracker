import { readFileSync } from 'node:fs'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Firestore,
} from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { recurringSchema } from '../src/features/recurring/schemas'
import { confirmOccurrenceTx, runRule, skipOccurrenceTx } from '../src/features/recurring/runner'
import { toPlain } from '../src/services/firestore'
import { zonedTime } from '../src/utils/dates'

let env: RulesTestEnvironment

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-ledgerly-recurring',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  })
})

afterAll(async () => {
  await env.cleanup()
})

const TZ = 'Asia/Kolkata'
const past = Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'))
const stamps = (uid = 'alice') => ({ createdAt: past, updatedAt: past, createdBy: uid })
const day = (date: string) => Timestamp.fromDate(zonedTime(date, TZ))
/** 10:30 on 3 Oct 2026 in India. */
const NOW = new Date('2026-10-03T05:00:00Z')

const template = (over: Record<string, unknown> = {}) => ({
  type: 'expense',
  amount: 2500000,
  currency: 'INR',
  fxRateToBase: 1,
  baseAmount: 2500000,
  accountId: 'bank',
  categoryId: 'rent',
  tags: [],
  payee: 'Landlord',
  note: '',
  ...over,
})

const storedRule = (over: Record<string, unknown> = {}) => ({
  template: template(),
  frequency: 'monthly',
  interval: 1,
  byMonthDay: 3,
  startDate: day('2026-07-03'),
  timeZone: TZ,
  nextRunAt: day('2026-07-03'),
  lastRunAt: null,
  mode: 'auto',
  paused: false,
  skippedKeys: [],
  ...stamps(),
  ...over,
})

/** A new rule as the client writes it (server timestamps). */
const newRule = (over: Record<string, unknown> = {}) => ({
  ...storedRule(),
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  createdBy: 'alice',
  ...over,
})

function without<T extends Record<string, unknown>>(data: T, key: string): T {
  const copy = { ...data }
  delete copy[key]
  return copy
}

async function seed(path: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data)
  })
}

async function read(path: string) {
  let data: Record<string, unknown> | undefined
  await env.withSecurityRulesDisabled(async (ctx) => {
    data = (await getDoc(doc(ctx.firestore(), path))).data()
  })
  return data
}

async function transactionIds(): Promise<string[]> {
  let ids: string[] = []
  await env.withSecurityRulesDisabled(async (ctx) => {
    const snap = await getDocs(collection(ctx.firestore(), 'users/alice/transactions'))
    ids = snap.docs.map((d) => d.id).sort()
  })
  return ids
}

// The test SDK's Firestore is the same modular instance under a compat type.
const alice = () => env.authenticatedContext('alice').firestore() as unknown as Firestore

beforeEach(async () => {
  await env.clearFirestore()
  const account = (name: string, uid = 'alice') => ({
    name,
    type: 'bank',
    currency: 'INR',
    openingBalance: 0,
    txTotal: 0,
    color: '#2563eb',
    icon: 'landmark',
    archived: false,
    ...stamps(uid),
  })
  await seed('users/alice/accounts/bank', account('Bank'))
  await seed('users/alice/accounts/cash', account('Cash'))
  await seed('users/bob/accounts/bobbank', account('Bob', 'bob'))
  const category = (name: string, kind: string) => ({
    name,
    kind,
    icon: 'house',
    color: '#ea580c',
    order: 0,
    archived: false,
    ...stamps(),
  })
  await seed('users/alice/categories/rent', category('Rent', 'expense'))
  await seed('users/alice/categories/salary', category('Salary', 'income'))
})

describe('recurring rule docs', () => {
  it('lets the owner create a valid rule, which the app schema reads back', async () => {
    const db = alice()
    await assertSucceeds(setDoc(doc(db, 'users/alice/recurring/r1'), newRule()))
    const snap = await getDoc(doc(db, 'users/alice/recurring/r1'))
    expect(recurringSchema.safeParse(toPlain(snap.data())).success).toBe(true)
  })

  it('accepts weekly days, last day of month, an end, a count, remind mode and an ended rule', async () => {
    const db = alice()
    await assertSucceeds(
      setDoc(
        doc(db, 'users/alice/recurring/w'),
        without(newRule({ frequency: 'weekly', byWeekday: [1, 4] }), 'byMonthDay'),
      ),
    )
    await assertSucceeds(
      setDoc(
        doc(db, 'users/alice/recurring/m'),
        newRule({
          byMonthDay: -1,
          endDate: day('2027-07-03'),
          maxOccurrences: 12,
          mode: 'remind',
          nextRunAt: null,
        }),
      ),
    )
  })

  it.each([
    ['an unknown frequency', { frequency: 'hourly' }],
    ['interval 0', { interval: 0 }],
    ['interval 366', { interval: 366 }],
    ['day of month 32', { byMonthDay: 32 }],
    ['repeated weekdays', { byWeekday: [1, 1] }],
    ['weekday 7', { byWeekday: [7] }],
    ['an end before the start', { endDate: day('2026-07-02') }],
    ['1001 occurrences', { maxOccurrences: 1001 }],
    ['a bad mode', { mode: 'sometimes' }],
    ['a string nextRunAt', { nextRunAt: '2026-07-03' }],
    ['too many skipped keys', { skippedKeys: Array.from({ length: 201 }, (_, i) => `k${i}`) }],
    ['an extra field', { color: '#ffffff' }],
    ["someone else's createdBy", { createdBy: 'bob' }],
    ['a client-side createdAt', { createdAt: past }],
    ["another user's account", { template: template({ accountId: 'bobbank' }) }],
    ['a missing account', { template: template({ accountId: 'nope' }) }],
    ['an income category on an expense', { template: template({ categoryId: 'salary' }) }],
    ['a float amount', { template: template({ amount: 10.5 }) }],
    [
      'a transfer with a category',
      { template: template({ type: 'transfer', toAccountId: 'cash' }) },
    ],
    ['a template extra field', { template: { ...template(), date: past } }],
  ])('rejects a rule with %s', async (_label, over) => {
    await assertFails(setDoc(doc(alice(), 'users/alice/recurring/bad'), newRule(over)))
  })

  it('accepts a transfer template between own accounts', async () => {
    const t = without(template({ type: 'transfer', toAccountId: 'cash' }), 'categoryId')
    await assertSucceeds(setDoc(doc(alice(), 'users/alice/recurring/t'), newRule({ template: t })))
  })

  it('keeps rules private to their owner', async () => {
    await seed('users/alice/recurring/r1', storedRule())
    const bob = env.authenticatedContext('bob').firestore()
    await assertFails(getDoc(doc(bob, 'users/alice/recurring/r1')))
    await assertFails(setDoc(doc(bob, 'users/alice/recurring/r2'), newRule({ createdBy: 'bob' })))
  })

  it('allows pausing and editing with server stamps', async () => {
    await seed('users/alice/recurring/r1', storedRule())
    const db = alice()
    await assertSucceeds(
      updateDoc(doc(db, 'users/alice/recurring/r1'), {
        paused: true,
        updatedAt: serverTimestamp(),
      }),
    )
    await assertFails(
      updateDoc(doc(db, 'users/alice/recurring/r1'), { paused: false, updatedAt: past }),
    )
  })
})

describe('occurrence transactions', () => {
  const tx = (over: Record<string, unknown> = {}) => ({
    ...template(),
    date: Timestamp.fromDate(zonedTime('2026-07-03', TZ, 12)),
    attachments: [],
    recurringId: 'r1',
    occurrenceKey: '2026-07-03',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: 'alice',
    ...over,
  })

  it('must use the id `${recurringId}_${occurrenceKey}`', async () => {
    const db = alice()
    await assertSucceeds(setDoc(doc(db, 'users/alice/transactions/r1_2026-07-03'), tx()))
    await assertFails(setDoc(doc(db, 'users/alice/transactions/random'), tx()))
    await assertFails(setDoc(doc(db, 'users/alice/transactions/r1_2026-08-03'), tx()))
  })

  it('needs both fields and a date key', async () => {
    const db = alice()
    const noKey = without(tx(), 'occurrenceKey')
    await assertFails(setDoc(doc(db, 'users/alice/transactions/r1_'), noKey))
    await assertFails(
      setDoc(doc(db, 'users/alice/transactions/r1_july'), tx({ occurrenceKey: 'july' })),
    )
  })

  it("can be edited but its recurring fields can't change", async () => {
    const db = alice()
    await setDoc(doc(db, 'users/alice/transactions/r1_2026-07-03'), tx())
    await assertSucceeds(
      updateDoc(doc(db, 'users/alice/transactions/r1_2026-07-03'), {
        amount: 2600000,
        baseAmount: 2600000,
        updatedAt: serverTimestamp(),
      }),
    )
    await assertFails(
      updateDoc(doc(db, 'users/alice/transactions/r1_2026-07-03'), {
        recurringId: 'r2',
        updatedAt: serverTimestamp(),
      }),
    )
  })
})

describe('catch-up run', () => {
  it('posts every missed occurrence once, with balances, then advances nextRunAt', async () => {
    await seed('users/alice/recurring/r1', storedRule())
    const result = await runRule(alice(), 'alice', 'r1', NOW)
    // 3 Jul, 3 Aug, 3 Sep and today, 3 Oct.
    expect(result.posted).toBe(4)
    expect(result.remaining).toBe(0)
    expect(await transactionIds()).toEqual([
      'r1_2026-07-03',
      'r1_2026-08-03',
      'r1_2026-09-03',
      'r1_2026-10-03',
    ])
    const account = await read('users/alice/accounts/bank')
    expect(account?.txTotal).toBe(-4 * 2500000)
    const rule = await read('users/alice/recurring/r1')
    expect((rule?.nextRunAt as Timestamp).toDate()).toEqual(zonedTime('2026-11-03', TZ))
    expect(rule?.lastRunAt).toBeInstanceOf(Timestamp)

    const again = await runRule(alice(), 'alice', 'r1', NOW)
    expect(again.posted).toBe(0)
    expect(await transactionIds()).toHaveLength(4)
  })

  it('never duplicates when two tabs run at once', async () => {
    await seed('users/alice/recurring/r1', storedRule())
    const tabs = [alice(), alice(), alice()]
    const results = await Promise.all(tabs.map((db) => runRule(db, 'alice', 'r1', NOW)))
    expect(results.reduce((sum, r) => sum + r.posted, 0)).toBe(4)
    expect(await transactionIds()).toHaveLength(4)
    expect((await read('users/alice/accounts/bank'))?.txTotal).toBe(-4 * 2500000)
  })

  it('skips occurrences that already exist (e.g. confirmed before switching to auto)', async () => {
    await seed('users/alice/recurring/r1', storedRule())
    await seed('users/alice/transactions/r1_2026-08-03', {
      ...template(),
      date: Timestamp.fromDate(zonedTime('2026-08-03', TZ, 12)),
      attachments: [],
      recurringId: 'r1',
      occurrenceKey: '2026-08-03',
      ...stamps(),
    })
    const result = await runRule(alice(), 'alice', 'r1', NOW)
    expect(result.posted).toBe(3)
    expect(await transactionIds()).toHaveLength(4)
  })

  it('posts nothing while paused or in remind mode', async () => {
    await seed('users/alice/recurring/p', storedRule({ paused: true }))
    await seed('users/alice/recurring/m', storedRule({ mode: 'remind' }))
    expect((await runRule(alice(), 'alice', 'p', NOW)).posted).toBe(0)
    expect((await runRule(alice(), 'alice', 'm', NOW)).posted).toBe(0)
    expect(await transactionIds()).toEqual([])
  })

  it('caps a run at 100 occurrences and reports the rest', async () => {
    // Daily since 1 May: 156 due by 3 Oct.
    await seed(
      'users/alice/recurring/d',
      without(
        storedRule({
          frequency: 'daily',
          startDate: day('2026-05-01'),
          nextRunAt: day('2026-05-01'),
        }),
        'byMonthDay',
      ),
    )
    const result = await runRule(alice(), 'alice', 'd', NOW)
    expect(result.posted).toBe(100)
    expect(result.remaining).toBe(56)
    expect((await read('users/alice/accounts/bank'))?.txTotal).toBe(-100 * 2500000)
    const rule = await read('users/alice/recurring/d')
    expect((rule?.nextRunAt as Timestamp).toDate()).toEqual(zonedTime('2026-08-09', TZ))
    const next = await runRule(alice(), 'alice', 'd', NOW)
    expect(next.posted).toBe(56)
    expect(await transactionIds()).toHaveLength(156)
  })
})

describe('remind mode: confirm and skip', () => {
  beforeEach(async () => {
    await seed('users/alice/recurring/m', storedRule({ mode: 'remind' }))
  })

  it('confirms with a changed amount, out of order, and advances past handled occurrences', async () => {
    const db = alice()
    await confirmOccurrenceTx(db, {
      uid: 'alice',
      ruleId: 'm',
      key: '2026-08-03',
      amount: 2600000,
      baseAmount: 2600000,
    })
    let rule = await read('users/alice/recurring/m')
    // 3 Jul is still waiting.
    expect((rule?.nextRunAt as Timestamp).toDate()).toEqual(zonedTime('2026-07-03', TZ))
    expect((await read('users/alice/transactions/m_2026-08-03'))?.amount).toBe(2600000)

    await confirmOccurrenceTx(db, {
      uid: 'alice',
      ruleId: 'm',
      key: '2026-07-03',
      amount: 2500000,
      baseAmount: 2500000,
    })
    rule = await read('users/alice/recurring/m')
    expect((rule?.nextRunAt as Timestamp).toDate()).toEqual(zonedTime('2026-09-03', TZ))
    expect((await read('users/alice/accounts/bank'))?.txTotal).toBe(-5100000)

    await expect(
      confirmOccurrenceTx(db, {
        uid: 'alice',
        ruleId: 'm',
        key: '2026-07-03',
        amount: 1,
        baseAmount: 1,
      }),
    ).rejects.toThrow(/already posted/)
  })

  it('skips: the occurrence is recorded and nextRunAt moves on', async () => {
    await skipOccurrenceTx(alice(), { uid: 'alice', ruleId: 'm', key: '2026-07-03' })
    const rule = await read('users/alice/recurring/m')
    expect(rule?.skippedKeys).toEqual([])
    expect((rule?.nextRunAt as Timestamp).toDate()).toEqual(zonedTime('2026-08-03', TZ))
    expect(await transactionIds()).toEqual([])
  })

  it('keeps a skipped key that is still ahead', async () => {
    await skipOccurrenceTx(alice(), { uid: 'alice', ruleId: 'm', key: '2026-08-03' })
    const rule = await read('users/alice/recurring/m')
    expect(rule?.skippedKeys).toEqual(['2026-08-03'])
    expect((rule?.nextRunAt as Timestamp).toDate()).toEqual(zonedTime('2026-07-03', TZ))
  })
})
