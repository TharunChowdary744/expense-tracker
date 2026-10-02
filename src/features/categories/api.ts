import {
  collection,
  doc,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore'
import { getFirebase } from '@/lib/firebase'
import { api } from '@/services/api'
import { collectionListener, firestoreWrite } from '@/services/firestore'
import { categorySchema, type CategoryFormValues, type CategoryKind } from './schemas'
import type { Category } from './types'
import { compareCategories } from './utils'

const categoriesCol = (db: Firestore, uid: string) => collection(db, 'users', uid, 'categories')

const LIST = { type: 'Category' as const, id: 'LIST' }

/** Form values → stored fields ('' parent means top-level). */
function toFields(values: CategoryFormValues) {
  return {
    name: values.name,
    icon: values.icon,
    color: values.color,
    parentId: values.parentId || null,
  }
}

export const categoriesApi = api.injectEndpoints({
  endpoints: (build) => ({
    /** Live list of every category of both kinds, archived included (the UI filters). */
    getCategories: build.query<Category[], string>({
      ...collectionListener({
        label: 'categories',
        uidOf: (uid: string) => uid,
        schema: categorySchema,
        query: (uid, db) => query(categoriesCol(db, uid)),
        sort: compareCategories,
      }),
      providesTags: (result) => [
        LIST,
        ...(result ?? []).map((c) => ({ type: 'Category' as const, id: c.id })),
      ],
    }),

    createCategory: build.mutation<
      { id: string },
      { uid: string; kind: CategoryKind; order: number; values: CategoryFormValues }
    >({
      queryFn: ({ uid, kind, order, values }, { dispatch }) =>
        firestoreWrite(dispatch, 'Could not create the category', () => {
          const ref = doc(categoriesCol(getFirebase().db, uid))
          const commit = setDoc(ref, {
            ...toFields(values),
            kind,
            order,
            archived: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            createdBy: uid,
          })
          return { commit, result: { id: ref.id } }
        }),
      invalidatesTags: [LIST],
    }),

    /** `order` is passed when the category moves to another sibling group (new parent). */
    updateCategory: build.mutation<
      null,
      { uid: string; id: string; values: CategoryFormValues; order?: number }
    >({
      queryFn: ({ uid, id, values, order }, { dispatch }) =>
        firestoreWrite(dispatch, 'Could not save the category', () => ({
          commit: updateDoc(doc(categoriesCol(getFirebase().db, uid), id), {
            ...toFields(values),
            ...(order === undefined ? {} : { order }),
            updatedAt: serverTimestamp(),
          }),
          result: null,
        })),
      invalidatesTags: (_r, _e, { id }) => [LIST, { type: 'Category', id }],
    }),

    /** Archives or restores several categories atomically (a parent with its children). */
    setCategoriesArchived: build.mutation<null, { uid: string; ids: string[]; archived: boolean }>({
      queryFn: ({ uid, ids, archived }, { dispatch }) =>
        firestoreWrite(
          dispatch,
          archived ? 'Could not archive the category' : 'Could not restore the category',
          () => {
            const db = getFirebase().db
            const batch = writeBatch(db)
            for (const id of ids) {
              batch.update(doc(categoriesCol(db, uid), id), {
                archived,
                updatedAt: serverTimestamp(),
              })
            }
            return { commit: batch.commit(), result: null }
          },
        ),
      invalidatesTags: (_r, _e, { ids }) => [
        LIST,
        ...ids.map((id) => ({ type: 'Category' as const, id })),
      ],
    }),

    /** Persists a new sibling order in one batch. */
    reorderCategories: build.mutation<
      null,
      { uid: string; updates: { id: string; order: number }[] }
    >({
      queryFn: ({ uid, updates }, { dispatch }) =>
        firestoreWrite(dispatch, 'Could not save the new order', () => {
          const db = getFirebase().db
          const batch = writeBatch(db)
          for (const { id, order } of updates) {
            batch.update(doc(categoriesCol(db, uid), id), { order, updatedAt: serverTimestamp() })
          }
          return { commit: batch.commit(), result: null }
        }),
      // Show the new order at once; the listener confirms it (or rolls it back on failure).
      async onQueryStarted({ uid, updates }, { dispatch, queryFulfilled }) {
        const orders = new Map(updates.map((u) => [u.id, u.order]))
        const patch = dispatch(
          categoriesApi.util.updateQueryData('getCategories', uid, (draft) =>
            draft
              .map((c) => (orders.has(c.id) ? { ...c, order: orders.get(c.id) ?? c.order } : c))
              .sort(compareCategories),
          ),
        )
        const result = await queryFulfilled.catch(() => null)
        if (!result) patch.undo()
      },
      invalidatesTags: [LIST],
    }),
  }),
})

export const {
  useGetCategoriesQuery,
  useCreateCategoryMutation,
  useUpdateCategoryMutation,
  useSetCategoriesArchivedMutation,
  useReorderCategoriesMutation,
} = categoriesApi
