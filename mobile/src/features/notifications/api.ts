import {
  collection,
  doc,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore'
import { getFirebase } from '@/lib/firebase'
import type { AppNotification } from '@/features/notifications/api'
import { notificationSchema } from '@/features/notifications/schemas'
import { api } from '@/services/api'
import { collectionListener, firestoreWrite } from '@/services/firestore'

/** How many recent notifications the inbox shows. */
export const INBOX_LIMIT = 100

const col = (db: Firestore, uid: string) => collection(db, 'users', uid, 'notifications')

/** The notifications inbox (the web app shows these only as toasts). */
export const inboxApi = api.injectEndpoints({
  endpoints: (build) => ({
    getInbox: build.query<AppNotification[], string>({
      ...collectionListener({
        label: 'notifications',
        uidOf: (uid: string) => uid,
        schema: notificationSchema,
        query: (uid, db) => query(col(db, uid), orderBy('createdAt', 'desc'), limit(INBOX_LIMIT)),
        sort: (a, b) => b.createdAt.localeCompare(a.createdAt),
      }),
      providesTags: [{ type: 'Notification', id: 'LIST' }],
    }),

    setNotificationsRead: build.mutation<null, { uid: string; ids: string[]; read: boolean }>({
      queryFn: ({ uid, ids, read }, { dispatch }) =>
        firestoreWrite(dispatch, 'Could not update the notifications', () => {
          const db = getFirebase().db
          if (ids.length === 1) {
            return {
              commit: updateDoc(doc(col(db, uid), ids[0]), { read, updatedAt: serverTimestamp() }),
              result: null,
            }
          }
          const batch = writeBatch(db)
          for (const id of ids.slice(0, 450)) {
            batch.update(doc(col(db, uid), id), { read, updatedAt: serverTimestamp() })
          }
          return { commit: batch.commit(), result: null }
        }),
    }),
  }),
})

export const { useGetInboxQuery, useSetNotificationsReadMutation } = inboxApi
