import { configureStore } from '@reduxjs/toolkit'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { QueueBackend } from './backend'
import type { StoredJob } from './persist'
import {
  cancelUpload,
  commitDrafts,
  discardDrafts,
  enqueueDeletes,
  enqueueUpload,
  localPreviewUrl,
  retryUpload,
  startReceiptQueue,
  stopReceiptQueue,
} from './queue'
import type { Attachment } from './schemas'
import { receiptsReducer } from './slice'
import type { ReceiptParent } from './types'

// An in-memory stand-in for IndexedDB.
const saved = new Map<string, StoredJob>()
vi.mock('./persist', () => ({
  saveJob: (job: StoredJob['job'], blob?: Blob) => {
    saved.set(job.id, blob ? { job, blob } : { job })
    return Promise.resolve()
  },
  removeJob: (id: string) => {
    saved.delete(id)
    return Promise.resolve()
  },
  loadJobs: () => Promise.resolve([...saved.values()]),
}))
vi.mock('./backend', () => ({ firebaseBackend: {} }))

interface FakeUpload {
  path: string
  resolve: () => void
  reject: (error: unknown) => void
  progress: (p: number) => void
  cancelled: boolean
}

function fakeBackend() {
  const uploads: FakeUpload[] = []
  const removed: string[] = []
  const referenced = new Set<string>()
  const backend: QueueBackend = {
    upload(path, _blob, _type, onProgress) {
      let entry!: FakeUpload
      const promise = new Promise<void>((resolve, reject) => {
        entry = { path, resolve, reject, progress: onProgress, cancelled: false }
      })
      uploads.push(entry)
      return {
        promise,
        cancel: () => {
          entry.cancelled = true
          entry.reject({ code: 'storage/canceled' })
        },
      }
    },
    remove: vi.fn((path: string) => {
      removed.push(path)
      return Promise.resolve()
    }),
    isReferenced: (_parent, path) => Promise.resolve(referenced.has(path)),
  }
  return { backend, uploads, removed, referenced }
}

const parent: ReceiptParent = { kind: 'tx', uid: 'u1', id: 't1' }
const att = (name: string): Attachment => ({
  path: `users/u1/receipts/t1/${name}`,
  name: `${name}.jpg`,
  contentType: 'image/jpeg',
  size: 3,
})
const blob = () => new Blob(['abc'], { type: 'image/jpeg' })
const flush = () => new Promise((r) => setTimeout(r, 0))

function setup() {
  const store = configureStore({ reducer: { receipts: receiptsReducer } })
  const fake = fakeBackend()
  startReceiptQueue(store.dispatch, 'u1', fake.backend)
  const jobs = () => Object.values(store.getState().receipts.jobs)
  return { store, jobs, ...fake }
}

function setOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online })
  window.dispatchEvent(new Event(online ? 'online' : 'offline'))
}

beforeEach(() => {
  saved.clear()
  setOnline(true)
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }),
  )
})

afterEach(() => {
  stopReceiptQueue()
  vi.useRealTimers()
})

