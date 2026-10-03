import {
  addCalendarDays,
  calendarDate,
  calendarDaysBetween,
  formatCalendarDate,
} from '@/utils/dates'
import { scaleMinor } from '@/utils/money'
import {
  nextOccurrence,
  occurrenceAfter,
  occurrencesBetween,
  occurrencesPerYear,
  type Occurrence,
  type RecurrenceRule,
} from './engine'
import type { RecurrenceValues } from './recurrence'
import type { PendingOccurrence, RecurringRule, RuleStatus } from './types'

/** Most occurrences one catch-up run posts for a rule. */
export const CATCH_UP_CAP = 100

/** The transaction doc id of an occurrence. Deterministic, so a second post can't duplicate. */
export function occurrenceTxId(ruleId: string, key: string): string {
  return `${ruleId}_${key}`
}

/** The rule's schedule as calendar dates in its own timezone, for the engine. */
export function ruleSchedule(
  rule: Pick<
    RecurringRule,
    | 'frequency'
    | 'interval'
    | 'byWeekday'
    | 'byMonthDay'
    | 'startDate'
    | 'endDate'
    | 'maxOccurrences'
    | 'skippedKeys'
    | 'timeZone'
  >,
): RecurrenceRule {
  return {
    frequency: rule.frequency,
    interval: rule.interval,
    ...(rule.byWeekday ? { byWeekday: rule.byWeekday } : {}),
    ...(rule.byMonthDay !== undefined ? { byMonthDay: rule.byMonthDay } : {}),
    startDate: calendarDate(rule.startDate, rule.timeZone),
    ...(rule.endDate ? { endDate: calendarDate(rule.endDate, rule.timeZone) } : {}),
    ...(rule.maxOccurrences ? { maxOccurrences: rule.maxOccurrences } : {}),
    skippedKeys: rule.skippedKeys,
  }
}

/** The date of the first occurrence not yet posted or skipped, or null once ended. */
export function ruleNextDate(rule: Pick<RecurringRule, 'nextRunAt' | 'timeZone'>): string | null {
  return rule.nextRunAt ? calendarDate(rule.nextRunAt, rule.timeZone) : null
}

/** Today in the rule's timezone. */
export function ruleToday(rule: Pick<RecurringRule, 'timeZone'>, now = new Date()): string {
  return calendarDate(now, rule.timeZone)
}

export function ruleStatus(rule: Pick<RecurringRule, 'nextRunAt' | 'paused'>): RuleStatus {
  if (rule.nextRunAt === null) return 'ended'
  return rule.paused ? 'paused' : 'active'
}

/** True when an auto rule has an occurrence due now (the catch-up runner should run). */
export function isDue(rule: RecurringRule, now = new Date()): boolean {
  return (
    rule.mode === 'auto' &&
    !rule.paused &&
    rule.nextRunAt !== null &&
    new Date(rule.nextRunAt).getTime() <= now.getTime()
  )
}

/**
 * What one catch-up run does for a rule: the occurrences from the next unhandled one up to
 * today (at most `cap`), how many more are due beyond the cap, and the new next date.
 */
export function planCatchUp(
  schedule: RecurrenceRule,
  nextDate: string,
  today: string,
  cap = CATCH_UP_CAP,
): { due: Occurrence[]; remaining: number; nextDate: string | null } {
  const all = occurrencesBetween(schedule, nextDate, today)
  const due = all.slice(0, cap)
  const last = due.at(-1)
  const remaining = all.length - due.length
  const next = last ? occurrenceAfter(schedule, last.date) : nextOccurrence(schedule, nextDate)
  return { due, remaining, nextDate: next?.date ?? null }
}

