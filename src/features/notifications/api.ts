import {
  collection,
  doc,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Firestore,
} from 'firebase/firestore'
import { getFirebase } from '@/lib/firebase'
import { api } from '@/services/api'
import { collectionListener, firestoreWrite, type Stored } from '@/services/firestore'
import { notificationSchema, type NotificationDoc, type NotificationType } from './schemas'

export type AppNotification = Stored<NotificationDoc>

const notificationsCol = (db: Firestore, uid: string) =>
  collection(db, 'users', uid, 'notifications')

export interface UnreadArg {
  uid: string
  type: NotificationType
}

export const notificationsApi = api.injectEndpoints({
  endpoints: (build) => ({
    /** Live unread notifications of one type (two equality filters: no composite index). */
    getUnreadNotifications: build.query<AppNotification[], UnreadArg>({
      ...collectionListener({
        label: 'notifications',
        uidOf: (arg: UnreadArg) => arg.uid,
        schema: notificationSchema,
        query: (arg, db) =>
          query(
            notificationsCol(db, arg.uid),
            where('type', '==', arg.type),
            where('read', '==', false),
          ),
        sort: (a, b) => a.createdAt.localeCompare(b.createdAt),
      }),
      providesTags: [{ type: 'Notification', id: 'LIST' }],
    }),

    markNotificationRead: build.mutation<null, { uid: string; id: string }>({
      queryFn: ({ uid, id }, { dispatch }) =>
        firestoreWrite(dispatch, 'Could not update the notification', () => ({
          commit: updateDoc(doc(notificationsCol(getFirebase().db, uid), id), {
            read: true,
            updatedAt: serverTimestamp(),
          }),
          result: null,
        })),
    }),
  }),
})

export const { useGetUnreadNotificationsQuery, useMarkNotificationReadMutation } = notificationsApi
