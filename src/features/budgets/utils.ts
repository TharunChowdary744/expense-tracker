import type { Category } from '@/features/categories/types'
import { calendarDate, calendarDaysBetween } from '@/utils/dates'
import {
  inPeriod,
  periodContaining,
  periodDays,
  periodLength,
  shiftPeriod,
  type Period,
  type WeekStart,
} from './period'
import type { BudgetDoc } from './schemas'

/** Below this share of the limit a budget is green; from it up to 100% amber; above, red. */
export const WARNING_PERCENT = 80

export type BudgetTone = 'ok' | 'warning' | 'over'
export type PeriodTiming = 'past' | 'current' | 'future'

export type StatusBudget = Pick<
  BudgetDoc,
  'amount' | 'categoryIds' | 'rollover' | 'alertThresholds' | 'startDate'
>

/** The transaction fields budget maths needs. */
export interface StatusTransaction {
  type: 'expense' | 'income' | 'transfer'
  baseAmount: number
  categoryId?: string
  /** ISO instant. */
  date: string
}

export interface StatusOptions {
  /** Today as yyyy-MM-dd in the user's timezone. */
  today: string
  /** IANA timezone used to place each transaction on a calendar day (default: the device's). */
  timeZone?: string
  /**
   * The category ids that count, with subcategories already included (see
   * `expandCategoryIds`). Defaults to `budget.categoryIds`. Ignored for overall budgets.
   */
  categoryIds?: ReadonlySet<string>
}

export interface DaySpend {
  date: string
  amount: number
}

export interface BudgetStatus<T extends StatusTransaction> {
  period: Period
  timing: PeriodTiming
  /** The budget amount before any rollover. */
  baseLimit: number
  /** Last period's leftover (negative when it was overspent); 0 without rollover. */
  carryOver: number
  /** What can be spent this period: baseLimit + carryOver. */
  limit: number
  spent: number
  /** limit − spent; negative when over. */
  remaining: number
  /** spent as a percentage of limit; Infinity when spending against a limit of zero or less. */
  percent: number
  tone: BudgetTone
  /** Alert thresholds reached this period, ascending. */
  crossed: number[]
  totalDays: number
  /** Days left including today (current period), all days (future), 0 (past). */
  daysLeft: number
  /** What can be spent per remaining day; null for past periods. */
  dailyAllowance: number | null
  /** Spend at the current daily pace by period end; the actual spend for past periods. */
  projected: number | null
  /** Transactions that counted, newest first. */
  transactions: T[]
  /** Spend on every day of the period, in order. */
  byDay: DaySpend[]
}

/** A budget's categories plus the subcategories of any selected parent. */
export function expandCategoryIds(
  categoryIds: readonly string[],
  categories: readonly Pick<Category, 'id' | 'parentId'>[],
): Set<string> {
  const ids = new Set(categoryIds)
  for (const c of categories) if (c.parentId && ids.has(c.parentId)) ids.add(c.id)
  return ids
}

function counts(
  tx: StatusTransaction,
  budget: StatusBudget,
  categoryIds: ReadonlySet<string>,
): boolean {
  if (tx.type !== 'expense') return false
  if (budget.categoryIds.length === 0) return true
  return tx.categoryId !== undefined && categoryIds.has(tx.categoryId)
}

/** spent / limit as a percentage, with limits of zero or less handled. */
export function percentOf(spent: number, limit: number): number {
  if (limit > 0) return (spent * 100) / limit
  return spent > 0 ? Number.POSITIVE_INFINITY : 0
}

export function toneOf(spent: number, limit: number): BudgetTone {
  if (spent > limit) return 'over'
  return percentOf(spent, limit) >= WARNING_PERCENT ? 'warning' : 'ok'
}

/**
 * Where a budget stands in one period.
 *
 * `transactions` may hold anything (other types, other periods); only expenses in the budget's
 * categories whose date falls in the period count. With rollover, pass the previous period's
 * transactions too: its leftover (budget amount − spend, negative when overspent) is added to
 * this period's limit. Rollover carries one period only, and never from a period that ended
 * before the budget's `startDate`. Amounts are base-currency minor units.
 */
