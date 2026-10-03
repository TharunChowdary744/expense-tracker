import { doc, getDoc } from 'firebase/firestore'
import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage'
import { getFirebase } from '@/lib/firebase'
import { attachmentsField } from './schemas'
import type { ReceiptParent } from './types'
import { parentDocPath } from './utils'

/** The Storage and Firestore calls the receipt queue makes (swapped for fakes in tests). */
export interface QueueBackend {
  /** Starts an upload; `promise` settles when it finishes, fails or is cancelled. */
  upload(
    path: string,
    blob: Blob,
    contentType: string,
    onProgress: (fraction: number) => void,
  ): { promise: Promise<void>; cancel: () => void }
  remove(path: string): Promise<void>
  /** Whether the parent document still lists the file. Throws when it can't tell. */
  isReferenced(parent: ReceiptParent, path: string): Promise<boolean>
}

export const firebaseBackend: QueueBackend = {
  upload(path, blob, contentType, onProgress) {
    const task = uploadBytesResumable(ref(getFirebase().storage, path), blob, {
      contentType,
      // Paths never change content (each file has its own id), so browsers may cache them.
      cacheControl: 'private, max-age=31536000, immutable',
    })
    const promise = new Promise<void>((resolve, reject) => {
      task.on(
        'state_changed',
        (snap) => onProgress(snap.totalBytes > 0 ? snap.bytesTransferred / snap.totalBytes : 0),
        reject,
        () => resolve(),
      )
    })
    return { promise, cancel: () => void task.cancel() }
  },

  remove: (path) => deleteObject(ref(getFirebase().storage, path)),

  async isReferenced(parent, path) {
    const snap = await getDoc(doc(getFirebase().db, parentDocPath(parent)))
    if (!snap.exists()) return false
    return attachmentsField.parse(snap.get('attachments')).some((a) => a.path === path)
  },
}

export function downloadUrl(path: string): Promise<string> {
  return getDownloadURL(ref(getFirebase().storage, path))
}
