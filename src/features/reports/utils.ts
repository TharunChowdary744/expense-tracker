import {
  addCalendarDays,
  addCalendarMonths,
  calendarDate,
  calendarDaysBetween,
  calendarWeekday,
  formatCalendarDate,
  isCalendarDate,
  startOfCalendarMonth,
} from '@/utils/dates'
import {
  UNCATEGORISED,
  type CategorySlice,
  type Comparison,
  type ComparisonRow,
  type DateRange,
  type DayFlow,
  type MonthTotals,
  type PayeeTotal,
  type ReportCategory,
  type ReportTx,
  type TagTotal,
  type Totals,
} from './types'

/**
 * Report and dashboard aggregations. Everything here is pure: amounts are base-currency minor
 * units (`baseAmount`), dates are calendar dates in an explicit timezone (the device's when
 * omitted), and transfers never count as income or spending.
 */

// ---------------------------------------------------------------------------------------------
// Ranges

export const RANGE_PRESETS = [
  'this-month',
  'last-month',
  'last-3-months',
  'last-12-months',
  'this-year',
  'custom',
] as const
export type RangePreset = (typeof RANGE_PRESETS)[number]

export const RANGE_PRESET_LABELS: Record<RangePreset, string> = {
  'this-month': 'This month',
  'last-month': 'Last month',
  'last-3-months': 'Last 3 months',
  'last-12-months': 'Last 12 months',
  'this-year': 'This year',
  custom: 'Custom range',
}

/** Presets offered on the dashboard. */
export const DASHBOARD_PRESETS = ['this-month', 'last-month', 'custom'] as const

/**
 * The calendar dates a preset covers. Ranges that include today end today (like the
 * Transactions page filters), so future-dated entries are not counted yet. `from` / `to` are
 * the custom range's inclusive yyyy-MM-dd bounds; an invalid custom range falls back to
 * this month.
 */
export function resolvePreset(
  preset: RangePreset,
  today: string,
  custom: { from: string; to: string } = { from: '', to: '' },
): DateRange {
  const tomorrow = addCalendarDays(today, 1)
  const month = startOfCalendarMonth(today)
  switch (preset) {
    case 'last-month':
      return { start: addCalendarMonths(month, -1), end: month }
    case 'last-3-months':
      return { start: addCalendarMonths(month, -2), end: tomorrow }
    case 'last-12-months':
      return { start: addCalendarMonths(month, -11), end: tomorrow }
    case 'this-year':
      return { start: `${today.slice(0, 4)}-01-01`, end: tomorrow }
    case 'custom':
      if (isCalendarDate(custom.from) && isCalendarDate(custom.to) && custom.from <= custom.to) {
        return { start: custom.from, end: addCalendarDays(custom.to, 1) }
      }
      return { start: month, end: tomorrow }
    default:
      return { start: month, end: tomorrow }
  }
}

/**
 * The period a range is compared with. A range starting on the 1st of a month is compared with
 * the same number of whole calendar months before it (this month so far → all of last month;
 * this year so far → all of last year). Any other range is compared with the same number of
 * days immediately before it.
 */
export function previousRange(range: DateRange): DateRange {
  if (range.start.endsWith('-01-01') && monthsSpanned(range) > 1) {
    const year = Number(range.start.slice(0, 4)) - 1
    return { start: `${year}-01-01`, end: range.start }
  }
  if (range.start.endsWith('-01')) {
    return { start: addCalendarMonths(range.start, -monthsSpanned(range)), end: range.start }
  }
  const days = calendarDaysBetween(range.start, range.end)
  return { start: addCalendarDays(range.start, -days), end: range.start }
}

/** Calendar months a range touches (a partial last month counts). */
function monthsSpanned(range: DateRange): number {
  return monthKeys(range).length
}

/** Every yyyy-MM a range touches, in order. */
export function monthKeys(range: DateRange): string[] {
  const keys: string[] = []
  const last = addCalendarDays(range.end, -1)
  for (let m = startOfCalendarMonth(range.start); m <= last; m = addCalendarMonths(m, 1)) {
    keys.push(m.slice(0, 7))
  }
  return keys
}

