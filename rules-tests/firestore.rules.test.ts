import { readFileSync } from 'node:fs'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { deleteDoc, doc, getDoc, getDocs, collection, setDoc, updateDoc } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

let env: RulesTestEnvironment

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-ledgerly-firestore-rules',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  })
})

afterAll(async () => {
  await env.cleanup()
})

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'users/alice'), { displayName: 'Alice' })
    await setDoc(doc(db, 'users/alice/accounts/cash'), { name: 'Cash' })
    await setDoc(doc(db, 'users/alice/transactions/t1/notes/n1'), { text: 'deep' })
    await setDoc(doc(db, 'users/bob'), { displayName: 'Bob' })
    await setDoc(doc(db, 'groups/g1'), { name: 'Trip', memberIds: ['alice'] })
    await setDoc(doc(db, 'invites/tok'), { groupId: 'g1' })
  })
})

const alice = () => env.authenticatedContext('alice').firestore()
const bob = () => env.authenticatedContext('bob').firestore()
const anon = () => env.unauthenticatedContext().firestore()

describe('users/{uid}', () => {
  it('lets the owner read, create, update and delete their own user doc', async () => {
    await assertSucceeds(getDoc(doc(alice(), 'users/alice')))
    await assertSucceeds(updateDoc(doc(alice(), 'users/alice'), { displayName: 'Alice B' }))
    await assertSucceeds(
      setDoc(doc(env.authenticatedContext('carol').firestore(), 'users/carol'), {
        displayName: 'C',
      }),
    )
    await assertSucceeds(deleteDoc(doc(alice(), 'users/alice')))
  })

  it('lets the owner use any subcollection, at any depth', async () => {
    await assertSucceeds(getDoc(doc(alice(), 'users/alice/accounts/cash')))
    await assertSucceeds(setDoc(doc(alice(), 'users/alice/categories/food'), { name: 'Food' }))
    await assertSucceeds(getDocs(collection(alice(), 'users/alice/transactions')))
    await assertSucceeds(
      setDoc(doc(alice(), 'users/alice/transactions/t1/notes/n2'), { text: 'x' }),
    )
  })

  it("denies another signed-in user from reading or writing someone else's data", async () => {
    await assertFails(getDoc(doc(bob(), 'users/alice')))
    await assertFails(updateDoc(doc(bob(), 'users/alice'), { displayName: 'Hacked' }))
    await assertFails(setDoc(doc(bob(), 'users/alice'), { displayName: 'Hacked' }))
    await assertFails(deleteDoc(doc(bob(), 'users/alice')))
    await assertFails(getDoc(doc(bob(), 'users/alice/accounts/cash')))
    await assertFails(getDocs(collection(bob(), 'users/alice/accounts')))
    await assertFails(setDoc(doc(bob(), 'users/alice/accounts/evil'), { name: 'Evil' }))
    await assertFails(getDoc(doc(bob(), 'users/alice/transactions/t1/notes/n1')))
    await assertFails(deleteDoc(doc(bob(), 'users/alice/accounts/cash')))
  })

  it('denies signed-out users everything', async () => {
    await assertFails(getDoc(doc(anon(), 'users/alice')))
    await assertFails(getDocs(collection(anon(), 'users/alice/accounts')))
    await assertFails(setDoc(doc(anon(), 'users/alice'), { displayName: 'x' }))
    await assertFails(setDoc(doc(anon(), 'users/alice/accounts/a'), { name: 'x' }))
  })

  it('does not let the owner list the users collection', async () => {
    await assertFails(getDocs(collection(alice(), 'users')))
  })
})

describe('default deny', () => {
  it('denies reads and writes outside users/{uid}, even for signed-in users', async () => {
    await assertFails(getDoc(doc(alice(), 'groups/g1')))
    await assertFails(setDoc(doc(alice(), 'groups/g2'), { name: 'New' }))
    await assertFails(getDoc(doc(alice(), 'invites/tok')))
    await assertFails(setDoc(doc(alice(), 'invites/tok2'), { groupId: 'g1' }))
    await assertFails(setDoc(doc(alice(), 'anything/else'), { a: 1 }))
    await assertFails(getDocs(collection(alice(), 'groups')))
  })
})
