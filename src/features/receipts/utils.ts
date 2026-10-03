import {
  MAX_ATTACHMENTS,
  MAX_FILE_BYTES,
  NAME_MAX,
  attachmentsField,
  type Attachment,
} from './schemas'
import type { ReceiptParent } from './types'

/** Where a parent's files live in Storage, ending in "/". */
export function receiptPrefix(parent: ReceiptParent): string {
  return parent.kind === 'tx'
    ? `users/${parent.uid}/receipts/${parent.id}/`
    : `groups/${parent.groupId}/receipts/${parent.id}/`
}

/** The Firestore document that lists a parent's attachments. */
export function parentDocPath(parent: ReceiptParent): string {
  return parent.kind === 'tx'
    ? `users/${parent.uid}/transactions/${parent.id}`
    : `groups/${parent.groupId}/expenses/${parent.id}`
}

export const uploadJobId = (path: string) => `upload:${path}`
export const deleteJobId = (path: string) => `delete:${path}`

const HEIC_TYPES = ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence']

/** iPhone photos. Some browsers leave the type empty, so the extension counts too. */
export function isHeic(file: Pick<File, 'name' | 'type'>): boolean {
  return HEIC_TYPES.includes(file.type.toLowerCase()) || /\.(heic|heif)$/i.test(file.name)
}

export function isPdfType(contentType: string): boolean {
  return contentType === 'application/pdf'
}

/** Content types the Storage rules accept (SVG is left out: it can carry scripts). */
export function isAllowedType(contentType: string): boolean {
  const type = contentType.toLowerCase()
  return isPdfType(type) || (/^image\/[-+.\w]+$/.test(type) && type !== 'image/svg+xml')
}

/** The content type to treat a picked file as, or null if it can't be attached. */
export function effectiveType(file: Pick<File, 'name' | 'type'>): string | null {
  if (isHeic(file)) return 'image/heic'
  if (!file.type && /\.pdf$/i.test(file.name)) return 'application/pdf'
  return isAllowedType(file.type) ? file.type.toLowerCase() : null
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Why a picked file can't be attached, or null when it can. */
export function fileProblem(file: Pick<File, 'name' | 'type' | 'size'>): string | null {
  if (!effectiveType(file)) {
    return `“${file.name}” isn’t a photo or PDF. Attach images or PDF files only.`
  }
  if (file.size > MAX_FILE_BYTES) {
    return `“${file.name}” is ${formatBytes(file.size)}. Files must be 10 MB or smaller.`
  }
  if (file.size === 0) return `“${file.name}” is empty.`
  return null
}

/**
 * Splits picked files into those to attach and messages for the rest, given how many are
 * already attached (at most MAX_ATTACHMENTS in all).
 */
export function screenFiles<F extends Pick<File, 'name' | 'type' | 'size'>>(
  files: readonly F[],
  existing: number,
): { accepted: F[]; problems: string[] } {
  const accepted: F[] = []
  const problems: string[] = []
  let skipped = 0
  for (const file of files) {
    const problem = fileProblem(file)
    if (problem) problems.push(problem)
    else if (existing + accepted.length >= MAX_ATTACHMENTS) skipped += 1
    else accepted.push(file)
  }
  if (skipped > 0) {
    problems.push(
      `You can attach up to ${MAX_ATTACHMENTS} files. ${skipped === 1 ? '1 file was' : `${skipped} files were`} not added.`,
    )
  }
  return { accepted, problems }
}

/** A file name to store: trimmed, at most NAME_MAX characters, with `ext` if given. */
export function storedName(name: string, ext?: string): string {
  let base = name.trim() || 'receipt'
  if (ext) base = `${base.replace(/\.[^./]+$/, '')}.${ext}`
  if (base.length <= NAME_MAX) return base
  const dot = base.lastIndexOf('.')
  const suffix = dot > 0 && base.length - dot <= 10 ? base.slice(dot) : ''
  return base.slice(0, NAME_MAX - suffix.length) + suffix
}

/** Saved attachments followed by those still uploading, one entry per path. */
export function mergeAttachments(
  saved: readonly Attachment[],
  pending: readonly Attachment[],
): Attachment[] {
  const seen = new Set(saved.map((a) => a.path))
  return [...saved, ...pending.filter((a) => !seen.has(a.path))]
}

/**
 * The valid attachments in `list` whose files are under `prefix` (others belong to another
 * user or document, e.g. in a backup restored into a different account).
 */
export function attachmentsUnder(list: unknown, prefix: string): Attachment[] {
  return attachmentsField
    .parse(list)
    .filter((a) => a.path.startsWith(prefix) && !a.path.slice(prefix.length).includes('/'))
    .slice(0, MAX_ATTACHMENTS)
}