describe('receipt queue', () => {
  it('uploads a file, reports progress and keeps it when the document lists it', async () => {
    const { uploads, jobs, removed, referenced } = setup()
    referenced.add(att('a').path)
    enqueueUpload(parent, att('a'), blob(), { draft: false })
    await flush()
    expect(uploads).toHaveLength(1)
    expect(saved.size).toBe(1)
    uploads[0]?.progress(0.5)
    expect(jobs()[0]).toMatchObject({ status: 'uploading', progress: 0.5 })
    expect(localPreviewUrl(att('a').path)).toBe('blob:x')
    uploads[0]?.resolve()
    await flush()
    await flush()
    expect(jobs()).toEqual([])
    expect(saved.size).toBe(0)
    expect(removed).toEqual([])
  })

  it('deletes an uploaded file its document no longer lists', async () => {
    const { uploads, removed } = setup()
    enqueueUpload(parent, att('a'), blob(), { draft: false })
    await flush()
    uploads[0]?.resolve()
    await flush()
    await flush()
    await flush()
    expect(removed).toEqual([att('a').path])
  })

  it('waits while offline and uploads when back online', async () => {
    const { uploads, jobs } = setup()
    setOnline(false)
    enqueueUpload(parent, att('a'), blob(), { draft: false })
    await flush()
    expect(uploads).toHaveLength(0)
    expect(jobs()[0]?.status).toBe('queued')
    setOnline(true)
    await flush()
    expect(uploads).toHaveLength(1)
  })

  it('restarts an upload interrupted by going offline', async () => {
    const { uploads, jobs } = setup()
    enqueueUpload(parent, att('a'), blob(), { draft: false })
    await flush()
    setOnline(false)
    await flush()
    expect(uploads[0]?.cancelled).toBe(true)
    expect(jobs()[0]?.status).toBe('queued')
    setOnline(true)
    await flush()
    expect(uploads).toHaveLength(2)
  })

  it('retries network errors with backoff, then gives up and allows a manual retry', async () => {
    vi.useFakeTimers()
    const { uploads, jobs } = setup()
    enqueueUpload(parent, att('a'), blob(), { draft: false })
    for (let attempt = 1; attempt <= 6; attempt++) {
      await vi.advanceTimersByTimeAsync(60_000)
      expect(uploads).toHaveLength(attempt)
      uploads[attempt - 1]?.reject({ code: 'storage/retry-limit-exceeded' })
      await vi.advanceTimersByTimeAsync(0)
    }
    expect(jobs()[0]).toMatchObject({ status: 'failed', error: 'Upload failed.' })
    retryUpload(att('a').path)
    await vi.advanceTimersByTimeAsync(0)
    expect(uploads).toHaveLength(7)
  })

  it('fails at once when the rules refuse the file', async () => {
    const { uploads, jobs } = setup()
    enqueueUpload(parent, att('a'), blob(), { draft: false })
    await flush()
    uploads[0]?.reject({ code: 'storage/unauthorized' })
    await flush()
    expect(jobs()[0]?.status).toBe('failed')
    expect(jobs()[0]?.error).toMatch(/not allowed/)
  })

  it('cancels a running upload and deletes whatever reached Storage', async () => {
    const { uploads, jobs, removed } = setup()
    enqueueUpload(parent, att('a'), blob(), { draft: false })
    await flush()
    expect(cancelUpload(att('a').path)).toBe(true)
    await flush()
    expect(uploads[0]?.cancelled).toBe(true)
    expect(removed).toEqual([att('a').path])
    expect(jobs()).toEqual([])
  })

  it('commits a saved form’s drafts and deletes an abandoned form’s files', async () => {
    const { uploads, jobs, removed, referenced } = setup()
    const other: ReceiptParent = { kind: 'tx', uid: 'u1', id: 't2' }
    const otherAtt = { ...att('b'), path: 'users/u1/receipts/t2/b' }
    referenced.add(att('a').path)
    enqueueUpload(parent, att('a'), blob(), { draft: true })
    enqueueUpload(other, otherAtt, blob(), { draft: true })
    await flush()
    uploads[0]?.resolve()
    await flush()
    expect(jobs().find((j) => j.attachment.path === att('a').path)?.status).toBe('uploaded')

    commitDrafts('users/u1/receipts/t1/')
    expect(jobs().map((j) => j.attachment.path)).toEqual([otherAtt.path])

    discardDrafts('users/u1/receipts/t2/')
    await flush()
    expect(uploads[1]?.cancelled).toBe(true)
    await flush()
    expect(removed).toEqual([otherAtt.path])
  })

  it('deletes a deleted transaction’s files and stops their uploads', async () => {
    const { uploads, removed } = setup()
    enqueueUpload(parent, att('a'), blob(), { draft: false })
    await flush()
    enqueueDeletes(parent, [att('a'), att('b')])
    await flush()
    await flush()
    expect(uploads[0]?.cancelled).toBe(true)
    expect(removed).toEqual([att('a').path, att('b').path])
  })

  it('treats an already-missing file as deleted', async () => {
    const { backend, jobs } = setup()
    vi.mocked(backend.remove).mockRejectedValueOnce({ code: 'storage/object-not-found' })
    enqueueDeletes(parent, [att('a')])
    await flush()
    await flush()
    expect(jobs()).toEqual([])
  })

  it('resumes saved jobs after a reload, removing files of forms never saved', async () => {
    const first = setup()
    setOnline(false)
    enqueueUpload(parent, att('a'), blob(), { draft: false })
    enqueueUpload(parent, att('b'), blob(), { draft: true })
    await flush()
    stopReceiptQueue()
    expect(saved.size).toBe(2)
    expect(first.uploads).toHaveLength(0)

    setOnline(true)
    const second = setup()
    await flush()
    await flush()
    expect(second.uploads.map((u) => u.path)).toEqual([att('a').path])
    second.uploads[0]?.resolve()
    await flush()
    await flush()
    await flush()
    await flush()
    // a was not listed on its document (nothing is, in this fake), so it is removed too.
    expect(second.removed).toContain(att('b').path)
  })

  it('leaves other users’ jobs alone', async () => {
    saved.set('upload:x', {
      job: {
        id: 'upload:x',
        op: 'upload',
        ownerUid: 'someone-else',
        parent,
        attachment: att('x'),
        draft: false,
        createdAt: 1,
      },
      blob: blob(),
    })
    const { uploads } = setup()
    await flush()
    await flush()
    expect(uploads).toHaveLength(0)
    expect(saved.has('upload:x')).toBe(true)
  })
})
