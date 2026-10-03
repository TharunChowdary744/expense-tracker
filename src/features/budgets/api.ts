import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromCache,
  getDocs,
  getDocsFromCache,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
  type Query,
  type QuerySnapshot,
} from 'firebase/firestore'
import { defaultSettings } from '@/features/auth/defaults'
import { categorySchema } from '@/features/categories/schemas'
import { transactionSchema } from '@/features/transactions/schemas'
import type { Transaction } from '@/features/transactions/types'
import { getFirebase } from '@/lib/firebase'
import { api } from '@/services/api'
import {
  collectionListener,
  firestoreErrorMessage,
  firestoreWrite,
  parseQuerySnapshot,
  reportInvalid,
  settleWrite,
  type AnyDispatch,
} from '@/services/firestore'
import { calendarDate, deviceTimeZone, localMidnight } from '@/utils/dates'
import { alertLoadRange, alertMessage, planBudgetAlerts } from './alerts'
import type { WeekStart } from './period'
import { budgetSchema, type BudgetFormValues } from './schemas'
import type { Budget, PlannedAlert } from './types'
import { initialStartDate } from './utils'

const budgetsCol = (db: Firestore, uid: string) => collection(db, 'users', uid, 'budgets')
const txCol = (db: Firestore, uid: string) => collection(db, 'users', uid, 'transactions')
const notificationRef = (db: Firestore, uid: string, id: string) =>
  doc(db, 'users', uid, 'notifications', id)

const LIST = { type: 'Budget' as const, id: 'LIST' }

export interface ExpenseRangeArg {
  uid: string
  /** yyyy-MM-dd, inclusive, in the device timezone. */
  start: string
  /** yyyy-MM-dd, exclusive. */
  end: string
}

/** Expenses dated in [start, end), newest first (uses the type + date index). */
function expensesQuery(db: Firestore, { uid, start, end }: ExpenseRangeArg): Query {
  return query(
    txCol(db, uid),
    where('type', '==', 'expense'),
    where('date', '>=', Timestamp.fromDate(localMidnight(start))),
    where('date', '<', Timestamp.fromDate(localMidnight(end))),
    orderBy('date', 'desc'),
  )
}

function compareBudgets(a: Budget, b: Budget): number {
  return (
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id)
  )
}

/** Reads from the server, or from the offline cache when the server can't be reached. */
async function readQuery(q: Query): Promise<QuerySnapshot> {
  try {
    return await getDocs(q)
  } catch (error) {
    if ((error as { code?: string }).code !== 'unavailable') throw error
    return getDocsFromCache(q)
  }
}

async function readDoc(ref: DocumentReference): Promise<DocumentSnapshot | null> {
  try {
    return await getDoc(ref)
  } catch (error) {
    if ((error as { code?: string }).code !== 'unavailable') throw error
    // Not in the offline cache either: treat as missing.
    return getDocFromCache(ref).catch(() => null)
  }
}

export interface AlertCheckArg {
  uid: string
  /** Instants (ISO) of the transactions just written; their periods are checked too. */
  affectedDates: string[]
}

export interface CreatedAlert extends PlannedAlert {
  title: string
  body: string
}

/**
 * Creates any budget threshold notifications that are now due. Runs after every transaction
 * write; the notification id is the dedupe key, so each threshold alerts once per period.
 */
async function checkAlerts(
  { uid, affectedDates }: AlertCheckArg,
  dispatch: AnyDispatch,
): Promise<CreatedAlert[]> {
  const db = getFirebase().db
  const timeZone = deviceTimeZone()
  const today = calendarDate(new Date(), timeZone)

  const budgetSnap = await readQuery(query(budgetsCol(db, uid)))
  const { items: budgets, invalid } = parseQuerySnapshot(budgetSnap, budgetSchema)
  reportInvalid(dispatch, 'budgets', invalid)
  if (budgets.length === 0) return []

  const userSnap = await readDoc(doc(db, 'users', uid))
  const raw = (userSnap?.data() ?? {}) as {
    settings?: {
      baseCurrency?: unknown
      locale?: unknown
      weekStartsOn?: unknown
      notificationPrefs?: { budgetAlerts?: unknown }
    }
  }
  const fallback = defaultSettings(
    typeof navigator === 'undefined' ? undefined : navigator.language,
  )
  const settings = raw.settings ?? {}
  if (settings.notificationPrefs?.budgetAlerts === false) return []
  const baseCurrency =
    typeof settings.baseCurrency === 'string' ? settings.baseCurrency : fallback.baseCurrency
  const locale = typeof settings.locale === 'string' ? settings.locale : fallback.locale
  const weekStartsOn: WeekStart =
    settings.weekStartsOn === 0 || settings.weekStartsOn === 1
      ? settings.weekStartsOn
      : fallback.weekStartsOn

  const dates = affectedDates.map((iso) => calendarDate(iso, timeZone))
  const range = alertLoadRange(budgets, today, dates, weekStartsOn)
  if (!range) return []
  const [txSnap, categorySnap] = await Promise.all([
    readQuery(expensesQuery(db, { uid, ...range })),
    budgets.some((b) => b.categoryIds.length > 0)
      ? readQuery(query(collection(db, 'users', uid, 'categories')))
      : null,
  ])
  const transactions = parseQuerySnapshot(txSnap, transactionSchema).items
  const categories = categorySnap ? parseQuerySnapshot(categorySnap, categorySchema).items : []

  const candidates = planBudgetAlerts({
    budgets,
    transactions,
    categories,
    today,
    affectedDates: dates,
    weekStartsOn,
    timeZone,
    existing: new Set(),
  })
  if (candidates.length === 0) return []
  const existing = await Promise.all(
    candidates.map(async (c) => (await readDoc(notificationRef(db, uid, c.id)))?.exists() ?? false),
  )
  const fresh = candidates.filter((_, i) => !existing[i])
  if (fresh.length === 0) return []

  const batch = writeBatch(db)
  const created = fresh.map((alert) => {
    const { title, body, link } = alertMessage(alert, baseCurrency, locale)
    batch.set(notificationRef(db, uid, alert.id), {
      type: 'budget-threshold',
      title,
      body,
      link,
      read: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: uid,
    })
    return { ...alert, title, body }
  })
  // Another device may have created the same alert first; the rules then refuse this write,
  // which is fine (it already exists), so a late failure is only logged.
  await settleWrite(batch.commit(), (error) =>
    console.warn('[budgets] alert notification not saved', error),
  )
  return created
}

