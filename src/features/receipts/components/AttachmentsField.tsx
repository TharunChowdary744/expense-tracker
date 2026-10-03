import { nanoid } from '@reduxjs/toolkit'
import { Camera, Loader2, Paperclip, X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react'
import { useAppSelector } from '@/app/hooks'
import { MOBILE_QUERY, useMediaQuery } from '@/app/useMediaQuery'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Button } from '@/components/ui/button'
import {
  useAddAttachmentsMutation,
  useGetAttachmentsQuery,
  useRemoveAttachmentMutation,
} from '../api'
import { PrepareError, prepareFile } from '../compress'
import { cancelUpload, discardDrafts, enqueueUpload, retryUpload } from '../queue'
import { MAX_ATTACHMENTS, MAX_FILE_BYTES, type Attachment } from '../schemas'
import { selectUploadsFor } from '../slice'
import type { ReceiptParent } from '../types'
import { fileProblem, isPdfType, mergeAttachments, receiptPrefix, screenFiles } from '../utils'
import { AttachmentThumb } from './AttachmentThumb'
import { Lightbox } from './Lightbox'

/** Accepted by the file pickers; the checks in utils.ts have the final say. */
const ACCEPT = 'image/*,application/pdf,.pdf,.heic,.heif'

interface Props {
  parent: ReceiptParent
  /**
   * "saved": the document exists; files are listed on it as soon as they are added or removed.
   * "draft": a new document; files upload now and are listed on it when the form saves (see
   * `draftAttachments`). Closing the form without saving deletes them again.
   */
  mode: 'saved' | 'draft'
  /** Tells the form whether files are still being prepared, so it can wait before saving. */
  onBusyChange?: (busy: boolean) => void
}

interface Preparing {
  id: string
  name: string
  abort: AbortController
}

