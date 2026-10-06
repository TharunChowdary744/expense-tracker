import type { UnknownAction } from '@reduxjs/toolkit'
import { firebaseBackend, type QueueBackend } from '@/features/receipts/backend'
import type { Attachment } from '@/features/receipts/schemas'
import {
  connectivityChanged,
  jobProgressed,
  jobRemoved,
  jobUpserted,
  jobsCleared,
} from '@/features/receipts/slice'
import type { JobStatus, ReceiptJob, ReceiptParent } from '@/features/receipts/types'
import { deleteJobId, receiptPrefix, uploadJobId } from '@/features/receipts/utils'
import { isOnline as deviceOnline, onConnectivityChange } from '@m/lib/connectivity'
import { readFileBlob } from '@m/utils/files'
import { keepFile, loadJobs, removeJob, saveJob } from './persist'

/**
 * React Native version of the web app's receipt queue (same exports and behaviour). Files are
 * local URIs instead of Blobs: each one is copied into the app's documents folder when queued
 * (./persist.ts), so it survives the picker's temporary cache being cleared, and read into a
 * Blob only when it uploads. Connectivity comes from NetInfo instead of window events.
 *
 * The receipt queue: uploads and deletes of receipt files, run one at a time while online.
 *
 * Jobs (and the files to upload) are kept on the device until they have run, so work queued
 * offline or interrupted by a reload carries on later. Failed network calls are retried with
 * backoff. A draft upload belongs to a form that hasn't been saved yet: saving commits it,
 * closing the form (or reloading the page) deletes the file again.
 *
 * The Redux `receipts` slice mirrors the jobs for the UI.
 */

type Dispatch = (action: UnknownAction) => unknown

interface Entry {
  job: ReceiptJob
  status: JobStatus
  progress: number
  error: string | null
  attempts: number
  retryAt: number
}

/** Uploads give up (and wait for the user) after this many failed tries. */
export const MAX_UPLOAD_ATTEMPTS = 6
const MAX_DELETE_ATTEMPTS = 12
const BASE_DELAY_MS = 2000
const MAX_DELAY_MS = 60_000

const PERMANENT = new Set([
  'storage/unauthorized',
  'storage/quota-exceeded',
  'storage/invalid-argument',
  'storage/invalid-checksum',
  'storage/cannot-slice-blob',
  'storage/server-file-wrong-size',
])

let dispatch: Dispatch | null = null
let ownerUid: string | null = null
let backend: QueueBackend = firebaseBackend
/** Bumped on every start and stop, so work from an earlier session is ignored. */
let generation = 0
const entries = new Map<string, Entry>()
/** Local file URIs by Storage path: what to upload, and local previews. */
const files = new Map<string, string>()
let unsubscribeConnectivity: (() => void) | null = null
let pumping = false
let current: { id: string; cancel: () => void } | null = null
let wakeTimer: ReturnType<typeof setTimeout> | undefined

const isOnline = () => deviceOnline()

function errorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code
  return typeof code === 'string' ? code : ''
}

function uploadErrorMessage(code: string): string {
  if (code === 'storage/unauthorized') {
    return 'Upload not allowed. Only photos and PDFs up to 10 MB can be attached, by people with access.'
  }
  if (code === 'storage/quota-exceeded') return 'Storage is full, so the file wasn’t uploaded.'
  return 'Upload failed.'
}

function publish(entry: Entry) {
  dispatch?.(
    jobUpserted({
      id: entry.job.id,
      op: entry.job.op,
      prefix: receiptPrefix(entry.job.parent),
      attachment: entry.job.attachment,
      draft: entry.job.draft,
      status: entry.status,
      progress: entry.progress,
      error: entry.error,
      createdAt: entry.job.createdAt,
    }),
  )
}

function add(job: ReceiptJob, uri?: string, persist = true) {
  const entry: Entry = { job, status: 'queued', progress: 0, error: null, attempts: 0, retryAt: 0 }
  entries.set(job.id, entry)
  if (uri) files.set(job.attachment.path, uri)
  if (persist) void saveJob(job, uri)
  publish(entry)
  void pump()
}

function finish(entry: Entry) {
  entries.delete(entry.job.id)
  void removeJob(entry.job.id)
  dispatch?.(jobRemoved(entry.job.id))
}

