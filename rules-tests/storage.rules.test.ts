import { readFileSync } from 'node:fs'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage'
import { afterAll, beforeAll, describe, it } from 'vitest'

let env: RulesTestEnvironment

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-ledgerly-storage-rules',
    storage: { rules: readFileSync('storage.rules', 'utf8') },
  })
})

afterAll(async () => {
  await env.cleanup()
})

const png = (bytes = 16) => new Uint8Array(bytes)
const alice = () => env.authenticatedContext('alice').storage()
const bob = () => env.authenticatedContext('bob').storage()
const anon = () => env.unauthenticatedContext().storage()
const png_meta = { contentType: 'image/png' }

describe('users/{uid}/avatar', () => {
  it('lets the owner upload, read and delete an image', async () => {
    await assertSucceeds(uploadBytes(ref(alice(), 'users/alice/avatar'), png(), png_meta))
    await assertSucceeds(getBytes(ref(alice(), 'users/alice/avatar')))
    await assertSucceeds(deleteObject(ref(alice(), 'users/alice/avatar')))
  })

  it('rejects non-images and oversized files', async () => {
    await assertFails(
      uploadBytes(ref(alice(), 'users/alice/avatar'), png(), { contentType: 'text/html' }),
    )
    await assertFails(
      uploadBytes(ref(alice(), 'users/alice/avatar'), png(2 * 1024 * 1024 + 1), png_meta),
    )
  })

  it('denies other users and signed-out visitors', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), 'users/alice/avatar'), png(), png_meta)
    })
    await assertFails(uploadBytes(ref(bob(), 'users/alice/avatar'), png(), png_meta))
    await assertFails(getBytes(ref(bob(), 'users/alice/avatar')))
    await assertFails(deleteObject(ref(bob(), 'users/alice/avatar')))
    await assertFails(getBytes(ref(anon(), 'users/alice/avatar')))
    await assertFails(uploadBytes(ref(anon(), 'users/alice/avatar'), png(), png_meta))
  })

  it('denies every other path', async () => {
    await assertFails(uploadBytes(ref(alice(), 'users/alice/other'), png(), png_meta))
    await assertFails(uploadBytes(ref(alice(), 'users/alice/avatar/nested'), png(), png_meta))
    await assertFails(uploadBytes(ref(alice(), 'public/file.png'), png(), png_meta))
  })
})