/** Cost of a rule per year and per month, in base-currency minor units. */
export function ruleCost(
  rule: Pick<
    RecurringRule,
    'frequency' | 'interval' | 'byWeekday' | 'startDate' | 'timeZone' | 'template'
  >,
): { yearly: number; monthly: number } {
  const { num, den } = occurrencesPerYear({
    frequency: rule.frequency,
    interval: rule.interval,
    ...(rule.byWeekday ? { byWeekday: rule.byWeekday } : {}),
    startDate: calendarDate(rule.startDate, rule.timeZone),
  })
  const amount = rule.template.baseAmount
  return { yearly: scaleMinor(amount, num, den), monthly: scaleMinor(amount, num, den * 12) }
}

/** Active recurring expenses (subscriptions and bills) with their totals. */
export function subscriptionSummary(rules: readonly RecurringRule[]): {
  items: { rule: RecurringRule; monthly: number; yearly: number }[]
  monthly: number
  yearly: number
} {
  const items = rules
    .filter((r) => r.template.type === 'expense' && ruleStatus(r) === 'active')
    .map((rule) => ({ rule, ...ruleCost(rule) }))
    .sort((a, b) => b.monthly - a.monthly || a.rule.id.localeCompare(b.rule.id))
  return {
    items,
    monthly: items.reduce((sum, i) => sum + i.monthly, 0),
    yearly: items.reduce((sum, i) => sum + i.yearly, 0),
  }
}

/** Most pending occurrences listed per rule. */
export const PENDING_PER_RULE = 30

/**
 * Occurrences of active rules that are due or due within `days` days and not yet posted or
 * skipped. `posted` holds transaction ids already written (occurrences confirmed out of
 * order). Sorted by date.
 */
export function pendingOccurrences(
  rules: readonly RecurringRule[],
  options: {
    days: number
    now?: Date
    posted?: ReadonlySet<string>
    filter?: (rule: RecurringRule) => boolean
  },
): PendingOccurrence[] {
  const { days, now = new Date(), posted, filter } = options
  const out: PendingOccurrence[] = []
  for (const rule of rules) {
    if (ruleStatus(rule) !== 'active' || (filter && !filter(rule))) continue
    const next = ruleNextDate(rule)
    if (!next) continue
    const today = ruleToday(rule, now)
    const schedule = ruleSchedule(rule)
    for (const occurrence of occurrencesBetween(schedule, next, addCalendarDays(today, days), {
      limit: PENDING_PER_RULE,
    })) {
      const txId = occurrenceTxId(rule.id, occurrence.key)
      if (posted?.has(txId)) continue
      out.push({ rule, occurrence, txId, daysAway: calendarDaysBetween(today, occurrence.date) })
    }
  }
  return out.sort(
    (a, b) =>
      a.occurrence.date.localeCompare(b.occurrence.date) || a.rule.id.localeCompare(b.rule.id),
  )
}

/** Ids worth checking for an out-of-order post: every pending occurrence after the first. */
export function postedLookupIds(rules: readonly RecurringRule[], days: number, now = new Date()) {
  const ids: string[] = []
  for (const rule of rules) {
    if (ruleStatus(rule) !== 'active' || rule.mode !== 'remind') continue
    const next = ruleNextDate(rule)
    if (!next) continue
    const until = addCalendarDays(ruleToday(rule, now), days)
    const list = occurrencesBetween(ruleSchedule(rule), next, until, { limit: PENDING_PER_RULE })
    // The first one is unhandled by definition (nextRunAt points at it).
    for (const o of list.slice(1)) ids.push(occurrenceTxId(rule.id, o.key))
  }
  return ids.sort()
}

// ---------------------------------------------------------------------------------------------
// Editing a rule ("this and future")

export interface RuleScheduleUpdate {
  frequency: RecurrenceValues['frequency']
  interval: number
  byWeekday: number[] | null
  byMonthDay: number | null
  startDate: string
  endDate: string | null
  maxOccurrences: number | null
  skippedKeys: string[]
  /** null when the edited schedule has no occurrence left. */
  nextDate: string | null
}

