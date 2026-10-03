import {
  Timestamp,
  collection,
  doc,
  increment,
  runTransaction,
  serverTimestamp,
  type DocumentReference,
  type Firestore,
  type Transaction as FirestoreTransaction,
} from 'firebase/firestore'
import type { BalanceTransaction } from '@/features/transactions/types'
import { accountDeltas } from '@/features/transactions/utils'
import { UserFacingError, parseSnapshot } from '@/services/firestore'
import { addCalendarDays, zonedTime } from '@/utils/dates'
import { nextOccurrence, occurrencesBetween } from './engine'
import { SKIPPED_KEYS_MAX, recurringSchema, type RecurringTemplate } from './schemas'
import type { RecurringRule } from './types'
import {
  CATCH_UP_CAP,
  occurrenceTxId,
  planCatchUp,
  ruleNextDate,
  ruleSchedule,
  ruleToday,
} from './utils'

/**
 * The Firestore transactions behind recurring rules: the catch-up run, confirm and skip. Each
 * takes the Firestore instance so the rules tests can run them against the emulator.
 */

export const rulesCol = (db: Firestore, uid: string) => collection(db, 'users', uid, 'recurring')
export const ruleRef = (db: Firestore, uid: string, id: string) => doc(rulesCol(db, uid), id)
export const txCol = (db: Firestore, uid: string) => collection(db, 'users', uid, 'transactions')
const accountRef = (db: Firestore, uid: string, id: string) => doc(db, 'users', uid, 'accounts', id)

/** Occurrences are posted at local noon in the rule's timezone, safely inside their day. */
export const POST_HOUR = 12

/** Midnight that starts `date` in `timeZone`, as a Timestamp. */
export const dayStamp = (date: string, timeZone: string) =>
  Timestamp.fromDate(zonedTime(date, timeZone))

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
export async function runRule(
  db: Firestore,
  uid: string,
  ruleId: string,
  now: Date,
): Promise<RunResult> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await runRuleOnce(db, uid, ruleId, now)
    } catch (error) {
      // When another tab commits the same occurrences first, the loser's writes can be refused
      // (they'd now overwrite existing docs) instead of retried. Running again reads the new
      // state and posts nothing twice.
      const code = (error as { code?: unknown } | null)?.code
      const raced =
        code === 'permission-denied' || code === 'aborted' || code === 'failed-precondition'
      if (!raced || attempt >= RACE_RETRIES) throw error
    }
  }
}

/** Attempts per catch-up run when a concurrent run on another tab gets in first. */
const RACE_RETRIES = 3

function runRuleOnce(db: Firestore, uid: string, ruleId: string, now: Date): Promise<RunResult> {
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

export interface ConfirmArg {
  uid: string
  ruleId: string
  key: string
  amount: number
  baseAmount: number
}

/** Posts one remind-mode occurrence (amount may differ) and advances nextRunAt. */
export function confirmOccurrenceTx(
  db: Firestore,
  { uid, ruleId, key, amount, baseAmount }: ConfirmArg,
): Promise<string> {
  return runTransaction(db, async (tx) => {
    const rule = await readRule(tx, ruleRef(db, uid, ruleId))
    const occurrence = occurrencesBetween(ruleSchedule(rule), key, key)[0]
    if (!occurrence) throw new UserFacingError('This occurrence is no longer scheduled.')
    const txRef = doc(txCol(db, uid), occurrenceTxId(rule.id, key))
    if ((await tx.get(txRef)).exists()) {
      throw new UserFacingError('This occurrence was already posted.')
    }
    const currencies = await readCurrencies(tx, db, uid, rule.template)
    const nextDate = await firstUnhandled(tx, db, uid, rule, rule.skippedKeys, new Set([key]))
    const template = { ...rule.template, amount, baseAmount }
    writeOccurrence(tx, db, uid, rule, key, occurrence.date, template)
    writeBalances(tx, db, uid, [template], currencies)
    tx.update(ruleRef(db, uid, rule.id), {
      ...nextRunFields(rule, nextDate, rule.skippedKeys),
      lastRunAt: serverTimestamp(),
    })
    return zonedTime(occurrence.date, rule.timeZone, POST_HOUR).toISOString()
  })
}

/** Skips one occurrence (any mode) and advances nextRunAt past handled ones. */
export function skipOccurrenceTx(
  db: Firestore,
  { uid, ruleId, key }: { uid: string; ruleId: string; key: string },
): Promise<void> {
  return runTransaction(db, async (tx) => {
    const rule = await readRule(tx, ruleRef(db, uid, ruleId))
    if (rule.skippedKeys.includes(key)) return
    if (rule.skippedKeys.length >= SKIPPED_KEYS_MAX) {
      throw new UserFacingError('Too many skipped dates on this rule. Edit it instead.')
    }
    const skippedKeys = [...rule.skippedKeys, key].sort()
    const nextDate = await firstUnhandled(tx, db, uid, rule, skippedKeys, new Set())
    tx.update(ruleRef(db, uid, rule.id), nextRunFields(rule, nextDate, skippedKeys))
  })
}
