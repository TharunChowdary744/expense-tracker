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
  deleteField,
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { transactionSchema } from '../src/features/transactions/schemas'
import { toPlain } from '../src/services/firestore'

let env: RulesTestEnvironment

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-ledgerly-transactions',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  })
})

afterAll(async () => {
  await env.cleanup()
})

const past = Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'))
const stamps = (uid = 'alice') => ({ createdAt: past, updatedAt: past, createdBy: uid })

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    const account = (name: string, currency: string) => ({
      name,
      type: 'bank',
      currency,
      openingBalance: 0,
      color: '#2563eb',
      icon: 'landmark',
      archived: false,
      ...stamps(),
    })
    await setDoc(doc(db, 'users/alice/accounts/bank'), account('Bank', 'INR'))
    await setDoc(doc(db, 'users/alice/accounts/cash'), account('Cash', 'INR'))
    await setDoc(doc(db, 'users/bob/accounts/bobbank'), {
      ...account('Bob', 'INR'),
      ...stamps('bob'),
    })
    const category = (name: string, kind: string) => ({
      name,
      kind,
      icon: 'tag',
      color: '#ea580c',
      order: 0,
      archived: false,
      ...stamps(),
    })
    await setDoc(doc(db, 'users/alice/categories/food'), category('Food', 'expense'))
    await setDoc(doc(db, 'users/alice/categories/rent'), category('Rent', 'expense'))
    await setDoc(doc(db, 'users/alice/categories/salary'), category('Salary', 'income'))
    await setDoc(doc(db, 'users/bob/categories/bobfood'), {
      ...category('Bob food', 'expense'),
      ...stamps('bob'),
    })
    await setDoc(doc(db, 'users/alice/transactions/existing'), {
      type: 'expense',
      amount: 5000,
      currency: 'INR',
      fxRateToBase: 1,
      baseAmount: 5000,
      accountId: 'bank',
      categoryId: 'food',
      tags: ['lunch'],
      payee: 'Cafe',
      note: '',
      date: past,
      attachments: [],
      ...stamps(),
    })
  })
})

const asDb = (uid: string) => env.authenticatedContext(uid).firestore() as unknown as Firestore
const alice = () => asDb('alice')

const expense = (patch: Record<string, unknown> = {}) => ({
  type: 'expense',
  amount: 12550,
  currency: 'INR',
  fxRateToBase: 1,
  baseAmount: 12550,
  accountId: 'bank',
  categoryId: 'food',
  tags: ['groceries'],
  payee: 'Market',
  note: 'Weekly shop',
  date: Timestamp.fromDate(new Date('2026-10-02T10:00:00Z')),
  attachments: [],
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  createdBy: 'alice',
  ...patch,
})

const without = (data: Record<string, unknown>, ...keys: string[]) => {
  const copy = { ...data }
  for (const key of keys) delete copy[key]
  return copy
}

const newRef = (id = 'new') => doc(alice(), `users/alice/transactions/${id}`)
const existing = () => doc(alice(), 'users/alice/transactions/existing')

