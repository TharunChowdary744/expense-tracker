import { readFileSync } from 'node:fs'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, setDoc } from 'firebase/firestore'
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

let env: RulesTestEnvironment

beforeAll(async () => {
  env = await initializeTestEnvironment({
    // Must be the emulators' project: the Storage emulator reads that project's Firestore
    // for cross-service rules.
    projectId: 'demo-ledgerly',
    // Receipts on group paths read the group from Firestore (cross-service rules).
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
    storage: { rules: readFileSync('storage.rules', 'utf8') },
  })
})

afterAll(async () => {
  await env.cleanup()
})

const bytes = (n = 16) => new Uint8Array(n)
const alice = () => env.authenticatedContext('alice').storage()
const bob = () => env.authenticatedContext('bob').storage()
const carol = () => env.authenticatedContext('carol').storage()
const anon = () => env.unauthenticatedContext().storage()
const png_meta = { contentType: 'image/png' }
const jpeg = { contentType: 'image/jpeg' }
const pdf = { contentType: 'application/pdf' }
const MB = 1024 * 1024

/** Puts a file in place without the rules. */
async function seedFile(path: string, contentType = 'image/jpeg') {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await uploadBytes(ref(ctx.storage(), path), bytes(), { contentType })
  })
}

describe('users/{uid}/avatar', () => {
  it('lets the owner upload, read and delete an image', async () => {
    await assertSucceeds(uploadBytes(ref(alice(), 'users/alice/avatar'), bytes(), png_meta))
    await assertSucceeds(getBytes(ref(alice(), 'users/alice/avatar')))
    await assertSucceeds(deleteObject(ref(alice(), 'users/alice/avatar')))
  })

  it('rejects non-images and oversized files', async () => {
    await assertFails(
      uploadBytes(ref(alice(), 'users/alice/avatar'), bytes(), { contentType: 'text/html' }),
    )
    await assertFails(uploadBytes(ref(alice(), 'users/alice/avatar'), bytes(2 * MB + 1), png_meta))
  })

  it('denies other users and signed-out visitors', async () => {
    await seedFile('users/alice/avatar', 'image/png')
    await assertFails(uploadBytes(ref(bob(), 'users/alice/avatar'), bytes(), png_meta))
    await assertFails(getBytes(ref(bob(), 'users/alice/avatar')))
    await assertFails(deleteObject(ref(bob(), 'users/alice/avatar')))
    await assertFails(getBytes(ref(anon(), 'users/alice/avatar')))
    await assertFails(uploadBytes(ref(anon(), 'users/alice/avatar'), bytes(), png_meta))
  })

  it('denies every other path', async () => {
    await assertFails(uploadBytes(ref(alice(), 'users/alice/other'), bytes(), png_meta))
    await assertFails(uploadBytes(ref(alice(), 'users/alice/avatar/nested'), bytes(), png_meta))
    await assertFails(uploadBytes(ref(alice(), 'public/file.png'), bytes(), png_meta))
  })
})

describe('users/{uid}/receipts/{txId}/{fileId}', () => {
  const path = 'users/alice/receipts/tx1/file1'

  it('lets the owner upload photos and PDFs, read and delete them', async () => {
    await assertSucceeds(uploadBytes(ref(alice(), path), bytes(), jpeg))
    await assertSucceeds(getBytes(ref(alice(), path)))
    await assertSucceeds(uploadBytes(ref(alice(), 'users/alice/receipts/tx1/file2'), bytes(), pdf))
    await assertSucceeds(
      uploadBytes(ref(alice(), 'users/alice/receipts/tx1/file3'), bytes(), {
        contentType: 'image/heic',
      }),
    )
    await assertSucceeds(deleteObject(ref(alice(), path)))
  })

  it('accepts exactly 10 MB and rejects anything larger', async () => {
    await assertSucceeds(uploadBytes(ref(alice(), path), bytes(10 * MB), jpeg))
    await assertFails(uploadBytes(ref(alice(), path), bytes(10 * MB + 1), jpeg))
    await assertFails(uploadBytes(ref(alice(), path), bytes(15 * MB), pdf))
  })

  it('rejects other content types', async () => {
    for (const contentType of [
      'application/x-msdownload',
      'application/octet-stream',
      'text/html',
      'image/svg+xml',
      'application/zip',
    ]) {
      await assertFails(uploadBytes(ref(alice(), path), bytes(), { contentType }))
    }
  })

  it('denies other users and signed-out visitors', async () => {
    await seedFile(path)
    await assertFails(getBytes(ref(bob(), path)))
    await assertFails(deleteObject(ref(bob(), path)))
    await assertFails(uploadBytes(ref(bob(), path), bytes(), jpeg))
    await assertFails(uploadBytes(ref(bob(), 'users/alice/receipts/tx1/other'), bytes(), jpeg))
    await assertFails(getBytes(ref(anon(), path)))
  })

  it('denies deeper or shallower paths', async () => {
    await assertFails(uploadBytes(ref(alice(), 'users/alice/receipts/tx1'), bytes(), jpeg))
    await assertFails(uploadBytes(ref(alice(), 'users/alice/receipts/tx1/a/b'), bytes(), jpeg))
  })
})

describe('groups/{groupId}/receipts/{expenseId}/{fileId}', () => {
  const path = 'groups/g1/receipts/e1/file1'

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'groups/g1'), { name: 'Trip', memberIds: ['alice', 'bob'] })
    })
  })

  it('lets a member upload and every member read and delete', async () => {
    await assertSucceeds(uploadBytes(ref(alice(), path), bytes(), jpeg))
    await assertSucceeds(getBytes(ref(bob(), path)))
    await assertSucceeds(getBytes(ref(alice(), path)))
    await assertSucceeds(uploadBytes(ref(bob(), 'groups/g1/receipts/e1/file2'), bytes(), pdf))
    await assertSucceeds(deleteObject(ref(alice(), 'groups/g1/receipts/e1/file2')))
  })

  it('denies non-members and signed-out visitors', async () => {
    await seedFile(path)
    await assertFails(getBytes(ref(carol(), path)))
    await assertFails(deleteObject(ref(carol(), path)))
    await assertFails(uploadBytes(ref(carol(), 'groups/g1/receipts/e1/file3'), bytes(), jpeg))
    await assertFails(getBytes(ref(anon(), path)))
  })

  it('denies a member who has left', async () => {
    await seedFile(path)
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'groups/g1'), { name: 'Trip', memberIds: ['alice'] })
    })
    await assertFails(getBytes(ref(bob(), path)))
    await assertSucceeds(getBytes(ref(alice(), path)))
  })

  it('denies groups that do not exist', async () => {
    await assertFails(uploadBytes(ref(alice(), 'groups/nope/receipts/e1/f'), bytes(), jpeg))
  })

  it('applies the same size and type limits', async () => {
    await assertFails(uploadBytes(ref(alice(), path), bytes(10 * MB + 1), jpeg))
    await assertFails(
      uploadBytes(ref(alice(), path), bytes(), { contentType: 'application/x-msdownload' }),
    )
  })
})
