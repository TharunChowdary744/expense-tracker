import { arrayRemove, arrayUnion, doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { z } from 'zod'
import { getFirebase } from '@/lib/firebase'
import { api } from '@/services/api'
import { docListener, firestoreWrite, type Stored } from '@/services/firestore'
import { downloadUrl } from './backend'
import { enqueueDeletes } from './queue'
import { attachmentsField, type Attachment } from './schemas'
import type { ReceiptParent } from './types'
import { parentDocPath } from './utils'

const attachmentsDocSchema = z.object({ attachments: attachmentsField })
type AttachmentsDoc = Stored<z.output<typeof attachmentsDocSchema>>

/** A download URL could not be made because the file isn't in Storage (yet). */
export const MISSING_FILE = 'missing'

function storageErrorMessage(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code
  if (code === 'storage/object-not-found') return MISSING_FILE
  if (code === 'storage/unauthorized') return 'You don’t have access to this file.'
  return 'Could not load the file.'
}

export const receiptsApi = api.injectEndpoints({
  endpoints: (build) => ({
    /** The attachments listed on a saved transaction or group expense, live (null if gone). */
    getAttachments: build.query<AttachmentsDoc | null, ReceiptParent>({
      ...docListener({
        label: 'attachments',
        deniedMeansGone: true,
        uidOf: (parent: ReceiptParent) => parent.uid,
        schema: attachmentsDocSchema,
        doc: (parent, db) => doc(db, parentDocPath(parent)),
      }),
    }),

    /** A download URL for a file, fetched only when the file is shown. */
    getReceiptUrl: build.query<string, string>({
      async queryFn(path) {
        try {
          return { data: await downloadUrl(path) }
        } catch (error) {
          return { error: storageErrorMessage(error) }
        }
      },
      // URLs stay valid until the file is deleted.
      keepUnusedDataFor: 3600,
    }),

    /** Lists new files on a saved document (their uploads are queued separately). */
    addAttachments: build.mutation<null, { parent: ReceiptParent; attachments: Attachment[] }>({
      queryFn: ({ parent, attachments }, { dispatch }) =>
        firestoreWrite(dispatch, 'Could not attach the file', () => ({
          commit: updateDoc(doc(getFirebase().db, parentDocPath(parent)), {
            attachments: arrayUnion(...attachments),
            updatedAt: serverTimestamp(),
          }),
          result: null,
        })),
    }),

    /** Removes a file from a saved document and deletes it from Storage. */
    removeAttachment: build.mutation<null, { parent: ReceiptParent; attachment: Attachment }>({
      queryFn: ({ parent, attachment }, { dispatch }) =>
        firestoreWrite(dispatch, 'Could not delete the attachment', () => {
          const commit = updateDoc(doc(getFirebase().db, parentDocPath(parent)), {
            attachments: arrayRemove(attachment),
            updatedAt: serverTimestamp(),
          })
          enqueueDeletes(parent, [attachment])
          return { commit, result: null }
        }),
    }),
  }),
})

export const {
  useGetAttachmentsQuery,
  useGetReceiptUrlQuery,
  useAddAttachmentsMutation,
  useRemoveAttachmentMutation,
} = receiptsApi
