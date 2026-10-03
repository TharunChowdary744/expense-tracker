import {
  addCalendarDays,
  addCalendarMonths,
  calendarDaysBetween,
  calendarWeekday,
  formatCalendarDate,
  startOfCalendarMonth,
} from '@/utils/dates'
import type { BudgetPeriodKind } from './schemas'

export type WeekStart = 0 | 1

/** One budget period as calendar dates in the user's timezone. `end` is exclusive. */
export interface Period {
  kind: BudgetPeriodKind
  start: string
  end: string
  /** Stable id used in notification dedupe keys and URLs, e.g. "M2026-10-01". */
  key: string
}

function make(kind: BudgetPeriodKind, start: string): Period {
  const end = kind === 'monthly' ? addCalendarMonths(start, 1) : addCalendarDays(start, 7)
  return { kind, start, end, key: `${kind === 'monthly' ? 'M' : 'W'}${start}` }
}

/** The period of `kind` that contains the calendar date `date`. */
export function periodContaining(
  date: string,
  kind: BudgetPeriodKind,
  weekStartsOn: WeekStart,
): Period {
  if (kind === 'monthly') return make(kind, startOfCalendarMonth(date))
  const back = (calendarWeekday(date) - weekStartsOn + 7) % 7
  return make(kind, addCalendarDays(date, -back))
}

/** The period `n` steps after `period` (before it when `n` is negative). */
export function shiftPeriod(period: Period, n: number): Period {
  return period.kind === 'monthly'
    ? make('monthly', addCalendarMonths(period.start, n))
    : make('weekly', addCalendarDays(period.start, 7 * n))
}

export function periodLength(period: Period): number {
  return calendarDaysBetween(period.start, period.end)
}

/** Every calendar date in the period, in order. */
export function periodDays(period: Period): string[] {
  return Array.from({ length: periodLength(period) }, (_, i) => addCalendarDays(period.start, i))
}

export function inPeriod(date: string, period: Period): boolean {
  return date >= period.start && date < period.end
}

/** "October 2026" or "28 Sep – 4 Oct 2026". */
export function periodLabel(period: Period, locale?: string): string {
  if (period.kind === 'monthly') {
    return formatCalendarDate(period.start, locale, { month: 'long', year: 'numeric' })
  }
  const last = addCalendarDays(period.end, -1)
  const sameYear = period.start.slice(0, 4) === last.slice(0, 4)
  const first = formatCalendarDate(period.start, locale, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
  const second = formatCalendarDate(last, locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  return `${first} – ${second}`
}
