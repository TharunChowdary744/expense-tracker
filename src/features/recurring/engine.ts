/**
 * The recurrence engine: pure functions over calendar dates (`yyyy-MM-dd`, see
 * `@/utils/dates`). A rule's dates never carry a time or timezone, so daylight-saving changes
 * can't move an occurrence to another day. Instants enter and leave only at the edges: "today"
 * is `calendarDate(now, rule.timeZone)`, and an occurrence becomes due at its local midnight in
 * the rule's timezone (`zonedTime`).
 */
import {
  addCalendarDays,
  calendarDaysBetween,
  calendarWeekday,
  formatCalendarDate,
} from '@/utils/dates'

export const FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'] as const
export type Frequency = (typeof FREQUENCIES)[number]

/** `byMonthDay` value for "the last day of the month". */
export const LAST_DAY = -1
export const INTERVAL_MAX = 365
export const MAX_OCCURRENCES_LIMIT = 1000

export interface RecurrenceRule {
  frequency: Frequency
  /** Every `interval` days, weeks, months or years (1 or more). */
  interval: number
  /** Weekly only: weekdays, 0 = Sunday … 6 = Saturday. Empty or missing: the start's weekday. */
  byWeekday?: readonly number[]
  /**
   * Monthly and yearly: the day of the month, 1–31 or LAST_DAY. Missing: the start date's
   * day. Days past the end of a short month fall on its last day (31 → 30 Apr, 28/29 Feb).
   */
  byMonthDay?: number
  /** First possible occurrence, inclusive. */
  startDate: string
  /** Last possible occurrence, inclusive. */
  endDate?: string
  /** The schedule ends after this many occurrences (skipped ones count). */
  maxOccurrences?: number
  /** Occurrence keys the user skipped. */
  skippedKeys?: readonly string[]
}

export interface Occurrence {
  /** yyyy-MM-dd. */
  date: string
  /** Stable id of the occurrence within its rule (the date). */
  key: string
  /** 0 for the first occurrence of the schedule. */
  index: number
  skipped: boolean
}

