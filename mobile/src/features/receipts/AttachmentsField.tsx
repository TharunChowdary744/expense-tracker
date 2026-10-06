import { nanoid } from '@reduxjs/toolkit'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import * as Linking from 'expo-linking'
import { AlertCircle, Camera, CloudOff, FileText, ImageIcon, ImageOff, RotateCw, X } from 'lucide-react-native'
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useAppSelector } from '@/app/hooks'
import {
  useAddAttachmentsMutation,
  useGetAttachmentsQuery,
  useRemoveAttachmentMutation,
} from '@/features/receipts/api'
import { useReceiptSrc } from '@/features/receipts/hooks/useReceiptSrc'
import { cancelUpload, discardDrafts, enqueueUpload, retryUpload } from '@/features/receipts/queue'
import { MAX_ATTACHMENTS, MAX_FILE_BYTES, type Attachment } from '@/features/receipts/schemas'
import { selectUploadsFor } from '@/features/receipts/slice'
import type { JobView, ReceiptParent } from '@/features/receipts/types'
import {
  fileProblem,
  formatBytes,
  isPdfType,
  mergeAttachments,
  receiptPrefix,
  screenFiles,
} from '@/features/receipts/utils'
import { Button } from '@m/components/ui/Button'
import { ConfirmDialog } from '@m/components/ui/Dialog'
import { Text } from '@m/components/ui/Text'
import { radius } from '@m/theme/colors'
import { useColors } from '@m/theme/ThemeProvider'
import { fileSize } from '@m/utils/files'
import { ReceiptViewer } from './ReceiptViewer'
import { PrepareError, prepareLocalFile, type LocalFile } from './prepare'

interface Props {
  parent: ReceiptParent
  /**
   * "saved": the document exists; files are listed on it as soon as they are added or removed.
   * "draft": a new document; files upload now and are listed on it when the form saves.
   * Closing the form without saving deletes them again.
   */
  mode: 'saved' | 'draft'
  /** Tells the form whether files are still being prepared, so it can wait before saving. */
  onBusyChange?: (busy: boolean) => void
}

interface Preparing {
  id: string
  name: string
  cancelled: boolean
}

function guessName(uri: string, fallback: string): string {
  const last = uri.split('/').pop()?.split('?')[0]
  return last && last.includes('.') ? decodeURIComponent(last) : fallback
}

function fromImageAsset(asset: ImagePicker.ImagePickerAsset): LocalFile {
  return {
    uri: asset.uri,
    name: asset.fileName ?? guessName(asset.uri, 'photo.jpg'),
    type: asset.mimeType ?? 'image/jpeg',
    size: asset.fileSize ?? fileSize(asset.uri),
    width: asset.width,
    height: asset.height,
  }
}

function fromDocument(asset: DocumentPicker.DocumentPickerAsset): LocalFile {
  return {
    uri: asset.uri,
    name: asset.name,
    type: asset.mimeType ?? (/\.pdf$/i.test(asset.name) ? 'application/pdf' : ''),
    size: asset.size ?? fileSize(asset.uri),
  }
}

