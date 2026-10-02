import { doc } from 'firebase/firestore'
import { api } from '@/services/api'
import { docListener, type Stored } from '@/services/firestore'
import { userDocSchema, type UserDoc } from './schemas'

export const settingsApi = api.injectEndpoints({
  endpoints: (build) => ({
    /** Live users/{uid}; `null` until first-sign-in seeding has created it. */
    getUserDoc: build.query<Stored<UserDoc> | null, string>({
      ...docListener({
        label: 'your settings',
        uidOf: (uid: string) => uid,
        schema: userDocSchema,
        doc: (uid, db) => doc(db, 'users', uid),
      }),
      providesTags: (_result, _error, uid) => [{ type: 'User', id: uid }],
    }),
  }),
})

export const { useGetUserDocQuery } = settingsApi
