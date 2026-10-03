import {
  Timestamp,
  collection,
  deleteDoc,
  deleteField,
  doc,
  documentId,
  getDocs,
  increment,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentReference,
  type Firestore,
  type Transaction as FirestoreTransaction,
} from 'firebase/firestore'
import { transactionSchema, type TransactionFormValues } from '@/features/transactions/schemas'
import type { BalanceTransaction, Transaction } from '@/features/transactions/types'
import { accountDeltas } from '@/features/transactions/utils'
import { getFirebase } from '@/lib/firebase'
import { api } from '@/services/api'
import {
  UserFacingError,
  collectionListener,
  firestoreErrorMessage,
  firestoreWrite,
  parseQuerySnapshot,
  parseSnapshot,
  reportInvalid,
} from '@/services/firestore'
import { addCalendarDays, calendarDate, zonedTime } from '@/utils/dates'
import { nextOccurrence, occurrencesBetween } from './engine'
import type { RecurrenceValues } from './recurrence'
import { SKIPPED_KEYS_MAX, recurringSchema, type RecurringTemplate } from './schemas'
import type { RecurringRule } from './types'
import {
  CATCH_UP_CAP,
  compareRules,
  occurrenceTxId,
  planCatchUp,
  planRuleUpdate,
  ruleNextDate,
  ruleSchedule,
  ruleToday,
} from './utils'

const rulesCol = (db: Firestore, uid: string) => collection(db, 'users', uid, 'recurring')
const ruleRef = (db: Firestore, uid: string, id: string) => doc(rulesCol(db, uid), id)
const txCol = (db: Firestore, uid: string) => collection(db, 'users', uid, 'transactions')
const accountRef = (db: Firestore, uid: string, id: string) => doc(db, 'users', uid, 'accounts', id)

const LIST = { type: 'Recurring' as const, id: 'LIST' }
const POSTED = { type: 'Recurring' as const, id: 'POSTED' }
const TX_LIST = { type: 'Transaction' as const, id: 'LIST' }

/** Occurrences are posted at local noon in the rule's timezone, safely inside their day. */
const POST_HOUR = 12
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

/** Midnight that starts `date` in `timeZone`, as a Timestamp. */
const dayStamp = (date: string, timeZone: string) => Timestamp.fromDate(zonedTime(date, timeZone))

/** Reads a rule inside a transaction; throws when it's gone or unreadable. */
async function readRule(tx: FirestoreTransaction, ref: DocumentReference): Promise<RecurringRule> {
  const snap = await tx.get(ref)
  if (!snap.exists()) throw new UserFacingError('This recurring rule no longer exists.')
  const parsed = parseSnapshot(snap, recurringSchema)
  if (!parsed.ok) throw new UserFacingError('This recurring rule has unexpected data.')
  return parsed.value
}

/** Account currencies a template touches, read inside the transaction. */
async function readCurrencies(
  tx: FirestoreTransaction,
  db: Firestore,
  uid: string,
  template: RecurringTemplate,
): Promise<Record<string, string>> {
  const ids = [template.accountId, template.toAccountId].filter((id): id is string => !!id)
  const out: Record<string, string> = {}
  for (const id of ids) {
    const snap = await tx.get(accountRef(db, uid, id))
    const currency = snap.get('currency') as unknown
    if (!snap.exists() || typeof currency !== 'string') {
      throw new UserFacingError("This rule's account no longer exists. Edit the rule to pick one.")
    }
    out[id] = currency
  }
  return out
}

/** Writes one occurrence's transaction (its id makes a second write impossible to duplicate). */
function writeOccurrence(
  tx: FirestoreTransaction,
  db: Firestore,
  uid: string,
  rule: RecurringRule,
  key: string,
  date: string,
  template: RecurringTemplate,
) {
  tx.set(doc(txCol(db, uid), occurrenceTxId(rule.id, key)), {
    ...template,
    date: Timestamp.fromDate(zonedTime(date, rule.timeZone, POST_HOUR)),
    attachments: [],
    recurringId: rule.id,
    occurrenceKey: key,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: uid,
  })
}

function writeBalances(
  tx: FirestoreTransaction,
  db: Firestore,
  uid: string,
  posted: readonly BalanceTransaction[],
  currencies: Record<string, string>,
) {
  for (const [id, delta] of accountDeltas([], posted, (a) => currencies[a])) {
    tx.update(accountRef(db, uid, id), { txTotal: increment(delta), updatedAt: serverTimestamp() })
  }
}

/**
 * The first occurrence from the rule's next date on that is not skipped, not in `handled`,
 * and has no transaction yet. Reads inside the transaction, so it must run before any write.
 */
async function firstUnhandled(
  tx: FirestoreTransaction,
  db: Firestore,
  uid: string,
  rule: RecurringRule,
  skippedKeys: readonly string[],
  handled: ReadonlySet<string>,
): Promise<string | null> {
  const start = ruleNextDate(rule)
  if (!start) return null
  const schedule = { ...ruleSchedule(rule), skippedKeys }
  let from = start
  for (let checked = 0; checked < CATCH_UP_CAP; checked++) {
    const next = nextOccurrence(schedule, from)
    if (!next) return null
    if (!handled.has(next.key)) {
      const snap = await tx.get(doc(txCol(db, uid), occurrenceTxId(rule.id, next.key)))
      if (!snap.exists()) return next.date
    }
    from = addCalendarDays(next.date, 1)
  }
  return from
}