describe('transactions: create', () => {
  it('accepts a valid expense, income and transfer', async () => {
    await assertSucceeds(setDoc(newRef('e'), expense()))
    await assertSucceeds(setDoc(newRef('i'), expense({ type: 'income', categoryId: 'salary' })))
    await assertSucceeds(
      setDoc(
        newRef('t'),
        without(expense({ type: 'transfer', toAccountId: 'cash', payee: '' }), 'categoryId'),
      ),
    )
  })

  it('accepts a foreign-currency expense with a fractional rate', async () => {
    await assertSucceeds(
      setDoc(
        newRef(),
        expense({ currency: 'USD', amount: 1250, fxRateToBase: 83.5, baseAmount: 104375 }),
      ),
    )
  })

  it('allows no category on expenses and income', async () => {
    await assertSucceeds(setDoc(newRef(), without(expense(), 'categoryId')))
  })

  it('rejects a type outside the enum', async () => {
    await assertFails(setDoc(newRef(), expense({ type: 'refund' })))
  })

  it('requires integer amounts greater than zero', async () => {
    for (const amount of [0, -100, 12.5, '100', Number.MAX_SAFE_INTEGER + 3]) {
      await assertFails(setDoc(newRef(), expense({ amount })))
      await assertFails(setDoc(newRef(), expense({ baseAmount: amount })))
    }
  })

  it('checks the other fields', async () => {
    const bad: Record<string, unknown>[] = [
      { currency: 'usd' },
      { fxRateToBase: 0 },
      { fxRateToBase: '1' },
      { date: '2026-10-02' },
      { payee: 'x'.repeat(81) },
      { note: 'x'.repeat(501) },
      { tags: 'food' },
      { tags: Array.from({ length: 11 }, (_, i) => `t${i}`) },
      { attachments: {} },
      { recurringId: 5 },
      { surprise: true },
      { createdBy: 'bob' },
      { createdAt: past },
    ]
    for (const patch of bad) await assertFails(setDoc(newRef(), expense(patch)))
    for (const field of [
      'type',
      'amount',
      'currency',
      'fxRateToBase',
      'baseAmount',
      'accountId',
      'tags',
      'payee',
      'note',
      'date',
      'attachments',
    ]) {
      await assertFails(setDoc(newRef(), without(expense(), field)))
    }
  })

  it("must reference the user's own accounts", async () => {
    await assertFails(setDoc(newRef(), expense({ accountId: 'missing' })))
    await assertFails(setDoc(newRef(), expense({ accountId: 'bobbank' })))
    await assertFails(setDoc(newRef(), expense({ accountId: 5 })))
  })

  it("must reference the user's own category of the matching kind", async () => {
    await assertFails(setDoc(newRef(), expense({ categoryId: 'missing' })))
    await assertFails(setDoc(newRef(), expense({ categoryId: 'bobfood' })))
    await assertFails(setDoc(newRef(), expense({ categoryId: 'salary' })))
    await assertFails(setDoc(newRef(), expense({ type: 'income', categoryId: 'food' })))
  })

  it('requires a different, owned destination for transfers and nothing else', async () => {
    const transfer = (patch: Record<string, unknown>) =>
      without(expense({ type: 'transfer', ...patch }), 'categoryId')
    await assertFails(setDoc(newRef(), transfer({})))
    await assertFails(setDoc(newRef(), transfer({ toAccountId: 'bank' })))
    await assertFails(setDoc(newRef(), transfer({ toAccountId: 'missing' })))
    await assertFails(setDoc(newRef(), transfer({ toAccountId: 'bobbank' })))
    await assertFails(
      setDoc(newRef(), { ...transfer({ toAccountId: 'cash' }), categoryId: 'food' }),
    )
    await assertFails(setDoc(newRef(), expense({ toAccountId: 'cash' })))
  })

  it('cannot write into another user', async () => {
    await assertFails(setDoc(doc(alice(), 'users/bob/transactions/x'), expense()))
    await assertFails(getDoc(doc(asDb('bob'), 'users/alice/transactions/existing')))
  })
})