/** The `count` months ending with the month that contains the range's last day. */
export function trailingMonths(range: DateRange, count = 12): DateRange {
  const lastMonth = startOfCalendarMonth(addCalendarDays(range.end, -1))
  return { start: addCalendarMonths(lastMonth, -(count - 1)), end: addCalendarMonths(lastMonth, 1) }
}

/** The smallest range covering all of `ranges`. */
export function spanOf(ranges: readonly DateRange[]): DateRange {
  const first = ranges[0]
  if (!first) throw new RangeError('spanOf needs at least one range')
  return ranges.reduce(
    (acc, r) => ({
      start: r.start < acc.start ? r.start : acc.start,
      end: r.end > acc.end ? r.end : acc.end,
    }),
    first,
  )
}

/** Every calendar date in a range. */
export function rangeDays(range: DateRange): string[] {
  const n = Math.max(0, calendarDaysBetween(range.start, range.end))
  return Array.from({ length: n }, (_, i) => addCalendarDays(range.start, i))
}

/** "1 Oct – 3 Oct 2026", "October 2026" for one whole month. */
export function rangeLabel(range: DateRange, locale?: string): string {
  const last = addCalendarDays(range.end, -1)
  if (range.start.endsWith('-01') && range.end === addCalendarMonths(range.start, 1)) {
    return formatCalendarDate(range.start, locale, { month: 'long', year: 'numeric' })
  }
  const sameYear = range.start.slice(0, 4) === last.slice(0, 4)
  const from = formatCalendarDate(range.start, locale, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
  const to = formatCalendarDate(last, locale, { day: 'numeric', month: 'short', year: 'numeric' })
  return range.start === last ? to : `${from} – ${to}`
}

/** "Oct 2026" for a yyyy-MM key. */
export function monthLabel(month: string, locale?: string, long = false): string {
  return formatCalendarDate(`${month}-01`, locale, {
    month: long ? 'long' : 'short',
    year: 'numeric',
  })
}

// ---------------------------------------------------------------------------------------------
// Filtering

export interface ReportFilter {
  range: DateRange
  /** Empty means every account. A transaction matches when either side is a chosen account. */
  accountIds: readonly string[]
}

export function inRange(tx: Pick<ReportTx, 'date'>, range: DateRange, timeZone?: string): boolean {
  const day = calendarDate(tx.date, timeZone)
  return day >= range.start && day < range.end
}

export function matchesAccounts(
  tx: Pick<ReportTx, 'accountId' | 'toAccountId'>,
  accountIds: readonly string[],
): boolean {
  return (
    accountIds.length === 0 ||
    accountIds.includes(tx.accountId) ||
    (tx.toAccountId !== undefined && accountIds.includes(tx.toAccountId))
  )
}

export function filterTransactions<T extends ReportTx>(
  txs: readonly T[],
  filter: ReportFilter,
  timeZone?: string,
): T[] {
  return txs.filter(
    (tx) => matchesAccounts(tx, filter.accountIds) && inRange(tx, filter.range, timeZone),
  )
}

// ---------------------------------------------------------------------------------------------
// Totals

export function totals(txs: readonly Pick<ReportTx, 'type' | 'baseAmount'>[]): Totals {
  let income = 0
  let expense = 0
  let count = 0
  for (const tx of txs) {
    if (tx.type === 'income') income += tx.baseAmount
    else if (tx.type === 'expense') expense += tx.baseAmount
    else continue
    count += 1
  }
  return { income, expense, net: income - expense, count }
}

/** Percentage change from `previous` to `current` (display only), or null when previous is 0. */
export function deltaPercent(current: number, previous: number): number | null {
  if (previous === 0) return null
  return ((current - previous) / Math.abs(previous)) * 100
}

// ---------------------------------------------------------------------------------------------
// Categories

const NEUTRAL = '#64748b'

/** The top-level category a category rolls up to (itself when top-level or orphaned). */
export function topLevelId(
  categoryId: string | undefined,
  byId: ReadonlyMap<string, ReportCategory>,
): string {
  if (!categoryId) return UNCATEGORISED
  const category = byId.get(categoryId)
  if (!category) return UNCATEGORISED
  return category.parentId && byId.has(category.parentId) ? category.parentId : category.id
}

/**
 * Spending by category. With `parentId` null it rolls subcategories into their top-level
 * category; with a parent id it splits that category into its subcategories, plus a slice
 * for spending recorded on the parent itself. Largest first.
 */
export function categorySpend(
  txs: readonly ReportTx[],
  categories: readonly ReportCategory[],
  parentId: string | null = null,
): CategorySlice[] {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const hasChildren = new Set(categories.filter((c) => c.parentId).map((c) => c.parentId))
  const buckets = new Map<string, { amount: number; count: number }>()
  let total = 0
  for (const tx of txs) {
    if (tx.type !== 'expense') continue
    const top = topLevelId(tx.categoryId, byId)
    let key: string
    if (parentId === null) key = top
    else if (top !== parentId) continue
    else key = tx.categoryId && byId.has(tx.categoryId) ? tx.categoryId : parentId
    const bucket = buckets.get(key) ?? { amount: 0, count: 0 }
    bucket.amount += tx.baseAmount
    bucket.count += 1
    buckets.set(key, bucket)
    total += tx.baseAmount
  }
  return [...buckets]
    .map(([id, { amount, count }]): CategorySlice => {
      const category = byId.get(id)
      const isParentSelf = parentId !== null && id === parentId
      return {
        id,
        name:
          id === UNCATEGORISED
            ? 'Uncategorised'
            : isParentSelf
              ? `${category?.name ?? 'Unknown'} (no subcategory)`
              : (category?.name ?? 'Unknown'),
        color: category?.color ?? NEUTRAL,
        amount,
        share: total > 0 ? amount / total : 0,
        count,
        hasChildren: parentId === null && hasChildren.has(id),
        isParentSelf,
      }
    })
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name))
}