function sameDays(a: readonly number[] | undefined, b: readonly number[] | undefined) {
  return JSON.stringify(a ?? []) === JSON.stringify(b ?? [])
}

/**
 * The earliest start a changed schedule may have: the next unhandled occurrence, or today
 * when that is later (tomorrow for an ended rule), so posted history never changes.
 */
export function earliestNewStart(rule: RecurringRule, now = new Date()): string {
  const today = ruleToday(rule, now)
  const next = ruleNextDate(rule)
  if (next === null) return addCalendarDays(today, 1)
  return next < today ? next : today
}

/**
 * Plans an edit that only affects occurrences not yet posted. Changing the repeat pattern or
 * the start restarts the schedule from the new start, which can't be earlier than the next
 * unhandled occurrence (or today, when that is later), so posted history never changes.
 */
export function planRuleUpdate(
  rule: RecurringRule,
  startDate: string,
  recurrence: RecurrenceValues,
  now = new Date(),
): { ok: true; update: RuleScheduleUpdate } | { ok: false; message: string } {
  const old = ruleSchedule(rule)
  const oldNext = ruleNextDate(rule)
  const today = ruleToday(rule, now)
  const scheduleChanged =
    startDate !== old.startDate ||
    recurrence.frequency !== old.frequency ||
    recurrence.interval !== old.interval ||
    !sameDays(recurrence.byWeekday, old.byWeekday) ||
    (recurrence.byMonthDay ?? null) !== (old.byMonthDay ?? null)

  const tomorrow = addCalendarDays(today, 1)
  const floor = earliestNewStart(rule, now)
  if (scheduleChanged && startDate < floor) {
    return {
      ok: false,
      message: `Posted occurrences stay as they are. Start the new schedule on or after ${formatCalendarDate(floor, undefined, { day: 'numeric', month: 'short', year: 'numeric' })}.`,
    }
  }
  const from = scheduleChanged ? startDate : (oldNext ?? tomorrow)
  const skippedKeys = rule.skippedKeys.filter((k) => k >= from)
  const next: RecurrenceRule = {
    frequency: recurrence.frequency,
    interval: recurrence.interval,
    ...(recurrence.byWeekday ? { byWeekday: recurrence.byWeekday } : {}),
    ...(recurrence.byMonthDay !== undefined ? { byMonthDay: recurrence.byMonthDay } : {}),
    startDate,
    ...(recurrence.endDate ? { endDate: recurrence.endDate } : {}),
    ...(recurrence.maxOccurrences ? { maxOccurrences: recurrence.maxOccurrences } : {}),
    skippedKeys,
  }
  return {
    ok: true,
    update: {
      frequency: recurrence.frequency,
      interval: recurrence.interval,
      byWeekday: recurrence.byWeekday ?? null,
      byMonthDay: recurrence.byMonthDay ?? null,
      startDate,
      endDate: recurrence.endDate ?? null,
      maxOccurrences: recurrence.maxOccurrences ?? null,
      skippedKeys,
      nextDate: nextOccurrence(next, from < startDate ? startDate : from)?.date ?? null,
    },
  }
}

/** Sort: active first by next date, then paused, then ended; ties by payee. */
export function compareRules(a: RecurringRule, b: RecurringRule): number {
  const rank = { active: 0, paused: 1, ended: 2 }
  return (
    rank[ruleStatus(a)] - rank[ruleStatus(b)] ||
    (a.nextRunAt ?? '').localeCompare(b.nextRunAt ?? '') ||
    a.template.payee.localeCompare(b.template.payee) ||
    a.id.localeCompare(b.id)
  )
}

/** "Today", "Tomorrow", "In 3 days", "2 days overdue". */
export function relativeDay(daysAway: number): string {
  if (daysAway === 0) return 'Today'
  if (daysAway === 1) return 'Tomorrow'
  if (daysAway > 1) return `In ${daysAway} days`
  return daysAway === -1 ? '1 day overdue' : `${-daysAway} days overdue`
}
