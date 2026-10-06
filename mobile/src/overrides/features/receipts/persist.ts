import AsyncStorage from '@react-native-async-storage/async-storage'
import { Directory, File, Paths } from 'expo-file-system'
import type { ReceiptJob } from '@/features/receipts/types'

/**
 * Keeps queued receipt jobs on the device (AsyncStorage) with a copy of each file to upload in
 * the app's documents folder, so uploads made offline survive the app being closed. Best
 * effort, like the web app's IndexedDB version: if storage fails the queue still works for the
 * current session.
 */
const KEY = 'receipts:jobs'

export interface StoredJob {
  job: ReceiptJob
  /** Local copy of the file to upload. */
  uri?: string
}

function folder(): Directory {
  const dir = new Directory(Paths.document, 'receipt-queue')
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true })
  return dir
}

/** Copies a picked file into the queue folder and returns the copy's URI (or the original). */
export function keepFile(jobId: string, uri: string): string {
  try {
    const source = new File(uri)
    const ext = source.extension || ''
    const target = new File(folder(), `${jobId.replace(/[^\w.-]+/g, '_')}${ext}`)
    if (target.exists) target.delete()
    source.copySync(target)
    return target.uri
  } catch {
    return uri
  }
}

async function readAll(): Promise<Record<string, StoredJob>> {
  try {
    const raw = await AsyncStorage.getItem(KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, StoredJob>) : {}
  } catch {
    return {}
  }
}

let chain: Promise<unknown> = Promise.resolve()

/** Runs read-modify-write updates one at a time so concurrent saves don't overwrite each other. */
function update(change: (jobs: Record<string, StoredJob>) => void): Promise<void> {
  const next = chain.then(async () => {
    const jobs = await readAll()
    change(jobs)
    await AsyncStorage.setItem(KEY, JSON.stringify(jobs))
  })
  chain = next.catch(() => undefined)
  return next.catch((error: unknown) => {
    console.warn('[receipts] could not update the offline queue', error)
  })
}

export function saveJob(job: ReceiptJob, uri?: string): Promise<void> {
  return update((jobs) => {
    jobs[job.id] = uri ? { job, uri } : { job }
  })
}

export function removeJob(id: string): Promise<void> {
  return update((jobs) => {
    delete jobs[id]
  })
}

export async function loadJobs(): Promise<StoredJob[]> {
  const jobs = Object.values(await readAll())
  // Remove copies no saved job needs any more (finished uploads from earlier sessions).
  try {
    const keep = new Set(jobs.map((j) => j.uri).filter(Boolean))
    for (const entry of folder().list()) {
      if (entry instanceof File && !keep.has(entry.uri)) entry.delete()
    }
  } catch {
    // Clean-up is optional.
  }
  return jobs
}