export const budgetsApi = api.injectEndpoints({
  endpoints: (build) => ({
    /** Live list of the user's budgets, by name. */
    getBudgets: build.query<Budget[], string>({
      ...collectionListener({
        label: 'budgets',
        uidOf: (uid: string) => uid,
        schema: budgetSchema,
        query: (uid, db) => query(budgetsCol(db, uid)),
        sort: compareBudgets,
      }),
      providesTags: (result) => [
        LIST,
        ...(result ?? []).map((b) => ({ type: 'Budget' as const, id: b.id })),
      ],
    }),

    /** Live expenses in a date range, for budget cards and the budget detail page. */
    getExpensesInRange: build.query<Transaction[], ExpenseRangeArg>({
      ...collectionListener({
        label: 'expenses',
        uidOf: (arg: ExpenseRangeArg) => arg.uid,
        schema: transactionSchema,
        query: (arg, db) => expensesQuery(db, arg),
      }),
      providesTags: [{ type: 'Transaction', id: 'LIST' }],
    }),

    createBudget: build.mutation<
      { id: string },
      { uid: string; values: BudgetFormValues; weekStartsOn: WeekStart }
    >({
      queryFn: ({ uid, values, weekStartsOn }, { dispatch }) =>
        firestoreWrite(dispatch, 'Could not create the budget', () => {
          const ref = doc(budgetsCol(getFirebase().db, uid))
          const start = initialStartDate(values.period, calendarDate(new Date()), weekStartsOn)
          const commit = setDoc(ref, {
            ...values,
            startDate: Timestamp.fromDate(localMidnight(start)),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            createdBy: uid,
          })
          return { commit, result: { id: ref.id } }
        }),
      invalidatesTags: [LIST],
    }),

    /** Pass `weekStartsOn` when the period kind changes, so the start date is reset. */
    updateBudget: build.mutation<
      null,
      { uid: string; id: string; values: BudgetFormValues; weekStartsOn?: WeekStart }
    >({
      queryFn: ({ uid, id, values, weekStartsOn }, { dispatch }) =>
        firestoreWrite(dispatch, 'Could not save the budget', () => ({
          commit: updateDoc(doc(budgetsCol(getFirebase().db, uid), id), {
            ...values,
            ...(weekStartsOn === undefined
              ? {}
              : {
                  startDate: Timestamp.fromDate(
                    localMidnight(
                      initialStartDate(values.period, calendarDate(new Date()), weekStartsOn),
                    ),
                  ),
                }),
            updatedAt: serverTimestamp(),
          }),
          result: null,
        })),
      invalidatesTags: (_r, _e, { id }) => [LIST, { type: 'Budget', id }],
    }),

    deleteBudget: build.mutation<null, { uid: string; id: string }>({
      queryFn: ({ uid, id }, { dispatch }) =>
        firestoreWrite(dispatch, 'Could not delete the budget', () => ({
          commit: deleteDoc(doc(budgetsCol(getFirebase().db, uid), id)),
          result: null,
        })),
      invalidatesTags: (_r, _e, { id }) => [LIST, { type: 'Budget', id }],
    }),

    /** See `checkAlerts`. Dispatched by the budget alert listener, not by components. */
    checkBudgetAlerts: build.mutation<CreatedAlert[], AlertCheckArg>({
      async queryFn(arg, { dispatch }) {
        try {
          return { data: await checkAlerts(arg, dispatch) }
        } catch (error) {
          console.warn('[budgets] alert check failed', error)
          return { error: firestoreErrorMessage(error) }
        }
      },
    }),
  }),
})

export const {
  useGetBudgetsQuery,
  useGetExpensesInRangeQuery,
  useCreateBudgetMutation,
  useUpdateBudgetMutation,
  useDeleteBudgetMutation,
} = budgetsApi
