import { AlertCircle, CloudOff, FileText, ImageOff, Loader2, RotateCw, X } from 'lucide-react'
import { useReceiptSrc } from '../hooks/useReceiptSrc'
import type { Attachment } from '../schemas'
import type { JobView } from '../types'
import { formatBytes, isPdfType } from '../utils'

interface Props {
  attachment: Attachment
  /** The upload of this file, while it is queued or running on this device. */
  job?: JobView
  online: boolean
  onOpen: () => void
  /** Deletes the file, or cancels its upload. */
  onRemove: () => void
  onRetry: () => void
}

function statusText(job: JobView | undefined, online: boolean): string | null {
  if (!job || job.status === 'uploaded') return null
  if (job.status === 'failed') return job.error ?? 'Upload failed.'
  if (job.status === 'uploading') return `Uploading ${Math.round(job.progress * 100)}%`
  if (!online) return 'Waiting for connection'
  return job.error ?? 'Waiting to upload'
}

/** One file in the strip: a thumbnail (or PDF tile), its upload state and a remove button. */
export function AttachmentThumb({ attachment, job, online, onOpen, onRemove, onRetry }: Props) {
  const pdf = isPdfType(attachment.contentType)
  const { src, missing, error } = useReceiptSrc(attachment.path)
  const status = statusText(job, online)
  const inFlight = job !== undefined && job.status !== 'uploaded' && job.status !== 'failed'
  const label = `${attachment.name} (${pdf ? 'PDF' : 'image'}, ${formatBytes(attachment.size)})`

  const preview = pdf ? (
    <span className="flex size-full flex-col items-center justify-center gap-1 p-1 text-muted-foreground">
      <FileText className="size-6" aria-hidden />
      <span className="line-clamp-2 text-center text-[10px] leading-tight break-all">
        {attachment.name}
      </span>
    </span>
  ) : src ? (
    <img src={src} alt="" className="size-full object-cover" loading="lazy" decoding="async" />
  ) : (
    <span className="flex size-full items-center justify-center text-muted-foreground">
      {missing || error ? (
        <ImageOff className="size-6" aria-hidden />
      ) : (
        <Loader2 className="size-5 animate-spin" aria-hidden />
      )}
    </span>
  )

  const tileClass =
    'block size-20 overflow-hidden rounded-md border bg-muted outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'

  return (
    <li className="w-20 shrink-0 space-y-1">
      <div className="relative">
        {pdf && src ? (
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className={tileClass}
            aria-label={`Open ${label} in a new tab`}
          >
            {preview}
          </a>
        ) : (
          <button
            type="button"
            className={tileClass}
            onClick={onOpen}
            disabled={pdf || !src}
            aria-label={pdf ? `${label}, not available yet` : `View ${label}`}
          >
            {preview}
          </button>
        )}
        {job?.status === 'uploading' && (
          <span
            className="absolute inset-x-1 bottom-1 h-1.5 overflow-hidden rounded-full bg-black/40"
            role="progressbar"
            aria-label={`Uploading ${attachment.name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(job.progress * 100)}
          >
            <span
              className="block h-full bg-primary transition-[width]"
              style={{ width: `${Math.round(job.progress * 100)}%` }}
            />
          </span>
        )}
        {job?.status === 'queued' && (
          <span className="absolute bottom-1 left-1 rounded bg-black/60 p-0.5 text-white">
            <CloudOff className="size-3.5" aria-hidden />
          </span>
        )}
        <button
          type="button"
          onClick={onRemove}
          aria-label={
            inFlight ? `Cancel upload of ${attachment.name}` : `Delete ${attachment.name}`
          }
          className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full border bg-background text-foreground shadow-sm outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
      {job?.status === 'failed' ? (
        <div className="space-y-0.5">
          <p className="flex items-start gap-1 text-[11px] leading-tight text-destructive">
            <AlertCircle className="mt-px size-3 shrink-0" aria-hidden />
            <span>{status}</span>
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1 rounded text-[11px] font-medium text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <RotateCw className="size-3" aria-hidden />
            Retry
          </button>
        </div>
      ) : status ? (
        <p className="text-[11px] leading-tight text-muted-foreground">{status}</p>
      ) : missing && !job ? (
        <p className="text-[11px] leading-tight text-muted-foreground">Not uploaded yet</p>
      ) : error ? (
        <p className="text-[11px] leading-tight text-destructive">{error}</p>
      ) : null}
    </li>
  )
}
