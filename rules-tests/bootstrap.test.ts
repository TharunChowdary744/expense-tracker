import { readFileSync } from 'node:fs'
import {
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  updateDoc,
  type Firestore,
} from 'firebase/firestore'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ensureUserBootstrap } from '../src/features/auth/bootstrap'

let env: RulesTestEnvironment

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-ledgerly-bootstrap',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  })
})

afterAll(async () => {
  await env.cleanup()
})

/** The test SDK is typed as the compat Firestore but is the modular instance at runtime. */
const asDb = (uid: string) => env.authenticatedContext(uid).firestore() as unknown as Firestore

const profile = { uid: 'alice', email: 'alice@example.com', displayName: 'Alice', photoURL: null }

describe('ensureUserBootstrap against the real rules', () => {
  it('seeds the user doc, 12 categories and a Cash account in one go', async () => {
    const db = asDb('alice')
    await expect(ensureUserBootstrap(db, profile, 'en-IN')).resolves.toBe(true)

    const user = await assertSucceeds(getDoc(doc(db, 'users/alice')))
    expect(user.data()).toMatchObject({
      displayName: 'Alice',
      email: 'alice@example.com',
      createdBy: 'alice',
      settings: { baseCurrency: 'INR' },
    })
    expect((await getDocs(collection(db, 'users/alice/categories'))).size).toBe(12)
    const accounts = await getDocs(collection(db, 'users/alice/accounts'))
    expect(accounts.docs.map((d) => d.data().name)).toEqual(['Cash'])
  })

  it('is idempotent: a second run changes nothing, even after the user edits their data', async () => {
    const db = asDb('alice')
    await updateDoc(doc(db, 'users/alice/categories/food'), {
      name: 'Groceries',
      updatedAt: serverTimestamp(),
    })

    await expect(ensureUserBootstrap(db, profile, 'en-IN')).resolves.toBe(false)

    expect((await getDoc(doc(db, 'users/alice/categories/food'))).data()?.name).toBe('Groceries')
    expect((await getDocs(collection(db, 'users/alice/categories'))).size).toBe(12)
    expect((await getDocs(collection(db, 'users/alice/accounts'))).size).toBe(1)
  })

  it('concurrent calls seed once', async () => {
    const db = asDb('bob')
    const bob = { ...profile, uid: 'bob', email: 'bob@example.com', displayName: 'Bob' }
    const results = await Promise.all([
      ensureUserBootstrap(db, bob, 'en-US'),
      ensureUserBootstrap(db, bob, 'en-US'),
    ])
    expect(results).toEqual([true, true]) // same shared promise
    expect((await getDocs(collection(db, 'users/bob/categories'))).size).toBe(12)
    expect((await getDoc(doc(db, 'users/bob'))).data()?.settings.baseCurrency).toBe('USD')
  })
})