function nextReady(now: number): Entry | undefined {
  for (const entry of entries.values()) {
    if (entry.status === 'queued' && entry.retryAt <= now) return entry
  }
  return undefined
}

function scheduleWake(now: number) {
  clearTimeout(wakeTimer)
  let soonest = Infinity
  for (const e of entries.values())
    if (e.status === 'queued') soonest = Math.min(soonest, e.retryAt)
  if (soonest !== Infinity) wakeTimer = setTimeout(() => void pump(), Math.max(0, soonest - now))
}

async function pump(): Promise<void> {
  if (pumping) return
  pumping = true
  try {
    for (;;) {
      if (!dispatch || !isOnline()) return
      const now = Date.now()
      const entry = nextReady(now)
      if (!entry) return scheduleWake(now)
      await run(entry)
    }
  } finally {
    pumping = false
  }
}

async function run(entry: Entry) {
  const gen = generation
  const { job } = entry
  const live = () => gen === generation && entries.get(job.id) === entry

  try {
    if (job.op === 'upload') {
      const uri = files.get(job.attachment.path)
      const blob = uri ? await readFileBlob(uri).catch(() => null) : null
      if (!blob) {
        entry.status = 'failed'
        entry.error = 'This file is no longer on this device. Remove it and attach it again.'
        publish(entry)
        return
      }
      entry.status = 'uploading'
      entry.progress = 0
      entry.error = null
      publish(entry)
      const task = backend.upload(job.attachment.path, blob, job.attachment.contentType, (p) => {
        if (!live()) return
        entry.progress = p
        dispatch?.(jobProgressed({ id: job.id, progress: p }))
      })
      current = { id: job.id, cancel: task.cancel }
      try {
        await task.promise
      } finally {
        current = null
      }
    } else {
      await backend.remove(job.attachment.path)
    }
  } catch (error) {
    if (!live()) return
    const code = errorCode(error)
    if (job.op === 'delete' && code === 'storage/object-not-found') return finish(entry)
    if (code === 'storage/canceled') {
      // Paused because the device went offline; it starts again when back online.
      entry.status = 'queued'
      entry.progress = 0
      publish(entry)
      return
    }
    entry.attempts += 1
    const max = job.op === 'upload' ? MAX_UPLOAD_ATTEMPTS : MAX_DELETE_ATTEMPTS
    if (PERMANENT.has(code) || entry.attempts >= max) {
      console.warn(`[receipts] ${job.op} of ${job.attachment.path} failed`, error)
      if (job.op === 'delete') return finish(entry)
      entry.status = 'failed'
      entry.error = uploadErrorMessage(code)
      publish(entry)
      return
    }
    entry.status = 'queued'
    entry.retryAt = Date.now() + Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (entry.attempts - 1))
    entry.error = job.op === 'upload' ? 'Upload interrupted. Retrying…' : null
    publish(entry)
    return
  }

  if (!live()) return
  if (job.op === 'upload' && job.draft) {
    entry.status = 'uploaded'
    entry.progress = 1
    entry.error = null
    publish(entry)
    return
  }
  if (job.op === 'upload') await removeIfOrphaned(job)
  if (live()) finish(entry)
}

/** After an upload, deletes the file if its transaction or expense no longer lists it. */
async function removeIfOrphaned(job: ReceiptJob) {
  let referenced = true
  try {
    referenced = await backend.isReferenced(job.parent, job.attachment.path)
  } catch {
    // Can't tell (e.g. offline again): keep the file.
  }
  if (!referenced) queueDelete(job.parent, job.attachment)
}

function queueDelete(parent: ReceiptParent, attachment: Attachment) {
  if (!ownerUid) return
  const id = deleteJobId(attachment.path)
  if (entries.has(id)) return
  add({ id, op: 'delete', ownerUid, parent, attachment, draft: false, createdAt: Date.now() })
}

function onOnline() {
  dispatch?.(connectivityChanged(true))
  void pump()
}

function onOffline() {
  dispatch?.(connectivityChanged(false))
  // Stop the running upload; it is retried from the start when the device is back online.
  current?.cancel()
}

// ---------------------------------------------------------------------------------------------
// Public API

