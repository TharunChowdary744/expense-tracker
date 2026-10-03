import {
  Timestamp,
  collection,
  deleteField,
  doc,
  documentId,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  where,
  writeBatch,
  type Firestore,
  type QueryConstraint,
  type WriteBatch,
} from 'firebase/firestore'
import { getFirebase } from '@/lib/firebase'
import { api } from '@/services/api'
import {
  firestoreErrorMessage,
  firestoreWrite,
  parseQuerySnapshot,
  reportInvalid,
  type AnyDispatch,
} from '@/services/firestore'
import { hasClientFilters, matchesQuery, serverPlan, type TxQuery } from './filters'
import { transactionSchema, type TransactionFormValues } from './schemas'
import type { BalanceTransaction, Transaction } from './types'
import { accountDeltas } from './utils'

const txCol = (db: Firestore, uid: string) => collection(db, 'users', uid, 'transactions')
const accountRef = (db: Firestore, uid: string, id: string) => doc(db, 'users', uid, 'accounts', id)

const LIST = { type: 'Transaction' as const, id: 'LIST' }

/** Rows per page shown to the user. */
export const PAGE_SIZE = 50
/** Docs read per Firestore request when client-side filters may drop some of them. */
const SCAN_BATCH = 100
/** Most docs one page request reads before handing back what it found. */
const SCAN_CAP = 500
/** Docs per write batch for bulk actions (well under Firestore's 500-write limit). */
export const BULK_CHUNK = 100

/** Where the next page starts: the sort value and id of the last doc read. */
export interface TxCursor {
  value: string | number
  id: string
}

export interface TxPage {
  items: Transaction[]
  next: TxCursor | null
}

export interface TxListArg {
  uid: string
  query: TxQuery
}

/** Account id → currency, so writes can work out each account's balance change. */
export type AccountCurrencies = Record<string, string>

function cursorValue(field: 'date' | 'baseAmount', value: string | number) {
  return field === 'date' ? Timestamp.fromDate(new Date(value)) : value
}

/**
 * Reads one page: Firestore does the type filter, the sort and (for date sorts) the date
 * range; everything else is filtered here. It keeps reading until it has a page of matches,
 * reaches the end, or has read SCAN_CAP docs (then the next scroll continues the scan).
 */
export async function fetchTransactionsPage(
  { uid, query: q }: TxListArg,
  cursor: TxCursor | null,
  dispatch: AnyDispatch,
): Promise<TxPage> {
  const db = getFirebase().db
  const plan = serverPlan(q)
  const filtered = hasClientFilters(q)
  const batchSize = filtered ? SCAN_BATCH : PAGE_SIZE
  const base: QueryConstraint[] = []
  if (plan.type) base.push(where('type', '==', plan.type))
  if (plan.start) base.push(where('date', '>=', Timestamp.fromDate(new Date(plan.start))))
  if (plan.end) base.push(where('date', '<', Timestamp.fromDate(new Date(plan.end))))
  base.push(orderBy(plan.field, plan.direction), orderBy(documentId(), plan.direction))

  const items: Transaction[] = []
  let next = cursor
  let scanned = 0
  for (;;) {
    const constraints = [...base]
    if (next) constraints.push(startAfter(cursorValue(plan.field, next.value), next.id))
    constraints.push(limit(batchSize))
    const snap = await getDocs(query(txCol(db, uid), ...constraints))
    const { items: parsed, invalid } = parseQuerySnapshot(snap, transactionSchema)
    reportInvalid(dispatch, 'transactions', invalid)
    for (const tx of parsed) if (matchesQuery(tx, q)) items.push(tx)
    const last = snap.docs[snap.docs.length - 1]
    if (last) {
      const raw = last.get(plan.field) as Timestamp | number
      next = {
        value: typeof raw === 'number' ? raw : raw.toDate().toISOString(),
        id: last.id,
      }
    }
    scanned += snap.size
    if (snap.size < batchSize) return { items, next: null }
    if (items.length >= PAGE_SIZE || scanned >= SCAN_CAP) return { items, next }
  }
}

/** Firestore fields for a transaction's editable values. */
function toFields(values: TransactionFormValues, dateIso: string) {
  return {
    type: values.type,
    amount: values.amount,
    currency: values.currency,
    fxRateToBase: values.fxRateToBase,
    baseAmount: values.baseAmount,
    accountId: values.accountId,
    tags: values.tags,
    payee: values.payee,
    note: values.note,
    date: Timestamp.fromDate(new Date(dateIso)),
  }
}

