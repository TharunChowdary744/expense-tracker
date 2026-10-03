import { z } from 'zod'
import { calendarWeekday, isCalendarDate } from '@/utils/dates'
import {
  FREQUENCIES,
  INTERVAL_MAX,
  LAST_DAY,
  MAX_OCCURRENCES_LIMIT,
  type Frequency,
  type RecurrenceRule,
} from './engine'

export const RECURRING_MODES = ['auto', 'remind'] as const
export type RecurringMode = (typeof RECURRING_MODES)[number]

export const RECURRING_MODE_LABELS: Record<RecurringMode, string> = {
  auto: 'Post automatically',
  remind: 'Remind me to confirm',
}

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
}

export const FREQUENCY_UNITS: Record<Frequency, string> = {
  daily: 'day',
  weekly: 'week',
  monthly: 'month',
  yearly: 'year',
}

export const ENDS = ['never', 'on', 'after'] as const

/**
 * The repeat section of the transaction form. Values stay strings while editing; the start
 * date is the form's own date field. `monthDay` is "start" (the start date's day), "last" or
 * "1"…"31".
 */
export const recurrenceFormSchema = z.object({
  enabled: z.boolean(),
  frequency: z.enum(FREQUENCIES),
  interval: z.string().trim(),
  byWeekday: z.array(z.number().int().min(0).max(6)),
  monthDay: z.string(),
  ends: z.enum(ENDS),
  endDate: z.string(),
  count: z.string().trim(),
  mode: z.enum(RECURRING_MODES),
})

export type RecurrenceFormInput = z.input<typeof recurrenceFormSchema>

/** The schedule a valid repeat section describes (the start date comes from the form). */
export interface RecurrenceValues {
  frequency: Frequency
  interval: number
  byWeekday?: number[]
  byMonthDay?: number
  endDate?: string
  maxOccurrences?: number
  mode: RecurringMode
}

export const defaultRecurrenceInput = (enabled = false): RecurrenceFormInput => ({
  enabled,
  frequency: 'monthly',
  interval: '1',
  byWeekday: [],
  monthDay: 'start',
  ends: 'never',
  endDate: '',
  count: '12',
  mode: 'auto',
})

/** Form input for an existing rule's schedule. */
export function recurrenceInputFrom(
  rule: RecurrenceRule,
  mode: RecurringMode,
): RecurrenceFormInput {
  return {
    enabled: true,
    frequency: rule.frequency,
    interval: String(rule.interval),
    byWeekday: rule.byWeekday ? [...rule.byWeekday] : [],
    monthDay:
      rule.byMonthDay === undefined
        ? 'start'
        : rule.byMonthDay === LAST_DAY
          ? 'last'
          : String(rule.byMonthDay),
    ends: rule.endDate ? 'on' : rule.maxOccurrences ? 'after' : 'never',
    endDate: rule.endDate ?? '',
    count: String(rule.maxOccurrences ?? 12),
    mode,
  }
}

export type RecurrenceResult =
  { ok: true; value: RecurrenceValues } | { ok: false; path: string; message: string }

const INT = /^\d{1,6}$/

/**
 * Checks the repeat section against the start date and resolves defaults: a weekly rule
 * with no weekdays repeats on the start's weekday, and a monthly rule on "the start's day"
 * stores that day so the schedule never drifts after a short month.
 */
export function parseRecurrence(input: RecurrenceFormInput, startDate: string): RecurrenceResult {
  const fail = (path: string, message: string): RecurrenceResult => ({
    ok: false,
    path: `recurrence.${path}`,
    message,
  })
  if (!INT.test(input.interval) || Number(input.interval) < 1) {
    return fail('interval', 'Enter a whole number, 1 or more')
  }
  const interval = Number(input.interval)
  if (interval > INTERVAL_MAX) return fail('interval', `Use at most ${INTERVAL_MAX}`)

  const value: RecurrenceValues = { frequency: input.frequency, interval, mode: input.mode }

  if (input.frequency === 'weekly') {
    const days = input.byWeekday.length > 0 ? input.byWeekday : [calendarWeekday(startDate)]
    value.byWeekday = [...new Set(days)].sort((a, b) => a - b)
  }
  if (input.frequency === 'monthly') {
    if (input.monthDay === 'last') value.byMonthDay = LAST_DAY
    else if (input.monthDay === 'start') value.byMonthDay = Number(startDate.slice(8, 10))
    else if (
      INT.test(input.monthDay) &&
      Number(input.monthDay) >= 1 &&
      Number(input.monthDay) <= 31
    )
      value.byMonthDay = Number(input.monthDay)
    else return fail('monthDay', 'Choose a day of the month')
  }

  if (input.ends === 'on') {
    if (!isCalendarDate(input.endDate)) return fail('endDate', 'Choose an end date')
    if (input.endDate < startDate) return fail('endDate', 'The end date is before the start')
    value.endDate = input.endDate
  } else if (input.ends === 'after') {
    if (!INT.test(input.count) || Number(input.count) < 1) {
      return fail('count', 'Enter a whole number, 1 or more')
    }
    const count = Number(input.count)
    if (count > MAX_OCCURRENCES_LIMIT) return fail('count', `Use at most ${MAX_OCCURRENCES_LIMIT}`)
    value.maxOccurrences = count
  }
  return { ok: true, value }
}