export function computeBudgetStatus<T extends StatusTransaction>(
  budget: StatusBudget,
  transactions: readonly T[],
  period: Period,
  options: StatusOptions,
): BudgetStatus<T> {
  const { today, timeZone } = options
  const categoryIds = options.categoryIds ?? new Set(budget.categoryIds)
  const before = shiftPeriod(period, -1)
  const previous =
    budget.rollover && before.end > calendarDate(budget.startDate, timeZone) ? before : null

  const counted: { tx: T; day: string }[] = []
  let previousSpent = 0
  for (const tx of transactions) {
    if (!counts(tx, budget, categoryIds)) continue
    const day = calendarDate(tx.date, timeZone)
    if (inPeriod(day, period)) counted.push({ tx, day })
    else if (previous && inPeriod(day, previous)) previousSpent += tx.baseAmount
  }
  counted.sort((a, b) => (a.tx.date < b.tx.date ? 1 : a.tx.date > b.tx.date ? -1 : 0))

  const spent = counted.reduce((sum, c) => sum + c.tx.baseAmount, 0)
  const carryOver = previous ? budget.amount - previousSpent : 0
  const limit = budget.amount + carryOver
  const remaining = limit - spent
  const percent = percentOf(spent, limit)

  const totalDays = periodLength(period)
  const timing: PeriodTiming =
    today < period.start ? 'future' : today >= period.end ? 'past' : 'current'
  let daysLeft = 0
  let dailyAllowance: number | null = null
  let projected: number | null = null
  if (timing === 'current') {
    daysLeft = calendarDaysBetween(today, period.end)
    dailyAllowance = remaining > 0 ? Math.floor(remaining / daysLeft) : 0
    const elapsed = totalDays - daysLeft + 1
    projected = Math.round((spent * totalDays) / elapsed)
  } else if (timing === 'future') {
    daysLeft = totalDays
    dailyAllowance = remaining > 0 ? Math.floor(remaining / totalDays) : 0
  } else {
    projected = spent
  }

  const perDay = new Map<string, number>()
  for (const { tx, day } of counted) perDay.set(day, (perDay.get(day) ?? 0) + tx.baseAmount)

  return {
    period,
    timing,
    baseLimit: budget.amount,
    carryOver,
    limit,
    spent,
    remaining,
    percent,
    tone: toneOf(spent, limit),
    crossed: budget.alertThresholds.filter((t) => percent >= t).sort((a, b) => a - b),
    totalDays,
    daysLeft,
    dailyAllowance,
    projected,
    transactions: counted.map((c) => c.tx),
    byDay: periodDays(period).map((date) => ({ date, amount: perDay.get(date) ?? 0 })),
  }
}

/** The calendar range to load so every period in `periods` (and, with rollover, the one
 * before) can be computed: from the earliest start to the latest end. */
export function loadRange(
  periods: readonly Period[],
  withPrevious: boolean,
): { start: string; end: string } | null {
  if (periods.length === 0) return null
  let start = periods[0]?.start ?? ''
  let end = periods[0]?.end ?? ''
  for (const p of periods) {
    const first = withPrevious ? shiftPeriod(p, -1).start : p.start
    if (first < start) start = first
    if (p.end > end) end = p.end
  }
  return { start, end }
}

/**
 * The `startDate` stored for a new budget (or one whose period kind changes): the start of the
 * period before the current one, so with rollover last period's leftover applies at once,
 * while older periods never carry anything in.
 */
export function initialStartDate(
  kind: Period['kind'],
  today: string,
  weekStartsOn: WeekStart,
): string {
  return shiftPeriod(periodContaining(today, kind, weekStartsOn), -1).start
}

/** Dedupe key (and notification doc id) for one budget, period and threshold. */
export function alertKey(budgetId: string, period: Period, threshold: number): string {
  return `budget_${budgetId}_${period.key}_${threshold}`
}

/** "All expenses", or the category names (unknown ones skipped), e.g. "Food, Transport". */
export function budgetScopeLabel(
  categoryIds: readonly string[],
  categories: readonly Pick<Category, 'id' | 'name'>[],
): string {
  if (categoryIds.length === 0) return 'All expenses'
  const names = new Map(categories.map((c) => [c.id, c.name]))
  const known = categoryIds.map((id) => names.get(id)).filter((n): n is string => Boolean(n))
  if (known.length === 0) return 'No categories'
  return known.length <= 3
    ? known.join(', ')
    : `${known.slice(0, 3).join(', ')} +${known.length - 3}`
}