/** The receipts section of the transaction and group expense forms. */
export function AttachmentsField({ parent, mode, onBusyChange }: Props) {
  const fieldId = useId()
  const prefix = receiptPrefix(parent)
  const isMobile = useMediaQuery(MOBILE_QUERY)
  const online = useAppSelector((s) => s.receipts.online)
  const uploads = useAppSelector((s) => selectUploadsFor(s, prefix))
  const saved = useGetAttachmentsQuery(parent, { skip: mode === 'draft' })
  const [addAttachments] = useAddAttachmentsMutation()
  const [removeAttachment] = useRemoveAttachmentMutation()
  const [preparing, setPreparing] = useState<Preparing[]>([])
  const [problems, setProblems] = useState<string[]>([])
  const [viewing, setViewing] = useState<number | null>(null)
  const [confirming, setConfirming] = useState<Attachment | null>(null)
  const filesInput = useRef<HTMLInputElement>(null)
  const cameraInput = useRef<HTMLInputElement>(null)

  const savedList = mode === 'saved' ? (saved.data?.attachments ?? []) : []
  const savedPaths = new Set(savedList.map((a) => a.path))
  const items = mergeAttachments(
    savedList,
    uploads.map((u) => u.attachment),
  )
  const jobFor = (path: string) => uploads.find((u) => u.attachment.path === path)
  const images = items.filter((a) => !isPdfType(a.contentType))
  const count = items.length + preparing.length
  const full = count >= MAX_ATTACHMENTS

  const busy = preparing.length > 0
  useEffect(() => onBusyChange?.(busy), [busy, onBusyChange])

  // A draft form closed without saving: its files are removed again. (Saving commits them
  // first, so this then finds nothing to discard.)
  useEffect(() => {
    if (mode !== 'draft') return
    return () => discardDrafts(prefix)
  }, [mode, prefix])

  async function addOne(file: File, slot: Preparing) {
    try {
      const prepared = await prepareFile(file, slot.abort.signal)
      const problem = fileProblem(prepared)
      if (problem || prepared.size > MAX_FILE_BYTES) {
        setProblems((p) => [...p, problem ?? `“${file.name}” is too large.`])
        return
      }
      const attachment: Attachment = {
        path: `${prefix}${nanoid()}`,
        name: prepared.name,
        contentType: prepared.type,
        size: prepared.size,
      }
      if (mode === 'saved') {
        const result = await addAttachments({ parent, attachments: [attachment] })
        if ('error' in result) {
          setProblems((p) => [...p, `“${file.name}” wasn’t attached. ${String(result.error)}`])
          return
        }
      }
      enqueueUpload(parent, attachment, prepared, { draft: mode === 'draft' })
    } catch (error) {
      if (slot.abort.signal.aborted) return
      setProblems((p) => [
        ...p,
        error instanceof PrepareError ? error.message : `“${file.name}” couldn’t be read.`,
      ])
    } finally {
      setPreparing((list) => list.filter((s) => s.id !== slot.id))
    }
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const picked = [...(e.target.files ?? [])]
    e.target.value = ''
    const { accepted, problems: rejected } = screenFiles(picked, count)
    setProblems(rejected)
    const slots = accepted.map((file) => ({
      file,
      slot: { id: nanoid(), name: file.name, abort: new AbortController() },
    }))
    setPreparing((list) => [...list, ...slots.map((s) => s.slot)])
    for (const { file, slot } of slots) void addOne(file, slot)
  }

  async function remove(attachment: Attachment) {
    if (mode === 'saved' && savedPaths.has(attachment.path)) {
      const result = await removeAttachment({ parent, attachment })
      return 'error' in result ? String(result.error) : null
    }
    cancelUpload(attachment.path)
    return null
  }

  function onRemove(attachment: Attachment) {
    const job = jobFor(attachment.path)
    const inFlight = job && (job.status === 'queued' || job.status === 'uploading')
    // Saved files are confirmed first; uploads in progress and unsaved drafts go at once.
    if (mode === 'saved' && savedPaths.has(attachment.path) && !inFlight) {
      setConfirming(attachment)
    } else {
      void remove(attachment).then((message) => message && setProblems([message]))
    }
  }

  return (
    <section aria-labelledby={`${fieldId}-label`} className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 id={`${fieldId}-label`} className="text-sm font-medium">
          Receipts
        </h3>
        <span className="text-xs text-muted-foreground">
          {count} of {MAX_ATTACHMENTS}
        </span>
      </div>

      {(items.length > 0 || preparing.length > 0) && (
        <ul className="-mx-1 flex gap-3 overflow-x-auto px-1 pt-2 pb-1" aria-label="Attached files">
          {items.map((attachment) => (
            <AttachmentThumb
              key={attachment.path}
              attachment={attachment}
              job={jobFor(attachment.path)}
              online={online}
              onOpen={() => setViewing(images.findIndex((i) => i.path === attachment.path))}
              onRemove={() => onRemove(attachment)}
              onRetry={() => retryUpload(attachment.path)}
            />
          ))}
          {preparing.map((slot) => (
            <li key={slot.id} className="w-20 shrink-0 space-y-1">
              <div className="relative flex size-20 items-center justify-center rounded-md border bg-muted">
                <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
                <button
                  type="button"
                  onClick={() => slot.abort.abort()}
                  aria-label={`Cancel ${slot.name}`}
                  className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full border bg-background shadow-sm outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </div>
              <p className="text-[11px] leading-tight text-muted-foreground">Compressing…</p>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {isMobile && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={full}
            onClick={() => cameraInput.current?.click()}
          >
            <Camera aria-hidden />
            Take photo
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={full}
          onClick={() => filesInput.current?.click()}
          aria-describedby={`${fieldId}-hint`}
        >
          <Paperclip aria-hidden />
          {isMobile ? 'Choose files' : 'Attach files'}
        </Button>
        <input
          ref={filesInput}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          aria-hidden
          tabIndex={-1}
          onChange={onPick}
        />
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          aria-hidden
          tabIndex={-1}
          onChange={onPick}
        />
      </div>
      <p id={`${fieldId}-hint`} className="text-xs text-muted-foreground">
        {full
          ? `That’s the most files you can attach (${MAX_ATTACHMENTS}).`
          : 'Photos or PDFs, up to 10 MB each. Photos are compressed before upload.'}
        {mode === 'saved' && ' Adding or deleting a file saves straight away.'}
        {!online && ' You’re offline: files upload when you’re back online.'}
      </p>
      {problems.length > 0 && (
        <ul role="alert" className="space-y-1 text-xs text-destructive">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      <Lightbox
        images={images}
        index={viewing}
        onIndexChange={setViewing}
        onDelete={(attachment) => {
          setViewing(null)
          onRemove(attachment)
        }}
      />
      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={`Delete ${confirming?.name ?? 'this file'}?`}
        description="The file is deleted for good."
        confirmLabel="Delete file"
        busyLabel="Deleting…"
        destructive
        onConfirm={async () => (confirming ? remove(confirming) : null)}
      />
    </section>
  )
}