/** Adds the cached balance changes for `before` → `after` to the batch. */
function applyBalanceChanges(
  batch: WriteBatch,
  db: Firestore,
  uid: string,
  before: readonly BalanceTransaction[],
  after: readonly BalanceTransaction[],
  currencies: AccountCurrencies,
) {
  const deltas = accountDeltas(before, after, (id) => currencies[id])
  for (const [id, delta] of deltas) {
    batch.update(accountRef(db, uid, id), {
      txTotal: increment(delta),
      updatedAt: serverTimestamp(),
    })
  }
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export const transactionsApi = api.injectEndpoints({
  endpoints: (build) => ({
    /**
     * The transaction list, a page at a time (cursor pagination with startAfter). Refetches
     * when any transaction is created or edited: a tiny live listener watches the most
     * recently updated doc and invalidates the list when it changes.
     */
    getTransactions: build.infiniteQuery<TxPage, TxListArg, TxCursor | null>({
      infiniteQueryOptions: {
        initialPageParam: null,
        getNextPageParam: (lastPage) => lastPage.next,
      },
      async queryFn({ queryArg, pageParam }, { dispatch }) {
        try {
          return { data: await fetchTransactionsPage(queryArg, pageParam, dispatch) }
        } catch (error) {
          console.error('[firestore] transactions page failed', error)
          return { error: firestoreErrorMessage(error) }
        }
      },
      async onCacheEntryAdded({ uid }, { dispatch, cacheDataLoaded, cacheEntryRemoved }) {
        try {
          await cacheDataLoaded
        } catch {
          return
        }
        let first = true
        let pendingId: string | null = null
        const unsubscribe = onSnapshot(
          query(txCol(getFirebase().db, uid), orderBy('updatedAt', 'desc'), limit(1)),
          (snap) => {
            const top = snap.docs[0]
            if (first) {
              first = false
              return
            }
            // A local write fires twice: now (pending) and when the server confirms it.
            // The list already refetched for the first, so skip the confirmation.
            if (top && !snap.metadata.hasPendingWrites && top.id === pendingId) {
              pendingId = null
              return
            }
            pendingId = snap.metadata.hasPendingWrites && top ? top.id : null
            dispatch(transactionsApi.util.invalidateTags([LIST]))
          },
          // The list itself reports errors; a failed change signal only loses live refresh.
          (error) => console.warn('[firestore] transactions change listener stopped', error),
        )
        await cacheEntryRemoved
        unsubscribe()
      },
      providesTags: [LIST],
    }),

    createTransaction: build.mutation<
      { id: string },
      {
        uid: string
        values: TransactionFormValues
        dateIso: string
        currencies: AccountCurrencies
      }
    >({
      queryFn: ({ uid, values, dateIso, currencies }, { dispatch }) =>
        firestoreWrite(dispatch, 'Could not save the transaction', () => {
          const db = getFirebase().db
          const batch = writeBatch(db)
          const ref = doc(txCol(db, uid))
          batch.set(ref, {
            ...toFields(values, dateIso),
            ...(values.toAccountId ? { toAccountId: values.toAccountId } : {}),
            ...(values.categoryId ? { categoryId: values.categoryId } : {}),
            attachments: [],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            createdBy: uid,
          })
          applyBalanceChanges(batch, db, uid, [], [values], currencies)
          return { commit: batch.commit(), result: { id: ref.id } }
        }),
    }),

    updateTransaction: build.mutation<
      null,
      {
        uid: string
        before: Transaction
        values: TransactionFormValues
        dateIso: string
        currencies: AccountCurrencies
      }
    >({
      queryFn: ({ uid, before, values, dateIso, currencies }, { dispatch }) =>
        firestoreWrite(dispatch, 'Could not save the transaction', () => {
          const db = getFirebase().db
          const batch = writeBatch(db)
          batch.update(doc(txCol(db, uid), before.id), {
            ...toFields(values, dateIso),
            toAccountId: values.toAccountId ?? deleteField(),
            categoryId: values.categoryId ?? deleteField(),
            updatedAt: serverTimestamp(),
          })
          applyBalanceChanges(batch, db, uid, [before], [values], currencies)
          return { commit: batch.commit(), result: null }
        }),
    }),

    /** Deletes transactions and reverses their balance changes, in batches of BULK_CHUNK. */
    deleteTransactions: build.mutation<
      null,
      { uid: string; transactions: Transaction[]; currencies: AccountCurrencies }
    >({
      queryFn: ({ uid, transactions, currencies }, { dispatch }) =>
        firestoreWrite(dispatch, 'Could not delete the transactions', () => {
          const db = getFirebase().db
          const commits = chunks(transactions, BULK_CHUNK).map((part) => {
            const batch = writeBatch(db)
            for (const tx of part) batch.delete(doc(txCol(db, uid), tx.id))
            applyBalanceChanges(batch, db, uid, part, [], currencies)
            return batch.commit()
          })
          return { commit: Promise.all(commits), result: null }
        }),
      invalidatesTags: [LIST],
    }),

    /** Moves expenses or income to another category (balances don't change). */
    recategorizeTransactions: build.mutation<
      null,
      { uid: string; ids: string[]; categoryId: string | null }
    >({
      queryFn: ({ uid, ids, categoryId }, { dispatch }) =>
        firestoreWrite(dispatch, 'Could not change the category', () => {
          const db = getFirebase().db
          const commits = chunks(ids, BULK_CHUNK).map((part) => {
            const batch = writeBatch(db)
            for (const id of part) {
              batch.update(doc(txCol(db, uid), id), {
                categoryId: categoryId ?? deleteField(),
                updatedAt: serverTimestamp(),
              })
            }
            return batch.commit()
          })
          return { commit: Promise.all(commits), result: null }
        }),
    }),
  }),
})

export const {
  useGetTransactionsInfiniteQuery,
  useCreateTransactionMutation,
  useUpdateTransactionMutation,
  useDeleteTransactionsMutation,
  useRecategorizeTransactionsMutation,
} = transactionsApi