/** An occurrence's key. One rule has at most one occurrence per day, so the date is enough. */
export function occurrenceKey(date: string): string {
  return date
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function ymd(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${pad(month + 1)}-${pad(day)}`
}

function parts(date: string): { year: number; month: number; day: number } {
  return {
    year: Number(date.slice(0, 4)),
    month: Number(date.slice(5, 7)) - 1,
    day: Number(date.slice(8, 10)),
  }
}

/** The day `byMonthDay` lands on in a month, clamped to that month's length. */
export function resolveMonthDay(year: number, month: number, byMonthDay: number): number {
  const last = daysInMonth(year, month)
  return byMonthDay === LAST_DAY ? last : Math.min(byMonthDay, last)
}

/** Weekdays a weekly rule uses, sorted Monday first. */
export function ruleWeekdays(rule: Pick<RecurrenceRule, 'byWeekday' | 'startDate'>): number[] {
  const days = rule.byWeekday?.length ? rule.byWeekday : [calendarWeekday(rule.startDate)]
  return [...new Set(days)].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
}

/** The month day a monthly or yearly rule uses. */
export function ruleMonthDay(rule: Pick<RecurrenceRule, 'byMonthDay' | 'startDate'>): number {
  return rule.byMonthDay ?? parts(rule.startDate).day
}

export function validateRule(rule: RecurrenceRule): string | null {
  if (!Number.isInteger(rule.interval) || rule.interval < 1 || rule.interval > INTERVAL_MAX) {
    return `Repeat every 1 to ${INTERVAL_MAX}`
  }
  if (rule.byWeekday?.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    return 'Weekdays must be 0 (Sunday) to 6 (Saturday)'
  }
  const md = rule.byMonthDay
  if (md !== undefined && md !== LAST_DAY && (!Number.isInteger(md) || md < 1 || md > 31)) {
    return 'Day of month must be 1 to 31 or the last day'
  }
  if (rule.endDate !== undefined && rule.endDate < rule.startDate) {
    return 'The end date is before the start date'
  }
  const max = rule.maxOccurrences
  if (max !== undefined && (!Number.isInteger(max) || max < 1 || max > MAX_OCCURRENCES_LIMIT)) {
    return `Number of times must be 1 to ${MAX_OCCURRENCES_LIMIT}`
  }
  return null
}

/** Safety net: no schedule is walked further than this many candidate dates. */
const MAX_STEPS = 200_000

/**
 * Every date of the schedule in order, from the start, until `endDate`, `maxOccurrences` or
 * `until` (inclusive) is reached. Skipped dates are included (they still count).
 */
export function* scheduleDates(rule: RecurrenceRule, until: string): Generator<string> {
  const problem = validateRule(rule)
  if (problem) throw new RangeError(problem)
  const last = rule.endDate !== undefined && rule.endDate < until ? rule.endDate : until
  const max = rule.maxOccurrences ?? Infinity
  let count = 0
  let steps = 0

  const emit = function* (date: string): Generator<string, boolean> {
    if (date < rule.startDate) return true
    if (date > last || count >= max) return false
    count += 1
    yield date
    return count < max
  }

  const start = parts(rule.startDate)
  switch (rule.frequency) {
    case 'daily': {
      for (let date = rule.startDate; steps < MAX_STEPS; steps++) {
        if (!(yield* emit(date))) return
        date = addCalendarDays(date, rule.interval)
      }
      return
    }
    case 'weekly': {
      const days = ruleWeekdays(rule)
      // Weeks run Monday to Sunday; the start's week is week 0.
      const monday = addCalendarDays(rule.startDate, -((calendarWeekday(rule.startDate) + 6) % 7))
      for (let week = 0; steps < MAX_STEPS; week += rule.interval, steps++) {
        const weekStart = addCalendarDays(monday, week * 7)
        if (weekStart > last) return
        for (const day of days) {
          if (!(yield* emit(addCalendarDays(weekStart, (day + 6) % 7)))) return
        }
      }
      return
    }
    case 'monthly':
    case 'yearly': {
      const monthDay = ruleMonthDay(rule)
      const step = rule.frequency === 'monthly' ? rule.interval : rule.interval * 12
      for (let offset = 0; steps < MAX_STEPS; offset += step, steps++) {
        const total = start.year * 12 + start.month + offset
        const year = Math.floor(total / 12)
        const month = total % 12
        if (ymd(year, month, 1) > last) return
        if (!(yield* emit(ymd(year, month, resolveMonthDay(year, month, monthDay))))) return
      }
      return
    }
  }
}

export interface OccurrenceOptions {
  /** Return at most this many. */
  limit?: number
  /** Include skipped occurrences (marked `skipped: true`). */
  includeSkipped?: boolean
}

/** Occurrences dated from `from` to `to`, both inclusive. */
export function occurrencesBetween(
  rule: RecurrenceRule,
  from: string,
  to: string,
  options: OccurrenceOptions = {},
): Occurrence[] {
  const { limit = Infinity, includeSkipped = false } = options
  const skipped = new Set(rule.skippedKeys ?? [])
  const out: Occurrence[] = []
  if (limit <= 0 || to < from) return out
  let index = 0
  for (const date of scheduleDates(rule, to)) {
    const key = occurrenceKey(date)
    const isSkipped = skipped.has(key)
    if (date >= from && (includeSkipped || !isSkipped)) {
      out.push({ date, key, index, skipped: isSkipped })
      if (out.length >= limit) break
    }
    index += 1
  }
  return out
}

/** How far ahead `nextOccurrence` looks before deciding a schedule has ended. */
const LOOKAHEAD_YEARS = 120

/** The first occurrence on or after `onOrAfter` (not skipped unless asked), or null. */
export function nextOccurrence(
  rule: RecurrenceRule,
  onOrAfter: string,
  options: { includeSkipped?: boolean } = {},
): Occurrence | null {
  const until = `${String(Number(onOrAfter.slice(0, 4)) + LOOKAHEAD_YEARS).padStart(4, '0')}-12-31`
  return occurrencesBetween(rule, onOrAfter, until, { ...options, limit: 1 })[0] ?? null
}

/** The occurrence after `date` (exclusive). */
export function occurrenceAfter(rule: RecurrenceRule, date: string): Occurrence | null {
  return nextOccurrence(rule, addCalendarDays(date, 1))
}

/** Number of schedule dates (skipped included) before `date`. */
export function countBefore(rule: RecurrenceRule, date: string): number {
  let count = 0
  for (const d of scheduleDates(rule, addCalendarDays(date, -1))) {
    if (d < date) count += 1
  }
  return count
}

// ---------------------------------------------------------------------------------------------
// Cost

/**
 * Occurrences per year as an exact fraction. Days and weeks use the average year (365.25
 * days), so a daily ₹100 is ₹36,525 a year and ₹3,043.75 a month.
 */
export function occurrencesPerYear(
  rule: Pick<RecurrenceRule, 'frequency' | 'interval' | 'byWeekday' | 'startDate'>,
): { num: number; den: number } {
  switch (rule.frequency) {
    case 'daily':
      return { num: 1461, den: 4 * rule.interval }
    case 'weekly':
      return { num: 1461 * ruleWeekdays(rule).length, den: 28 * rule.interval }
    case 'monthly':
      return { num: 12, den: rule.interval }
    case 'yearly':
      return { num: 1, den: rule.interval }
  }
}

// ---------------------------------------------------------------------------------------------
// Describing a rule

const ORDINAL_SUFFIX: Record<string, string> = { one: 'st', two: 'nd', few: 'rd', other: 'th' }

function ordinal(n: number): string {
  const rule = new Intl.PluralRules('en', { type: 'ordinal' }).select(n)
  return `${n}${ORDINAL_SUFFIX[rule] ?? 'th'}`
}

function weekdayName(day: number, locale: string | undefined, width: 'short' | 'long'): string {
  // 2023-01-01 was a Sunday.
  return formatCalendarDate(addCalendarDays('2023-01-01', day), locale, { weekday: width })
}

/** "Every month on the 31st", "Every 2 weeks on Mon, Thu", "Every day". */
export function describeRule(rule: RecurrenceRule, locale?: string): string {
  const n = rule.interval
  const every = (unit: string) => (n === 1 ? `Every ${unit}` : `Every ${n} ${unit}s`)
  switch (rule.frequency) {
    case 'daily':
      return every('day')
    case 'weekly': {
      const days = ruleWeekdays(rule)
      const names =
        days.length === 1
          ? weekdayName(days[0] as number, locale, 'long')
          : days.map((d) => weekdayName(d, locale, 'short')).join(', ')
      return `${every('week')} on ${names}`
    }
    case 'monthly': {
      const day = ruleMonthDay(rule)
      return `${every('month')} on the ${day === LAST_DAY ? 'last day' : ordinal(day)}`
    }
    case 'yearly': {
      const { month } = parts(rule.startDate)
      const day = ruleMonthDay(rule)
      // A leap year, so 29 Feb can be shown.
      const shown = ymd(2024, month, resolveMonthDay(2024, month, day))
      return `${every('year')} on ${formatCalendarDate(shown, locale, { day: 'numeric', month: 'long' })}`
    }
  }
}

/** Days from `today` to `date` ("today" = 0). */
export function daysUntil(today: string, date: string): number {
  return calendarDaysBetween(today, date)
}