function nextRunFields(rule: RecurringRule, nextDate: string | null, skippedKeys: string[]) {
  return {
    nextRunAt: nextDate ? dayStamp(nextDate, rule.timeZone) : null,
    // Keys before the next date can never come up again.
    skippedKeys: skippedKeys.filter((k) => nextDate !== null && k >= nextDate),
    updatedAt: serverTimestamp(),
  }
}

export interface RunResult {
  ruleId: string
  label: string
  /** Occurrences posted by this run. */
  posted: number
  /** Instants (ISO) of the posted transactions, for budget alerts. */
  postedDates: string[]
  /** Due occurrences left for the next run because of the cap. */
  remaining: number
}

/**
 * The catch-up run for one auto rule: posts every due occurrence (at most CATCH_UP_CAP) and
 * advances nextRunAt, all in one transaction. Doc ids are `${ruleId}_${occurrenceKey}` and each
 * is read first, so two tabs or devices racing on the same rule can't post anything twice:
 * Firestore retries the loser, which then finds the docs and the new nextRunAt.
 */
async function runRule(uid: string, ruleId: string, now: Date): Promise<RunResult> {
  const db = getFirebase().db
  return runTransaction(db, async (tx) => {
    const rule = await readRule(tx, ruleRef(db, uid, ruleId))
    const label = rule.template.payee || 'Recurring transaction'
    const empty = { ruleId, label, posted: 0, postedDates: [], remaining: 0 }
    const next = ruleNextDate(rule)
    if (rule.mode !== 'auto' || rule.paused || !next || !rule.nextRunAt) return empty
    if (new Date(rule.nextRunAt).getTime() > now.getTime()) return empty

    const plan = planCatchUp(ruleSchedule(rule), next, ruleToday(rule, now))
    const currencies = await readCurrencies(tx, db, uid, rule.template)
    const existing = await Promise.all(
      plan.due.map((o) => tx.get(doc(txCol(db, uid), occurrenceTxId(rule.id, o.key)))),
    )
    const toPost = plan.due.filter((_, i) => !existing[i]?.exists())

    for (const o of toPost) writeOccurrence(tx, db, uid, rule, o.key, o.date, rule.template)
    writeBalances(
      tx,
      db,
      uid,
      toPost.map(() => rule.template),
      currencies,
    )
    tx.update(ruleRef(db, uid, ruleId), {
      ...nextRunFields(rule, plan.nextDate, rule.skippedKeys),
      lastRunAt: serverTimestamp(),
    })
    return {
      ruleId,
      label,
      posted: toPost.length,
      postedDates: toPost.map((o) => zonedTime(o.date, rule.timeZone, POST_HOUR).toISOString()),
      remaining: plan.remaining,
    }
  })
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
          return { data: await runRule(uid, ruleId, new Date()) }
        } catch (error) {
          console.warn('[recurring] catch-up failed', ruleId, error)
          return { error: firestoreErrorMessage(error) }
        }
      },
      invalidatesTags: [TX_LIST, POSTED],
    }),

    /** Posts a remind-mode occurrence, optionally with a different amount. */
    confirmOccurrence: build.mutation<
      { dateIso: string },
      { uid: string; ruleId: string; key: string; amount: number; baseAmount: number }
    >({
      async queryFn({ uid, ruleId, key, amount, baseAmount }) {
        const db = getFirebase().db
        try {
          const dateIso = await runTransaction(db, async (tx) => {
            const rule = await readRule(tx, ruleRef(db, uid, ruleId))
            const schedule = ruleSchedule(rule)
            const occurrence = occurrencesBetween(schedule, key, key)[0]
            if (!occurrence) throw new UserFacingError('This occurrence is no longer scheduled.')
            const txRef = doc(txCol(db, uid), occurrenceTxId(rule.id, key))
            if ((await tx.get(txRef)).exists()) {
              throw new UserFacingError('This occurrence was already posted.')
            }
            const currencies = await readCurrencies(tx, db, uid, rule.template)
            const nextDate = await firstUnhandled(
              tx,
              db,
              uid,
              rule,
              rule.skippedKeys,
              new Set([key]),
            )
            const template = { ...rule.template, amount, baseAmount }
            writeOccurrence(tx, db, uid, rule, key, occurrence.date, template)
            writeBalances(tx, db, uid, [template], currencies)
            tx.update(ruleRef(db, uid, rule.id), {
              ...nextRunFields(rule, nextDate, rule.skippedKeys),
              lastRunAt: serverTimestamp(),
            })
            return zonedTime(occurrence.date, rule.timeZone, POST_HOUR).toISOString()
          })
          return { data: { dateIso } }
        } catch (error) {
          console.warn('[recurring] confirm failed', error)
          return { error: firestoreErrorMessage(error) }
        }
      },
      invalidatesTags: [TX_LIST, POSTED],
    }),

    /** Skips one occurrence (any mode): it is never posted or reminded. */
    skipOccurrence: build.mutation<null, { uid: string; ruleId: string; key: string }>({
      async queryFn({ uid, ruleId, key }) {
        const db = getFirebase().db
        try {
          await runTransaction(db, async (tx) => {
            const rule = await readRule(tx, ruleRef(db, uid, ruleId))
            if (rule.skippedKeys.includes(key)) return
            if (rule.skippedKeys.length >= SKIPPED_KEYS_MAX) {
              throw new UserFacingError('Too many skipped dates on this rule. Edit it instead.')
            }
            const skippedKeys = [...rule.skippedKeys, key].sort()
            const nextDate = await firstUnhandled(tx, db, uid, rule, skippedKeys, new Set())
            tx.update(ruleRef(db, uid, rule.id), nextRunFields(rule, nextDate, skippedKeys))
          })
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