/**
 * Starts the queue for a signed-in user: restores their saved jobs (unsaved drafts from an
 * earlier visit become deletes) and runs them while online. Returns a stop function.
 */
export function startReceiptQueue(
  d: Dispatch,
  uid: string,
  b: QueueBackend = firebaseBackend,
): () => void {
  stopReceiptQueue()
  dispatch = d
  ownerUid = uid
  backend = b
  const gen = generation
  d(connectivityChanged(isOnline()))
  unsubscribeConnectivity = onConnectivityChange((online) => (online ? onOnline() : onOffline()))

  void loadJobs().then((stored) => {
    if (gen !== generation) return
    for (const { job, uri } of stored) {
      if (job.ownerUid !== uid || entries.has(job.id)) continue
      if (job.draft) {
        // The form was never saved: remove the file if it got uploaded.
        void removeJob(job.id)
        queueDelete(job.parent, job.attachment)
      } else {
        add(job, uri, false)
      }
    }
  })
  return stopReceiptQueue
}

/** Stops the queue (sign-out). Saved jobs stay on the device for the next session. */
export function stopReceiptQueue() {
  if (!dispatch) return
  generation += 1
  current?.cancel()
  current = null
  clearTimeout(wakeTimer)
  unsubscribeConnectivity?.()
  unsubscribeConnectivity = null
  entries.clear()
  files.clear()
  dispatch(jobsCleared())
  dispatch = null
  ownerUid = null
}

/**
 * Queues a prepared local file (URI) for upload to `attachment.path`. `draft`: the parent
 * document doesn't list it yet (the form is still open).
 */
export function enqueueUpload(
  parent: ReceiptParent,
  attachment: Attachment,
  uri: string,
  { draft }: { draft: boolean },
) {
  if (!ownerUid) return
  const kept = keepFile(uploadJobId(attachment.path), uri)
  add(
    {
      id: uploadJobId(attachment.path),
      op: 'upload',
      ownerUid,
      parent,
      attachment,
      draft,
      createdAt: Date.now(),
    },
    kept,
  )
}

/**
 * Stops an upload. If the file may already be in Storage, it is deleted. Returns false when
 * there was no such upload.
 */
export function cancelUpload(path: string): boolean {
  const id = uploadJobId(path)
  const entry = entries.get(id)
  if (!entry) return false
  const mayExist = entry.status === 'uploading' || entry.status === 'uploaded'
  if (current?.id === id) current.cancel()
  finish(entry)
  if (mayExist) queueDelete(entry.job.parent, entry.job.attachment)
  return true
}

/** Deletes files from Storage (stopping any upload of them first). */
export function enqueueDeletes(parent: ReceiptParent, attachments: readonly Attachment[]) {
  for (const attachment of attachments) {
    cancelUpload(attachment.path)
    queueDelete(parent, attachment)
  }
}

/** The form was saved: its draft uploads now belong to the saved document. */
export function commitDrafts(prefix: string) {
  for (const entry of [...entries.values()]) {
    if (!entry.job.draft || receiptPrefix(entry.job.parent) !== prefix) continue
    entry.job = { ...entry.job, draft: false }
    if (entry.status === 'failed') {
      // Not listed on the saved document, so there is nothing to finish.
      finish(entry)
    } else if (entry.status === 'uploaded') {
      finish(entry)
    } else {
      void saveJob(entry.job, files.get(entry.job.attachment.path))
      publish(entry)
    }
  }
}

/** The form was closed without saving: drop its uploads and delete what got uploaded. */
export function discardDrafts(prefix: string) {
  for (const entry of [...entries.values()]) {
    if (entry.job.draft && receiptPrefix(entry.job.parent) === prefix) {
      cancelUpload(entry.job.attachment.path)
    }
  }
}

/** Tries a failed upload again. */
export function retryUpload(path: string) {
  const entry = entries.get(uploadJobId(path))
  if (!entry || entry.status !== 'failed') return
  entry.status = 'queued'
  entry.attempts = 0
  entry.retryAt = 0
  entry.error = null
  publish(entry)
  void pump()
}

/** A local URI for showing `path` from the file itself, if it was attached on this device. */
export function localPreviewUrl(path: string): string | undefined {
  return files.get(path)
}
