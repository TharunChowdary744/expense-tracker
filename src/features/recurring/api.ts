import {
  deleteDoc,
  deleteField,
  doc,
  documentId,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { transactionSchema, type TransactionFormValues } from '@/features/transactions/schemas'
import type { Transaction } from '@/features/transactions/types'
import { getFirebase } from '@/lib/firebase'
import { api } from '@/services/api'
import {
  UserFacingError,
  collectionListener,
  firestoreErrorMessage,
  firestoreWrite,
  parseQuerySnapshot,
  reportInvalid,
} from '@/services/firestore'
import { calendarDate } from '@/utils/dates'
import { nextOccurrence } from './engine'
import type { RecurrenceValues } from './recurrence'
import {
  confirmOccurrenceTx,
  dayStamp,
  ruleRef,
  rulesCol,
  runRule,
  skipOccurrenceTx,
  txCol,
  type ConfirmArg,
  type RunResult,
} from './runner'
import { recurringSchema, type RecurringTemplate } from './schemas'
import type { RecurringRule } from './types'
import { compareRules, planRuleUpdate, ruleToday } from './utils'

export type { RunResult } from './runner'

const LIST = { type: 'Recurring' as const, id: 'LIST' }
const POSTED = { type: 'Recurring' as const, id: 'POSTED' }
const TX_LIST = { type: 'Transaction' as const, id: 'LIST' }

/** Firestore's `in` filter takes at most 30 values. */
const IN_LIMIT = 30

/** The template stored on a rule, from the transaction form's values. */
function templateFrom(values: TransactionFormValues): RecurringTemplate {
  return {
    type: values.type,
    amount: values.amount,
    currency: values.currency,
    fxRateToBase: values.fxRateToBase,
    baseAmount: values.baseAmount,
    accountId: values.accountId,
    ...(values.toAccountId ? { toAccountId: values.toAccountId } : {}),
    ...(values.categoryId ? { categoryId: values.categoryId } : {}),
    tags: values.tags,
    payee: values.payee,
    note: values.note,
  }
}

export interface CreateRuleArg {
  uid: string
  values: TransactionFormValues & { recurrence: RecurrenceValues }
  timeZone: string
}

export const recurringApi = api.injectEndpoints({
  endpoints: (build) => ({
    /** Live list of recurring rules: active by next date, then paused, then ended. */
    getRecurring: build.query<RecurringRule[], string>({
      ...collectionListener({
        label: 'recurring rules',
        uidOf: (uid: string) => uid,
        schema: recurringSchema,
        query: (uid, db) => query(rulesCol(db, uid)),
        sort: compareRules,
      }),
      providesTags: (result) => [
        LIST,
        ...(result ?? []).map((r) => ({ type: 'Recurring' as const, id: r.id })),
      ],
    }),

    /** Which of these occurrence transaction ids already exist (confirmed out of order). */
    getPostedOccurrences: build.query<string[], { uid: string; ids: string[] }>({
      async queryFn({ uid, ids }) {
        if (ids.length === 0) return { data: [] }
        try {
          const db = getFirebase().db
          const found: string[] = []
          for (let i = 0; i < ids.length; i += IN_LIMIT) {
            const chunk = ids.slice(i, i + IN_LIMIT)
            const snap = await getDocs(query(txCol(db, uid), where(documentId(), 'in', chunk)))
            for (const d of snap.docs) found.push(d.id)
          }
          return { data: found }
        } catch (error) {
          return { error: firestoreErrorMessage(error) }
        }
      },
      providesTags: [POSTED, TX_LIST],
    }),

    /** Transactions a rule has posted (for the delete dialog). */
    getRuleTransactions: build.query<Transaction[], { uid: string; ruleId: string }>({
      async queryFn({ uid, ruleId }, { dispatch }) {
        try {
          const snap = await getDocs(
            query(txCol(getFirebase().db, uid), where('recurringId', '==', ruleId)),
          )
          const { items, invalid } = parseQuerySnapshot(snap, transactionSchema)
          reportInvalid(dispatch, 'transactions', invalid)
          return { data: items }
        } catch (error) {
          return { error: firestoreErrorMessage(error) }
        }
      },
      providesTags: [TX_LIST],
    }),

    createRecurring: build.mutation<{ id: string }, CreateRuleArg>({
      queryFn: ({ uid, values, timeZone }, { dispatch }) =>
        firestoreWrite(dispatch, 'Could not create the recurring rule', () => {
          const ref = doc(rulesCol(getFirebase().db, uid))
          const r = values.recurrence
          const schedule = {
            frequency: r.frequency,
            interval: r.interval,
            ...(r.byWeekday ? { byWeekday: r.byWeekday } : {}),
            ...(r.byMonthDay !== undefined ? { byMonthDay: r.byMonthDay } : {}),
            startDate: values.date,
            ...(r.endDate ? { endDate: r.endDate } : {}),
            ...(r.maxOccurrences ? { maxOccurrences: r.maxOccurrences } : {}),
          }
          const first = nextOccurrence(schedule, values.date)
          const commit = setDoc(ref, {
            template: templateFrom(values),
            ...schedule,
            startDate: dayStamp(values.date, timeZone),
            ...(r.endDate ? { endDate: dayStamp(r.endDate, timeZone) } : {}),
            timeZone,
            nextRunAt: first ? dayStamp(first.date, timeZone) : null,
            lastRunAt: null,
            mode: r.mode,
            paused: false,
            skippedKeys: [],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            createdBy: uid,
          })
          return { commit, result: { id: ref.id } }
        }),
      invalidatesTags: [LIST],
    }),

    /** "This and future": new template and schedule; posted transactions are not touched. */
    updateRecurring: build.mutation<
      null,
      {
        uid: string
        rule: RecurringRule
        values: TransactionFormValues & { recurrence: RecurrenceValues }
      }
    >({
      queryFn: ({ uid, rule, values }, { dispatch }) =>
        firestoreWrite(dispatch, 'Could not save the recurring rule', () => {
          const planned = planRuleUpdate(rule, values.date, values.recurrence)
          if (!planned.ok) throw new UserFacingError(planned.message)
          const u = planned.update
          const tz = rule.timeZone
          const commit = updateDoc(ruleRef(getFirebase().db, uid, rule.id), {
            template: templateFrom(values),
            frequency: u.frequency,
            interval: u.interval,
            byWeekday: u.byWeekday ?? deleteField(),
            byMonthDay: u.byMonthDay ?? deleteField(),
            startDate: dayStamp(u.startDate, tz),
            endDate: u.endDate ? dayStamp(u.endDate, tz) : deleteField(),
            maxOccurrences: u.maxOccurrences ?? deleteField(),
            mode: values.recurrence.mode,
            skippedKeys: u.skippedKeys,
            nextRunAt: u.nextDate ? dayStamp(u.nextDate, tz) : null,
            updatedAt: serverTimestamp(),
          })
          return { commit, result: null }
        }),
      invalidatesTags: (_r, _e, { rule }) => [LIST, POSTED, { type: 'Recurring', id: rule.id }],
    }),

    setRecurringPaused: build.mutation<null, { uid: string; id: string; paused: boolean }>({
      queryFn: ({ uid, id, paused }, { dispatch }) =>
        firestoreWrite(
          dispatch,
          paused ? 'Could not pause the rule' : 'Could not resume the rule',
          () => ({
            commit: updateDoc(ruleRef(getFirebase().db, uid, id), {
              paused,
              updatedAt: serverTimestamp(),
            }),
            result: null,
          }),
        ),
      invalidatesTags: (_r, _e, { id }) => [LIST, { type: 'Recurring', id }],
    }),

    /** Ends the schedule today: nothing more is posted or reminded. */
    endRecurring: build.mutation<null, { uid: string; rule: RecurringRule }>({
      queryFn: ({ uid, rule }, { dispatch }) =>
        firestoreWrite(dispatch, 'Could not end the rule', () => {
          const today = ruleToday(rule)
          const start = calendarDate(rule.startDate, rule.timeZone)
          return {
            commit: updateDoc(ruleRef(getFirebase().db, uid, rule.id), {
              endDate: dayStamp(today < start ? start : today, rule.timeZone),
              nextRunAt: null,
              skippedKeys: [],
              updatedAt: serverTimestamp(),
            }),
            result: null,
          }
        }),
      invalidatesTags: (_r, _e, { rule }) => [LIST, { type: 'Recurring', id: rule.id }],
    }),

    /** Deletes the rule only; the delete dialog removes its transactions first when asked. */
    deleteRecurring: build.mutation<null, { uid: string; id: string }>({
      queryFn: ({ uid, id }, { dispatch }) =>
        firestoreWrite(dispatch, 'Could not delete the rule', () => ({
          commit: deleteDoc(ruleRef(getFirebase().db, uid, id)),
          result: null,
        })),
      invalidatesTags: (_r, _e, { id }) => [LIST, { type: 'Recurring', id }],
    }),

    /** Catch-up run for one auto rule (see `runRule`). Needs a connection (a transaction). */
    runRecurring: build.mutation<RunResult, { uid: string; ruleId: string }>({
      async queryFn({ uid, ruleId }) {
        try {
          return { data: await runRule(getFirebase().db, uid, ruleId, new Date()) }
        } catch (error) {
          console.warn('[recurring] catch-up failed', ruleId, error)
          return { error: firestoreErrorMessage(error) }
        }
      },
      invalidatesTags: [TX_LIST, POSTED],
    }),

    /** Posts a remind-mode occurrence, optionally with a different amount. */
    confirmOccurrence: build.mutation<{ dateIso: string }, ConfirmArg>({
      async queryFn(arg) {
        try {
          return { data: { dateIso: await confirmOccurrenceTx(getFirebase().db, arg) } }
        } catch (error) {
          console.warn('[recurring] confirm failed', error)
          return { error: firestoreErrorMessage(error) }
        }
      },
      invalidatesTags: [TX_LIST, POSTED],
    }),

    /** Skips one occurrence (any mode): it is never posted or reminded. */
    skipOccurrence: build.mutation<null, { uid: string; ruleId: string; key: string }>({
      async queryFn(arg) {
        try {
          await skipOccurrenceTx(getFirebase().db, arg)
          return { data: null }
        } catch (error) {
          console.warn('[recurring] skip failed', error)
          return { error: firestoreErrorMessage(error) }
        }
      },
      invalidatesTags: [POSTED],
    }),
  }),
})

export const {
  useGetRecurringQuery,
  useGetPostedOccurrencesQuery,
  useGetRuleTransactionsQuery,
  useCreateRecurringMutation,
  useUpdateRecurringMutation,
  useSetRecurringPausedMutation,
  useEndRecurringMutation,
  useDeleteRecurringMutation,
  useRunRecurringMutation,
  useConfirmOccurrenceMutation,
  useSkipOccurrenceMutation,
} = recurringApi
