import type { Attachment } from './schemas'

/** The document a receipt belongs to. `uid` is always the signed-in user. */
export type ReceiptParent =
  | { kind: 'tx'; uid: string; id: string }
  | { kind: 'group'; uid: string; groupId: string; id: string }

export type JobOp = 'upload' | 'delete'

/**
 * - queued: waiting to run (offline, or retrying after an error)
 * - uploading: in progress
 * - uploaded: a draft's file is in Storage, waiting for its form to be saved
 * - failed: won't be retried automatically
 */
export type JobStatus = 'queued' | 'uploading' | 'uploaded' | 'failed'

/** An upload or delete waiting to happen. Persisted on the device until it has run. */
export interface ReceiptJob {
  id: string
  op: JobOp
  /** The user who queued it; other users' jobs on a shared device are left alone. */
  ownerUid: string
  parent: ReceiptParent
  attachment: Attachment
  /** Part of a form that hasn't been saved: the file is removed again if it never is. */
  draft: boolean
  createdAt: number
}

/** What the UI sees of a job (the file itself stays out of Redux). */
export interface JobView {
  id: string
  op: JobOp
  prefix: string
  attachment: Attachment
  draft: boolean
  status: JobStatus
  /** 0–1. */
  progress: number
  error: string | null
  createdAt: number
}
