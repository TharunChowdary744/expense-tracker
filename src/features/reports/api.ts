import {
  Timestamp,
  collection,
  limit,
  orderBy,
  query,
  where,
  type Firestore,
} from 'firebase/firestore'
import { transactionSchema } from '@/features/transactions/schemas'
import type { Transaction } from '@/features/transactions/types'
import { api } from '@/services/api'
import { collectionListener } from '@/services/firestore'
import { localMidnight } from '@/utils/dates'

const txCol = (db: Firestore, uid: string) => collection(db, 'users', uid, 'transactions')

export interface TxRangeArg {
  uid: string
  /** yyyy-MM-dd, inclusive, in the device timezone. */
  start: string
  /** yyyy-MM-dd, exclusive. */
  end: string
}

const byDateDesc = (a: Transaction, b: Transaction) =>
  a.date === b.date ? b.id.localeCompare(a.id) : a.date < b.date ? 1 : -1

export const reportsApi = api.injectEndpoints({
  endpoints: (build) => ({
    /**
     * Live list of every transaction (all types) dated in [start, end), for the dashboard and
     * reports. Uses the automatic single-field index on `date`.
     */
    getTransactionsInRange: build.query<Transaction[], TxRangeArg>({
      ...collectionListener({
        label: 'transactions',
        uidOf: (arg: TxRangeArg) => arg.uid,
        schema: transactionSchema,
        query: ({ uid, start, end }, db) =>
          query(
            txCol(db, uid),
            where('date', '>=', Timestamp.fromDate(localMidnight(start))),
            where('date', '<', Timestamp.fromDate(localMidnight(end))),
            orderBy('date', 'desc'),
          ),
        sort: byDateDesc,
      }),
      providesTags: [{ type: 'Transaction', id: 'LIST' }],
    }),

    /** The newest few transactions, live (dashboard "Recent transactions"). */
    getRecentTransactions: build.query<Transaction[], { uid: string; count: number }>({
      ...collectionListener({
        label: 'recent transactions',
        uidOf: (arg: { uid: string; count: number }) => arg.uid,
        schema: transactionSchema,
        query: ({ uid, count }, db) => query(txCol(db, uid), orderBy('date', 'desc'), limit(count)),
        sort: byDateDesc,
      }),
      providesTags: [{ type: 'Transaction', id: 'LIST' }],
    }),
  }),
})

export const { useGetTransactionsInRangeQuery, useGetRecentTransactionsQuery } = reportsApi
