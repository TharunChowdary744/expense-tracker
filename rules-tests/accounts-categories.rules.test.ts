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
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ensureUserBootstrap } from '../src/features/auth/bootstrap'
import { accountSchema } from '../src/features/accounts/schemas'
import { categorySchema } from '../src/features/categories/schemas'
import { toPlain } from '../src/services/firestore'

let env: RulesTestEnvironment

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-ledgerly-accounts-categories',
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
    const stamps = { createdAt: past, updatedAt: past, createdBy: 'alice' }
    await setDoc(doc(db, 'users/alice/accounts/bank'), {
      name: 'Bank',
      type: 'bank',
      currency: 'INR',
      openingBalance: 1000,
      color: '#2563eb',
      icon: 'landmark',
      archived: false,
      ...stamps,
    })
    await setDoc(doc(db, 'users/alice/categories/food'), {
      name: 'Food',
      kind: 'expense',
      icon: 'utensils',
      color: '#ea580c',
      order: 0,
      archived: false,
      ...stamps,
    })
    await setDoc(doc(db, 'users/alice/categories/groceries'), {
      name: 'Groceries',
      kind: 'expense',
      icon: 'shopping-cart',
      color: '#ea580c',
      parentId: 'food',
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

/** The test SDK is typed as the compat Firestore but is the modular instance at runtime. */
const asDb = (uid: string) => env.authenticatedContext(uid).firestore() as unknown as Firestore
const alice = () => asDb('alice')

const newStamps = (uid = 'alice') => ({
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  createdBy: uid,
})

const validAccount = () => ({
  name: 'Wallet',
  type: 'wallet',
  currency: 'USD',
  openingBalance: -2550,
  color: '#16a34a',
  icon: 'wallet',
  archived: false,
  ...newStamps(),
})

const validCategory = () => ({
  name: 'Coffee',
  kind: 'expense',
  icon: 'coffee',
  color: '#b45309',
  order: 3,
  archived: false,
  ...newStamps(),
})

describe('accounts', () => {
  const ref = () => doc(alice(), 'users/alice/accounts/new')

  it('accepts a valid account, including negative and zero balances', async () => {
    await assertSucceeds(setDoc(ref(), validAccount()))
    await assertSucceeds(
      setDoc(doc(alice(), 'users/alice/accounts/zero'), { ...validAccount(), openingBalance: 0 }),
    )
  })

  it('rejects missing required fields', async () => {
    for (const field of [
      'name',
      'type',
      'currency',
      'openingBalance',
      'color',
      'icon',
      'archived',
    ]) {
      const data: Record<string, unknown> = validAccount()
      delete data[field]
      await assertFails(setDoc(ref(), data))
    }
    const noStamp: Record<string, unknown> = validAccount()
    delete noStamp.createdAt
    await assertFails(setDoc(ref(), noStamp))
  })

  it('rejects unknown fields', async () => {
    await assertFails(setDoc(ref(), { ...validAccount(), balance: 5 }))
  })

  it('requires integer amounts', async () => {
    await assertFails(setDoc(ref(), { ...validAccount(), openingBalance: 12.5 }))
    await assertFails(setDoc(ref(), { ...validAccount(), openingBalance: '1000' }))
    await assertFails(
      setDoc(ref(), { ...validAccount(), openingBalance: Number.MAX_SAFE_INTEGER + 3 }),
    )
  })

  it('checks field types and values', async () => {
    const bad: Record<string, unknown>[] = [
      { name: '' },
      { name: 'x'.repeat(41) },
      { name: 42 },
      { type: 'crypto' },
      { currency: 'usd' },
      { currency: 'DOLLARS' },
      { color: 'red' },
      { color: '#12345' },
      { icon: 'Not An Icon' },
      { archived: 'no' },
    ]
    for (const patch of bad) {
      await assertFails(setDoc(ref(), { ...validAccount(), ...patch }))
    }
  })

  it('requires server timestamps and the owner as creator', async () => {
    await assertFails(setDoc(ref(), { ...validAccount(), createdAt: past }))
    await assertFails(setDoc(ref(), { ...validAccount(), updatedAt: past }))
    await assertFails(setDoc(ref(), { ...validAccount(), createdBy: 'bob' }))
  })

  it('allows edits and archiving that keep the doc valid', async () => {
    const bank = doc(alice(), 'users/alice/accounts/bank')
    await assertSucceeds(updateDoc(bank, { name: 'Savings', updatedAt: serverTimestamp() }))
    await assertSucceeds(updateDoc(bank, { archived: true, updatedAt: serverTimestamp() }))
  })

  it('rejects updates that break the doc or rewrite history', async () => {
    const bank = doc(alice(), 'users/alice/accounts/bank')
    await assertFails(updateDoc(bank, { name: 'Savings' })) // no updatedAt
    await assertFails(updateDoc(bank, { openingBalance: 0.5, updatedAt: serverTimestamp() }))
    await assertFails(
      updateDoc(bank, { createdAt: serverTimestamp(), updatedAt: serverTimestamp() }),
    )
    await assertFails(updateDoc(bank, { createdBy: 'bob', updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(bank, { name: deleteField(), updatedAt: serverTimestamp() }))
  })

  it('keeps other users out', async () => {
    await assertFails(setDoc(doc(asDb('bob'), 'users/alice/accounts/x'), validAccount()))
    await assertFails(getDocs(collection(asDb('bob'), 'users/alice/accounts')))
    await assertFails(deleteDoc(doc(asDb('bob'), 'users/alice/accounts/bank')))
  })

  it('lets the owner read and delete', async () => {
    await assertSucceeds(getDocs(collection(alice(), 'users/alice/accounts')))
    await assertSucceeds(deleteDoc(doc(alice(), 'users/alice/accounts/bank')))
  })
})

describe('categories', () => {
  const ref = (id = 'new') => doc(alice(), `users/alice/categories/${id}`)

  it('accepts a valid top-level category and subcategory', async () => {
    await assertSucceeds(setDoc(ref(), validCategory()))
    await assertSucceeds(setDoc(ref('snacks'), { ...validCategory(), parentId: 'food' }))
    await assertSucceeds(setDoc(ref('misc'), { ...validCategory(), parentId: null }))
  })

  it('rejects missing or mistyped fields', async () => {
    for (const field of ['name', 'kind', 'icon', 'color', 'order', 'archived']) {
      const data: Record<string, unknown> = validCategory()
      delete data[field]
      await assertFails(setDoc(ref(), data))
    }
    const bad: Record<string, unknown>[] = [
      { kind: 'transfer' },
      { order: 1.5 },
      { order: -1 },
      { order: '2' },
      { name: '' },
      { color: '#zzzzzz' },
      { archived: 1 },
      { parentId: 7 },
      { extra: true },
    ]
    for (const patch of bad) {
      await assertFails(setDoc(ref(), { ...validCategory(), ...patch }))
    }
  })

  it('allows only one level of subcategories with a parent of the same kind', async () => {
    await assertFails(setDoc(ref(), { ...validCategory(), parentId: 'missing' }))
    await assertFails(setDoc(ref(), { ...validCategory(), parentId: 'groceries' }))
    await assertFails(setDoc(ref(), { ...validCategory(), parentId: 'salary' }))
    await assertFails(setDoc(ref('self'), { ...validCategory(), parentId: 'self' }))
  })

  it('lets a batch create a parent and its child together', async () => {
    const db = alice()
    const batch = writeBatch(db)
    batch.set(doc(db, 'users/alice/categories/pets'), validCategory())
    batch.set(doc(db, 'users/alice/categories/vet'), { ...validCategory(), parentId: 'pets' })
    await assertSucceeds(batch.commit())
  })

  it('allows reorder, archive and edit updates', async () => {
    const db = alice()
    const batch = writeBatch(db)
    batch.update(doc(db, 'users/alice/categories/food'), { order: 1, updatedAt: serverTimestamp() })
    batch.update(doc(db, 'users/alice/categories/groceries'), {
      archived: true,
      updatedAt: serverTimestamp(),
    })
    await assertSucceeds(batch.commit())
    await assertSucceeds(
      updateDoc(ref('groceries'), {
        parentId: null,
        name: 'Groceries',
        updatedAt: serverTimestamp(),
      }),
    )
  })

  it('does not let the kind change after creation', async () => {
    await assertFails(updateDoc(ref('food'), { kind: 'income', updatedAt: serverTimestamp() }))
  })

  it('rejects updates without a server updatedAt or with a bad order', async () => {
    await assertFails(updateDoc(ref('food'), { order: 2 }))
    await assertFails(updateDoc(ref('food'), { order: 2.5, updatedAt: serverTimestamp() }))
  })

  it('keeps other users out', async () => {
    await assertFails(setDoc(doc(asDb('bob'), 'users/alice/categories/x'), validCategory()))
    await assertFails(getDocs(collection(asDb('bob'), 'users/alice/categories')))
  })
})

describe('first sign-in seed', () => {
  it('passes the rules and the app schemas', async () => {
    const db = asDb('carol')
    const profile = { uid: 'carol', email: 'c@example.com', displayName: 'Carol', photoURL: null }
    await expect(ensureUserBootstrap(db, profile, 'en-US')).resolves.toBe(true)

    const accounts = await getDocs(collection(db, 'users/carol/accounts'))
    const categories = await getDocs(collection(db, 'users/carol/categories'))
    expect(accounts.size).toBe(1)
    expect(categories.size).toBe(12)
    for (const snap of accounts.docs) {
      expect(accountSchema.safeParse(toPlain(snap.data())).success).toBe(true)
    }
    for (const snap of categories.docs) {
      expect(categorySchema.safeParse(toPlain(snap.data())).success).toBe(true)
    }
  })
})