/** The receipts section of the transaction and group expense forms. */
export function AttachmentsField({ parent, mode, onBusyChange }: Props) {
  const c = useColors()
  const prefix = receiptPrefix(parent)
  const online = useAppSelector((s) => s.receipts.online)
  const uploads = useAppSelector((s) => selectUploadsFor(s, prefix))
  const saved = useGetAttachmentsQuery(parent, { skip: mode === 'draft' })
  const [addAttachments] = useAddAttachmentsMutation()
  const [removeAttachment] = useRemoveAttachmentMutation()
  const [preparing, setPreparing] = useState<Preparing[]>([])
  const [problems, setProblems] = useState<string[]>([])
  const [viewing, setViewing] = useState<number | null>(null)
  const [confirming, setConfirming] = useState<Attachment | null>(null)
  const [deleting, setDeleting] = useState(false)
  const slots = useRef(new Map<string, Preparing>())

  const savedList = mode === 'saved' ? (saved.data?.attachments ?? []) : []
  const savedPaths = new Set(savedList.map((a) => a.path))
  const items = mergeAttachments(
    savedList,
    uploads.map((u) => u.attachment),
  )
  const jobFor = (path: string) => uploads.find((u) => u.attachment.path === path)
  const images = items.filter((a) => !isPdfType(a.contentType))
  const count = items.length + preparing.length
  const remaining = Math.max(0, MAX_ATTACHMENTS - count)
  const full = remaining === 0

  const busy = preparing.length > 0
  useEffect(() => onBusyChange?.(busy), [busy, onBusyChange])

  // A draft form closed without saving: its files are removed again. (Saving commits them
  // first, so this then finds nothing to discard.)
  useEffect(() => {
    if (mode !== 'draft') return
    return () => discardDrafts(prefix)
  }, [mode, prefix])

  async function addOne(file: LocalFile, slot: Preparing) {
    try {
      const prepared = await prepareLocalFile(file)
      if (slot.cancelled) return
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
      enqueueUpload(parent, attachment, prepared.uri, { draft: mode === 'draft' })
    } catch (error) {
      if (slot.cancelled) return
      setProblems((p) => [
        ...p,
        error instanceof PrepareError ? error.message : `“${file.name}” couldn’t be read.`,
      ])
    } finally {
      slots.current.delete(slot.id)
      setPreparing((list) => list.filter((s) => s.id !== slot.id))
    }
  }

  function addFiles(picked: LocalFile[]) {
    const { accepted, problems: rejected } = screenFiles(picked, count)
    setProblems(rejected)
    const next = accepted.map((file) => {
      const slot: Preparing = { id: nanoid(), name: file.name, cancelled: false }
      slots.current.set(slot.id, slot)
      return { file, slot }
    })
    setPreparing((list) => [...list, ...next.map((s) => s.slot)])
    for (const { file, slot } of next) void addOne(file, slot)
  }

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync()
    if (!permission.granted) {
      setProblems(['Allow camera access in your device settings to take a photo of a receipt.'])
      return
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 })
    if (!result.canceled) addFiles(result.assets.map(fromImageAsset))
  }

  async function choosePhotos() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 1,
    })
    if (!result.canceled) addFiles(result.assets.map(fromImageAsset))
  }

  async function choosePdf() {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      multiple: true,
      copyToCacheDirectory: true,
    })
    if (!result.canceled) addFiles(result.assets.map(fromDocument))
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

  function cancelPreparing(slot: Preparing) {
    slot.cancelled = true
    slots.current.delete(slot.id)
    setPreparing((list) => list.filter((s) => s.id !== slot.id))
  }

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text variant="subheading" accessibilityRole="header">
          Receipts
        </Text>
        <Text variant="caption" tone="muted">
          {count} of {MAX_ATTACHMENTS}
        </Text>
      </View>

      {items.length > 0 || preparing.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.strip}
          accessibilityLabel="Attached files"
        >
          {items.map((attachment) => (
            <Thumb
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
            <View key={slot.id} style={styles.thumbColumn}>
              <View style={[styles.tile, { borderColor: c.border, backgroundColor: c.muted }]}>
                <ActivityIndicator color={c.mutedForeground} />
                <RemoveBadge label={`Cancel ${slot.name}`} onPress={() => cancelPreparing(slot)} />
              </View>
              <Text variant="caption" tone="muted">
                Compressing…
              </Text>
            </View>
          ))}
        </ScrollView>
      ) : null}

      <View style={styles.buttons}>
        <Button title="Take photo" icon={Camera} variant="outline" size="sm" disabled={full} onPress={() => void takePhoto()} />
        <Button title="Photos" icon={ImageIcon} variant="outline" size="sm" disabled={full} onPress={() => void choosePhotos()} />
        <Button title="PDF" icon={FileText} variant="outline" size="sm" disabled={full} onPress={() => void choosePdf()} />
      </View>
      <Text variant="caption" tone="muted">
        {full
          ? `That’s the most files you can attach (${MAX_ATTACHMENTS}).`
          : 'Photos or PDFs, up to 10 MB each. Photos are compressed before upload.'}
        {mode === 'saved' ? ' Adding or deleting a file saves straight away.' : ''}
        {!online ? ' You’re offline: files upload when you’re back online.' : ''}
      </Text>
      {problems.length > 0 ? (
        <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.problems}>
          {problems.map((p) => (
            <Text key={p} variant="caption" tone="destructive">
              {p}
            </Text>
          ))}
        </View>
      ) : null}

      <ReceiptViewer
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
        onClose={() => setConfirming(null)}
        title={`Delete ${confirming?.name ?? 'this file'}?`}
        description="The file is deleted for good."
        confirmLabel="Delete file"
        destructive
        loading={deleting}
        onConfirm={() => {
          if (!confirming) return
          setDeleting(true)
          void remove(confirming).then((message) => {
            setDeleting(false)
            setConfirming(null)
            if (message) setProblems([message])
          })
        }}
      />
    </View>
  )
}