/**
 * The expenses behind one slice: a top-level slice includes its subcategories, a
 * subcategory slice only itself, and the "no subcategory" slice only the parent's own.
 * Newest first.
 */
export function sliceTransactions<T extends ReportTx>(
  txs: readonly T[],
  categories: readonly ReportCategory[],
  slice: Pick<CategorySlice, 'id' | 'isParentSelf'>,
  level: string | null,
): T[] {
  const byId = new Map(categories.map((c) => [c.id, c]))
  return txs
    .filter((tx) => {
      if (tx.type !== 'expense') return false
      if (level === null) return topLevelId(tx.categoryId, byId) === slice.id
      if (topLevelId(tx.categoryId, byId) !== level) return false
      const own = tx.categoryId && byId.has(tx.categoryId) ? tx.categoryId : level
      return own === slice.id
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

// ---------------------------------------------------------------------------------------------
// Over time

/** Income, expense and net for each month key (yyyy-MM), zero-filled. */
export function monthlyTotals(
  txs: readonly ReportTx[],
  months: readonly string[],
  timeZone?: string,
): MonthTotals[] {
  const buckets = new Map(months.map((m) => [m, [] as ReportTx[]]))
  for (const tx of txs) buckets.get(calendarDate(tx.date, timeZone).slice(0, 7))?.push(tx)
  return months.map((month) => ({ month, ...totals(buckets.get(month) ?? []) }))
}

/** Daily income, expense and net with a running net, for every day in the range. */
export function dailyFlow(
  txs: readonly ReportTx[],
  range: DateRange,
  timeZone?: string,
): DayFlow[] {
  const byDay = new Map<string, { income: number; expense: number }>()
  for (const tx of txs) {
    if (tx.type === 'transfer') continue
    const day = calendarDate(tx.date, timeZone)
    const entry = byDay.get(day) ?? { income: 0, expense: 0 }
    if (tx.type === 'income') entry.income += tx.baseAmount
    else entry.expense += tx.baseAmount
    byDay.set(day, entry)
  }
  let cumulative = 0
  return rangeDays(range).map((date) => {
    const { income, expense } = byDay.get(date) ?? { income: 0, expense: 0 }
    cumulative += income - expense
    return { date, income, expense, net: income - expense, cumulative }
  })
}

/**
 * Lays out a range as calendar weeks (rows of 7, starting on `weekStartsOn`) for the heatmap.
 * Cells outside the range are null.
 */
export function calendarWeeks(range: DateRange, weekStartsOn: 0 | 1): (string | null)[][] {
  const days = rangeDays(range)
  const first = days[0]
  if (!first) return []
  const lead = (calendarWeekday(first) - weekStartsOn + 7) % 7
  const cells: (string | null)[] = [...Array<null>(lead).fill(null), ...days]
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: (string | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

/** Heat level 0–4 for an amount relative to the busiest day (0 only for no spending). */
export function heatLevel(amount: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (amount <= 0 || max <= 0) return 0
  return Math.min(4, Math.max(1, Math.ceil((amount / max) * 4))) as 1 | 2 | 3 | 4
}

// ---------------------------------------------------------------------------------------------
// Payees and tags

/** Expense totals by payee (case-insensitive), largest first. Blank payees are left out. */
export function topPayees(txs: readonly ReportTx[], limit = 10): PayeeTotal[] {
  const byKey = new Map<string, PayeeTotal>()
  for (const tx of txs) {
    if (tx.type !== 'expense') continue
    const payee = tx.payee.trim()
    if (!payee) continue
    const key = payee.toLowerCase()
    const entry = byKey.get(key) ?? { payee, amount: 0, count: 0 }
    entry.amount += tx.baseAmount
    entry.count += 1
    byKey.set(key, entry)
  }
  return [...byKey.values()]
    .sort((a, b) => b.amount - a.amount || a.payee.localeCompare(b.payee))
    .slice(0, limit)
}

/** Spending and income per tag (a transaction with two tags counts under both). */
export function tagTotals(txs: readonly ReportTx[]): TagTotal[] {
  const byTag = new Map<string, TagTotal>()
  for (const tx of txs) {
    if (tx.type === 'transfer') continue
    for (const tag of new Set(tx.tags)) {
      const entry = byTag.get(tag) ?? { tag, expense: 0, income: 0, count: 0 }
      if (tx.type === 'expense') entry.expense += tx.baseAmount
      else entry.income += tx.baseAmount
      entry.count += 1
      byTag.set(tag, entry)
    }
  }
  return [...byTag.values()].sort(
    (a, b) => b.expense - a.expense || b.income - a.income || a.tag.localeCompare(b.tag),
  )
}

// ---------------------------------------------------------------------------------------------
// Comparison

function row(id: string, name: string, current: number, previous: number): ComparisonRow {
  return {
    id,
    name,
    current,
    previous,
    change: current - previous,
    changePercent: deltaPercent(current, previous),
  }
}

/** Two periods side by side: totals plus spending per top-level category. */
export function comparePeriods(
  current: readonly ReportTx[],
  previous: readonly ReportTx[],
  categories: readonly ReportCategory[],
): Comparison {
  const now = categorySpend(current, categories)
  const before = new Map(categorySpend(previous, categories).map((s) => [s.id, s]))
  const rows = now.map((s) => row(s.id, s.name, s.amount, before.get(s.id)?.amount ?? 0))
  for (const [id, s] of before) {
    if (!now.some((n) => n.id === id)) rows.push(row(id, s.name, 0, s.amount))
  }
  rows.sort((a, b) => b.current - a.current || b.previous - a.previous)
  const a = totals(current)
  const b = totals(previous)
  return {
    rows,
    income: row('income', 'Income', a.income, b.income),
    expense: row('expense', 'Spending', a.expense, b.expense),
    net: row('net', 'Net', a.net, b.net),
  }
}

// ---------------------------------------------------------------------------------------------
// Lists

/** Newest first (by date, then id for a stable order). */
export function newestFirst<T extends Pick<ReportTx, 'date' | 'id'>>(txs: readonly T[]): T[] {
  return [...txs].sort((a, b) =>
    a.date === b.date ? b.id.localeCompare(a.id) : a.date < b.date ? 1 : -1,
  )
}
