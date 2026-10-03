import type { ReceiptJob } from './types'

/**
 * Keeps queued receipt jobs (and the files to upload) in IndexedDB, so uploads made offline
 * survive a reload and run when the device is back online. Everything here is best effort:
 * without IndexedDB (private windows in some browsers, tests) the queue still works for the
 * current session.
 */

const DB_NAME = 'ledgerly-receipts'
const STORE = 'jobs'

export interface StoredJob {
  job: ReceiptJob
  blob?: Blob
}

let dbPromise: Promise<IDBDatabase | null> | undefined

function openDb(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null)
    try {
      const request = indexedDB.open(DB_NAME, 1)
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'job.id' })
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
      request.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return dbPromise
}

async function run<T>(
  mode: IDBTransactionMode,
  body: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | undefined> {
  const db = await openDb()
  if (!db) return undefined
  return new Promise((resolve) => {
    try {
      const request = body(db.transaction(STORE, mode).objectStore(STORE))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => {
        console.warn('[receipts] could not update the offline queue', request.error)
        resolve(undefined)
      }
    } catch (error) {
      console.warn('[receipts] could not update the offline queue', error)
      resolve(undefined)
    }
  })
}

export async function saveJob(job: ReceiptJob, blob?: Blob): Promise<void> {
  const record: StoredJob = blob ? { job, blob } : { job }
  await run('readwrite', (store) => store.put(record))
}

export async function removeJob(id: string): Promise<void> {
  await run('readwrite', (store) => store.delete(id))
}

export async function loadJobs(): Promise<StoredJob[]> {
  return ((await run('readonly', (store) => store.getAll())) as StoredJob[] | undefined) ?? []
}