function statusText(job: JobView | undefined, online: boolean): string | null {
  if (!job || job.status === 'uploaded') return null
  if (job.status === 'failed') return job.error ?? 'Upload failed.'
  if (job.status === 'uploading') return `Uploading ${Math.round(job.progress * 100)}%`
  if (!online) return 'Waiting for connection'
  return job.error ?? 'Waiting to upload'
}

function RemoveBadge({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useColors()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={[styles.remove, { backgroundColor: c.background, borderColor: c.border }]}
    >
      <X size={14} color={c.foreground} />
    </Pressable>
  )
}

/** One file in the strip: a thumbnail (or PDF tile), its upload state and a remove button. */
function Thumb({
  attachment,
  job,
  online,
  onOpen,
  onRemove,
  onRetry,
}: {
  attachment: Attachment
  job?: JobView
  online: boolean
  onOpen: () => void
  onRemove: () => void
  onRetry: () => void
}) {
  const c = useColors()
  const pdf = isPdfType(attachment.contentType)
  const { src, missing, error } = useReceiptSrc(attachment.path)
  const status = statusText(job, online)
  const inFlight = job !== undefined && job.status !== 'uploaded' && job.status !== 'failed'
  const label = `${attachment.name} (${pdf ? 'PDF' : 'image'}, ${formatBytes(attachment.size)})`

  function open() {
    if (!src) return
    if (pdf) void Linking.openURL(src)
    else onOpen()
  }

  return (
    <View style={styles.thumbColumn}>
      <View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={src ? `${pdf ? 'Open' : 'View'} ${label}` : `${label}, not available yet`}
          accessibilityState={{ disabled: !src }}
          disabled={!src}
          onPress={open}
          style={[styles.tile, { borderColor: c.border, backgroundColor: c.muted }]}
        >
          {pdf ? (
            <View style={styles.pdf}>
              <FileText size={22} color={c.mutedForeground} />
              <Text variant="caption" tone="muted" numberOfLines={2} style={styles.center}>
                {attachment.name}
              </Text>
            </View>
          ) : src ? (
            <Image source={{ uri: src }} style={styles.image} accessibilityIgnoresInvertColors />
          ) : missing || error ? (
            <ImageOff size={22} color={c.mutedForeground} />
          ) : (
            <ActivityIndicator color={c.mutedForeground} />
          )}
          {job?.status === 'uploading' ? (
            <View
              style={styles.progressTrack}
              accessibilityRole="progressbar"
              accessibilityLabel={`Uploading ${attachment.name}`}
              accessibilityValue={{ min: 0, max: 100, now: Math.round(job.progress * 100) }}
            >
              <View
                style={[
                  styles.progressFill,
                  { backgroundColor: c.primary, width: `${Math.round(job.progress * 100)}%` },
                ]}
              />
            </View>
          ) : null}
          {job?.status === 'queued' ? (
            <View style={styles.queued}>
              <CloudOff size={14} color="#ffffff" />
            </View>
          ) : null}
        </Pressable>
        <RemoveBadge
          label={inFlight ? `Cancel upload of ${attachment.name}` : `Delete ${attachment.name}`}
          onPress={onRemove}
        />
      </View>
      {job?.status === 'failed' ? (
        <View style={styles.failed}>
          <View style={styles.row}>
            <AlertCircle size={12} color={c.destructive} />
            <Text variant="caption" tone="destructive" style={styles.flex}>
              {status}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Retry upload of ${attachment.name}`}
            onPress={onRetry}
            style={styles.row}
          >
            <RotateCw size={12} color={c.primary} />
            <Text variant="caption" style={{ color: c.primary }}>
              Retry
            </Text>
          </Pressable>
        </View>
      ) : status ? (
        <Text variant="caption" tone="muted">
          {status}
        </Text>
      ) : missing && !job ? (
        <Text variant="caption" tone="muted">
          Not uploaded yet
        </Text>
      ) : error ? (
        <Text variant="caption" tone="destructive">
          {error}
        </Text>
      ) : null}
    </View>
  )
}

const TILE = 80

const styles = StyleSheet.create({
  section: { gap: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  strip: { gap: 12, paddingTop: 8, paddingBottom: 4, paddingRight: 8 },
  thumbColumn: { width: TILE, gap: 4 },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: { width: '100%', height: '100%' },
  pdf: { alignItems: 'center', gap: 2, padding: 4 },
  center: { textAlign: 'center' },
  remove: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: {
    position: 'absolute',
    left: 4,
    right: 4,
    bottom: 4,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  progressFill: { height: '100%' },
  queued: {
    position: 'absolute',
    left: 4,
    bottom: 4,
    borderRadius: 4,
    padding: 2,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  problems: { gap: 4 },
  failed: { gap: 2 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  flex: { flex: 1 },
})
