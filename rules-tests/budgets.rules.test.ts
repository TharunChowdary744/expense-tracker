import { readFileSync } from 'node:fs'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  Timestamp,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { budgetSchema } from '../src/features/budgets/schemas'
import { notificationSchema } from '../src/features/notifications/schemas'
import { toPlain } from '../src/services/firestore'

let env: RulesTestEnvironment

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-ledgerly-budgets',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  })
})

afterAll(async () => {
  await env.cleanup()
})

const past = Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'))

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'users/alice/budgets/existing'), {
      name: 'Food',
      period: 'monthly',
      categoryIds: ['food'],
      amount: 500000,
      rollover: false,
      alertThresholds: [80, 100],
      startDate: past,
      createdAt: past,
      updatedAt: past,
      createdBy: 'alice',
    })
    await setDoc(doc(db, 'users/alice/notifications/budget_existing_M2026-10-01_80'), {
      type: 'budget-threshold',
      title: 'Food budget: 80% used',
      body: "You've spent ₹4,000.00 of ₹5,000.00 for October 2026.",
      link: '/budgets/existing?at=2026-10-01',
      read: false,
      createdAt: past,
      updatedAt: past,
      createdBy: 'alice',
    })
  })
})

const alice = () => env.authenticatedContext('alice').firestore()
const bob = () => env.authenticatedContext('bob').firestore()

function newBudget(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Groceries',
    period: 'weekly',
    categoryIds: [],
    amount: 150000,
    rollover: true,
    alertThresholds: [80, 100],
    startDate: Timestamp.fromDate(new Date('2026-09-28T00:00:00+05:30')),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: 'alice',
    ...overrides,
  }
}

function newNotification(overrides: Record<string, unknown> = {}) {
  return {
    type: 'budget-threshold',
    title: 'Food budget: 100% reached',
    body: "You've spent ₹5,100.00 of ₹5,000.00 for October 2026, ₹100.00 over.",
    link: '/budgets/existing?at=2026-10-01',
    read: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: 'alice',
    ...overrides,
  }
}

type Db = ReturnType<typeof alice>

const budgetRef = (db: Db, id = 'b1') => doc(db, `users/alice/budgets/${id}`)
const notificationRef = (db: Db, id = 'budget_existing_M2026-10-01_100') =>
  doc(db, `users/alice/notifications/${id}`)

describe('budgets', () => {
  it('lets the owner create, update and delete a valid budget', async () => {
    await assertSucceeds(setDoc(budgetRef(alice()), newBudget()))
    await assertSucceeds(
      updateDoc(budgetRef(alice(), 'existing'), {
        amount: 600000,
        rollover: true,
        categoryIds: ['food', 'groceries'],
        alertThresholds: [50, 90, 100],
        updatedAt: serverTimestamp(),
      }),
    )
    await assertSucceeds(deleteDoc(budgetRef(alice(), 'existing')))
  })

  it('stores what the app reads back', async () => {
    await setDoc(budgetRef(alice()), newBudget())
    const snap = await getDoc(budgetRef(alice()))
    const parsed = budgetSchema.safeParse(toPlain(snap.data({ serverTimestamps: 'estimate' })))
    expect(parsed.success).toBe(true)
  })

  it('rejects invalid fields', async () => {
    const bad: Record<string, unknown>[] = [
      { period: 'daily' },
      { amount: 0 },
      { amount: -5 },
      { amount: 12.5 },
      { amount: '5000' },
      { name: '' },
      { name: 'x'.repeat(41) },
      { categoryIds: 'food' },
      { categoryIds: Array.from({ length: 51 }, (_, i) => `c${i}`) },
      { rollover: 'yes' },
      { alertThresholds: [] },
      { alertThresholds: [80, 100, 120, 150, 200, 300] },
      { alertThresholds: [0] },
      { alertThresholds: [1001] },
      { alertThresholds: [80.5] },
      { alertThresholds: ['80'] },
      { startDate: '2026-10-01' },
      { extra: true },
      { createdBy: 'bob' },
      { createdAt: past },
    ]
    for (const overrides of bad) {
      await assertFails(setDoc(budgetRef(alice()), newBudget(overrides)))
    }
  })

  it('requires every field', async () => {
    const withoutRollover: Record<string, unknown> = newBudget()
    delete withoutRollover.rollover
    await assertFails(setDoc(budgetRef(alice()), withoutRollover))
  })

  it('keeps createdAt and createdBy fixed on update', async () => {
    await assertFails(
      updateDoc(budgetRef(alice(), 'existing'), {
        createdBy: 'bob',
        updatedAt: serverTimestamp(),
      }),
    )
    await assertFails(updateDoc(budgetRef(alice(), 'existing'), { amount: 1 }))
  })

  it("denies other users access to someone's budgets", async () => {
    await assertFails(getDoc(budgetRef(bob(), 'existing')))
    await assertFails(setDoc(budgetRef(bob()), newBudget({ createdBy: 'bob' })))
    await assertFails(deleteDoc(budgetRef(bob(), 'existing')))
  })
})

describe('notifications', () => {
  it('lets the owner create an unread notification', async () => {
    await assertSucceeds(setDoc(notificationRef(alice()), newNotification()))
    const snap = await getDoc(notificationRef(alice()))
    const parsed = notificationSchema.safeParse(
      toPlain(snap.data({ serverTimestamps: 'estimate' })),
    )
    expect(parsed.success).toBe(true)
  })

  it('creates several alerts in one batch', async () => {
    const db = alice()
    const batch = writeBatch(db)
    batch.set(notificationRef(db, 'budget_existing_M2026-11-01_80'), newNotification())
    batch.set(notificationRef(db, 'budget_existing_M2026-11-01_100'), newNotification())
    await assertSucceeds(batch.commit())
  })

  it('cannot recreate an existing alert (the dedupe key)', async () => {
    await assertFails(
      setDoc(notificationRef(alice(), 'budget_existing_M2026-10-01_80'), newNotification()),
    )
  })

  it('rejects invalid notifications', async () => {
    const bad: Record<string, unknown>[] = [
      { read: true },
      { title: '' },
      { title: 'x'.repeat(121) },
      { body: 'x'.repeat(301) },
      { link: 'https://evil.example' },
      { type: '' },
      { extra: 1 },
      { createdBy: 'bob' },
    ]
    for (const overrides of bad) {
      await assertFails(setDoc(notificationRef(alice()), newNotification(overrides)))
    }
  })

  it('only lets the owner mark it read or unread', async () => {
    const ref = notificationRef(alice(), 'budget_existing_M2026-10-01_80')
    await assertSucceeds(updateDoc(ref, { read: true, updatedAt: serverTimestamp() }))
    await assertSucceeds(updateDoc(ref, { read: false, updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(ref, { title: 'Changed', updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(ref, { read: 'yes', updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(ref, { read: true }))
  })

  it('lets the owner delete, and nobody else touch, notifications', async () => {
    await assertFails(getDoc(notificationRef(bob(), 'budget_existing_M2026-10-01_80')))
    await assertFails(
      updateDoc(notificationRef(bob(), 'budget_existing_M2026-10-01_80'), {
        read: true,
        updatedAt: serverTimestamp(),
      }),
    )
    await assertFails(setDoc(notificationRef(bob()), newNotification({ createdBy: 'bob' })))
    await assertSucceeds(deleteDoc(notificationRef(alice(), 'budget_existing_M2026-10-01_80')))
  })
})
