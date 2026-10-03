import { Timestamp, collection, getDocs, orderBy, query, where } from 'firebase/firestore'
import type { TxRangeArg } from '@/features/reports/api'
import { fetchTransactionsPage, type TxCursor, type TxListArg } from '@/features/transactions/api'
import { transactionSchema } from '@/features/transactions/schemas'
import type { Transaction } from '@/features/transactions/types'
import { getFirebase } from '@/lib/firebase'
import { api } from '@/services/api'
import { firestoreErrorMessage, parseQuerySnapshot, reportInvalid } from '@/services/firestore'
import { localMidnight } from '@/utils/dates'
import { parseBackup } from './backup'
import type { ImportedTx } from './csvImport'
import { progressChanged, progressCleared } from './slice'
import { PartialWriteError, importTransactions, readBackup, restoreBackup } from './writes'

const OFFLINE = "You're offline. Connect to the internet and try again."
const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false

/** Tags refreshed after a bulk write, so every list re-reads. */
const EVERYTHING = [
  { type: 'Transaction' as const, id: 'LIST' },
  { type: 'Account' as const, id: 'LIST' },
  { type: 'Category' as const, id: 'LIST' },
  { type: 'Budget' as const, id: 'LIST' },
  { type: 'Recurring' as const, id: 'LIST' },
  { type: 'User' as const },
]

export const dataApi = api.injectEndpoints({
  endpoints: (build) => ({
    /** One read of the transactions dated in [start, end) (statements, duplicate checks). */
    fetchTransactionsBetween: build.query<Transaction[], TxRangeArg>({
      async queryFn({ uid, start, end }, { dispatch }) {
        try {
          const db = getFirebase().db
          const snap = await getDocs(
            query(
              collection(db, 'users', uid, 'transactions'),
              where('date', '>=', Timestamp.fromDate(localMidnight(start))),
              where('date', '<', Timestamp.fromDate(localMidnight(end))),
              orderBy('date', 'asc'),
            ),
          )
          const { items, invalid } = parseQuerySnapshot(snap, transactionSchema)
          reportInvalid(dispatch, 'transactions', invalid)
          return { data: items }
        } catch (error) {
          return { error: firestoreErrorMessage(error) }
        }
      },
      keepUnusedDataFor: 0,
    }),

    /** Every transaction matching the Transactions page filters (for CSV export). */
    exportTransactions: build.query<Transaction[], TxListArg>({
      async queryFn(arg, { dispatch }) {
        try {
          const all: Transaction[] = []
          let cursor: TxCursor | null = null
          do {
            const page = await fetchTransactionsPage(arg, cursor, dispatch)
            all.push(...page.items)
            cursor = page.next
          } while (cursor)
          return { data: all }
        } catch (error) {
          return { error: firestoreErrorMessage(error) }
        }
      },
      keepUnusedDataFor: 0,
    }),

    /** The full JSON backup, as text ready to download. */
    createBackup: build.mutation<{ text: string; exportedAt: string }, { uid: string }>({
      async queryFn({ uid }) {
        if (offline()) return { error: OFFLINE }
        try {
          const backup = await readBackup(getFirebase().db, uid)
          return { data: { text: JSON.stringify(backup, null, 1), exportedAt: backup.exportedAt } }
        } catch (error) {
          console.error('[data] backup failed', error)
          return { error: firestoreErrorMessage(error) }
        }
      },
    }),

    /** Writes imported transactions in batches, reporting progress in the data slice. */
    importTransactions: build.mutation<
      { written: number },
      { uid: string; txs: ImportedTx[]; currencies: Record<string, string> }
    >({
      async queryFn({ uid, txs, currencies }, { dispatch }) {
        if (offline()) return { error: OFFLINE }
        try {
          const written = await importTransactions(
            getFirebase().db,
            uid,
            txs,
            currencies,
            (done, total) =>
              dispatch(progressChanged({ task: 'import', step: 'transactions', done, total })),
          )
          return { data: { written } }
        } catch (error) {
          console.error('[data] import failed', error)
          if (error instanceof PartialWriteError) {
            return {
              error: `Imported ${error.done} of ${error.total}, then stopped: ${firestoreErrorMessage(error.cause)}`,
            }
          }
          return { error: firestoreErrorMessage(error) }
        } finally {
          dispatch(progressCleared())
        }
      },
      invalidatesTags: EVERYTHING,
    }),

    /** Replaces this account's data with a backup file's (see `restoreBackup`). */
    restoreBackup: build.mutation<null, { uid: string; text: string }>({
      async queryFn({ uid, text }, { dispatch }) {
        if (offline()) return { error: OFFLINE }
        const check = parseBackup(text)
        if (!check.ok) return { error: check.error }
        try {
          await restoreBackup(getFirebase().db, uid, check.backup, (step, done, total) =>
            dispatch(progressChanged({ task: 'restore', step, done, total })),
          )
          return { data: null }
        } catch (error) {
          console.error('[data] restore failed', error)
          return {
            error: `The restore stopped part-way: ${firestoreErrorMessage(error)} Run it again to finish.`,
          }
        } finally {
          dispatch(progressCleared())
        }
      },
      invalidatesTags: EVERYTHING,
    }),
  }),
})

export const {
  useLazyFetchTransactionsBetweenQuery,
  useLazyExportTransactionsQuery,
  useCreateBackupMutation,
  useImportTransactionsMutation,
  useRestoreBackupMutation,
} = dataApi
