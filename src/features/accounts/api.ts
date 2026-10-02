import {
  collection,
  doc,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Firestore,
} from 'firebase/firestore'
import { getFirebase } from '@/lib/firebase'
import { api } from '@/services/api'
import { collectionListener, firestoreWrite } from '@/services/firestore'
import { accountSchema, type AccountFormValues } from './schemas'
import type { Account } from './types'
import { compareAccounts } from './utils'

const accountsCol = (db: Firestore, uid: string) => collection(db, 'users', uid, 'accounts')

const LIST = { type: 'Account' as const, id: 'LIST' }

export const accountsApi = api.injectEndpoints({
  endpoints: (build) => ({
    /** Live list of all the user's accounts, archived included (the UI filters). */
    getAccounts: build.query<Account[], string>({
      ...collectionListener({
        label: 'accounts',
        uidOf: (uid: string) => uid,
        schema: accountSchema,
        query: (uid, db) => query(accountsCol(db, uid)),
        sort: compareAccounts,
      }),
      providesTags: (result) => [
        LIST,
        ...(result ?? []).map((a) => ({ type: 'Account' as const, id: a.id })),
      ],
    }),

    createAccount: build.mutation<{ id: string }, { uid: string; values: AccountFormValues }>({
      queryFn: ({ uid, values }, { dispatch }) =>
        firestoreWrite(dispatch, 'Could not create the account', () => {
          const ref = doc(accountsCol(getFirebase().db, uid))
          const commit = setDoc(ref, {
            ...values,
            txTotal: 0,
            archived: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            createdBy: uid,
          })
          return { commit, result: { id: ref.id } }
        }),
      invalidatesTags: [LIST],
    }),

    updateAccount: build.mutation<null, { uid: string; id: string; values: AccountFormValues }>({
      queryFn: ({ uid, id, values }, { dispatch }) =>
        firestoreWrite(dispatch, 'Could not save the account', () => ({
          commit: updateDoc(doc(accountsCol(getFirebase().db, uid), id), {
            ...values,
            updatedAt: serverTimestamp(),
          }),
          result: null,
        })),
      invalidatesTags: (_r, _e, { id }) => [LIST, { type: 'Account', id }],
    }),

    setAccountArchived: build.mutation<null, { uid: string; id: string; archived: boolean }>({
      queryFn: ({ uid, id, archived }, { dispatch }) =>
        firestoreWrite(
          dispatch,
          archived ? 'Could not archive the account' : 'Could not restore the account',
          () => ({
            commit: updateDoc(doc(accountsCol(getFirebase().db, uid), id), {
              archived,
              updatedAt: serverTimestamp(),
            }),
            result: null,
          }),
        ),
      invalidatesTags: (_r, _e, { id }) => [LIST, { type: 'Account', id }],
    }),
  }),
})

export const {
  useGetAccountsQuery,
  useCreateAccountMutation,
  useUpdateAccountMutation,
  useSetAccountArchivedMutation,
} = accountsApi