describe('transactions: update and delete', () => {
  it('allows edits that keep the doc valid', async () => {
    await assertSucceeds(
      updateDoc(existing(), { amount: 7000, baseAmount: 7000, updatedAt: serverTimestamp() }),
    )
    await assertSucceeds(
      updateDoc(existing(), { categoryId: 'rent', updatedAt: serverTimestamp() }),
    )
    await assertSucceeds(
      updateDoc(existing(), { categoryId: deleteField(), updatedAt: serverTimestamp() }),
    )
  })

  it('re-checks the category when the type changes', async () => {
    await assertFails(updateDoc(existing(), { type: 'income', updatedAt: serverTimestamp() }))
    await assertSucceeds(
      updateDoc(existing(), { type: 'income', categoryId: 'salary', updatedAt: serverTimestamp() }),
    )
  })

  it('rejects edits that break the doc or rewrite history', async () => {
    await assertFails(updateDoc(existing(), { amount: 0, updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(existing(), { accountId: 'bobbank', updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(existing(), { categoryId: 'salary', updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(existing(), { amount: 1 })) // no updatedAt
    await assertFails(updateDoc(existing(), { createdBy: 'bob', updatedAt: serverTimestamp() }))
    await assertFails(
      updateDoc(existing(), { createdAt: serverTimestamp(), updatedAt: serverTimestamp() }),
    )
  })

  it('lets the owner delete', async () => {
    await assertFails(deleteDoc(doc(asDb('bob'), 'users/alice/transactions/existing')))
    await assertSucceeds(deleteDoc(existing()))
  })
})

describe('transactions: batches with cached account totals', () => {
  it('creates a transfer and updates both account totals atomically', async () => {
    const db = alice()
    const batch = writeBatch(db)
    batch.set(
      doc(db, 'users/alice/transactions/tr'),
      without(expense({ type: 'transfer', toAccountId: 'cash' }), 'categoryId'),
    )
    batch.update(doc(db, 'users/alice/accounts/bank'), {
      txTotal: increment(-12550),
      updatedAt: serverTimestamp(),
    })
    batch.update(doc(db, 'users/alice/accounts/cash'), {
      txTotal: increment(12550),
      updatedAt: serverTimestamp(),
    })
    await assertSucceeds(batch.commit())
    const bank = await getDoc(doc(db, 'users/alice/accounts/bank'))
    const cash = await getDoc(doc(db, 'users/alice/accounts/cash'))
    expect(bank.get('txTotal')).toBe(-12550)
    expect(cash.get('txTotal')).toBe(12550)
  })

  it('rejects a non-integer account total', async () => {
    await assertFails(
      updateDoc(doc(alice(), 'users/alice/accounts/bank'), {
        txTotal: 1.5,
        updatedAt: serverTimestamp(),
      }),
    )
  })

  it('re-categorises 100 transactions in one batch', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      const seed = writeBatch(db)
      for (let i = 0; i < 100; i++) {
        seed.set(doc(db, `users/alice/transactions/bulk${i}`), {
          ...expense({ createdAt: past, updatedAt: past }),
          accountId: i % 2 ? 'bank' : 'cash',
        })
      }
      await seed.commit()
    })
    const db = alice()
    const batch = writeBatch(db)
    for (let i = 0; i < 100; i++) {
      batch.update(doc(db, `users/alice/transactions/bulk${i}`), {
        categoryId: 'rent',
        updatedAt: serverTimestamp(),
      })
    }
    await assertSucceeds(batch.commit())
  })

  it('creates 10 transactions with their account totals in one batch', async () => {
    const db = alice()
    const batch = writeBatch(db)
    const categories = ['food', 'rent']
    for (let i = 0; i < 10; i++) {
      batch.set(
        doc(db, `users/alice/transactions/seed${i}`),
        expense({
          accountId: i % 2 ? 'bank' : 'cash',
          categoryId: categories[i % 2],
        }),
      )
    }
    batch.update(doc(db, 'users/alice/accounts/bank'), {
      txTotal: increment(-62750),
      updatedAt: serverTimestamp(),
    })
    batch.update(doc(db, 'users/alice/accounts/cash'), {
      txTotal: increment(-62750),
      updatedAt: serverTimestamp(),
    })
    await assertSucceeds(batch.commit())
  })
})

describe('transactions: schema', () => {
  it('a doc the rules accept parses with the app schema', async () => {
    await assertSucceeds(setDoc(newRef(), expense()))
    const snap = await getDoc(newRef())
    const parsed = transactionSchema.safeParse(toPlain(snap.data()))
    expect(parsed.success).toBe(true)
  })
})
