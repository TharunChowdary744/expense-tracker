import { addDays, startOfDay, startOfMonth, startOfYear, subDays, subMonths } from 'date-fns'
import { toMinor } from '@/utils/money'
import { TRANSACTION_TYPES, normalizeTag, type TransactionType } from './schemas'
import type { Transaction } from './types'
import { parseDateInput } from './utils'

/**
 * Transaction list filters. They live in the URL query string so a filtered view can be
 * shared and survives a reload:
 *
 *   ?q=coffee&range=this-month&type=expense&acc=a1,a2&cat=c1&tag=trip&min=100&max=500&sort=amount-desc
 *
 * Date presets stay relative ("this month" is re-evaluated when the link is opened); a custom
 * range uses `from` / `to` (yyyy-MM-dd, both inclusive). `min` / `max` are base-currency
 * amounts in major units.
 */

export const DATE_PRESETS = [
  'all',
  'this-month',
  'last-month',
  'last-30-days',
  'last-90-days',
  'this-year',
  'custom',
] as const
export type DatePreset = (typeof DATE_PRESETS)[number]

export const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  all: 'All time',
  'this-month': 'This month',
  'last-month': 'Last month',
  'last-30-days': 'Last 30 days',
  'last-90-days': 'Last 90 days',
  'this-year': 'This year',
  custom: 'Custom range',
}

export const SORTS = ['date-desc', 'date-asc', 'amount-desc', 'amount-asc'] as const
export type SortOrder = (typeof SORTS)[number]

export const SORT_LABELS: Record<SortOrder, string> = {
  'date-desc': 'Newest first',
  'date-asc': 'Oldest first',
  'amount-desc': 'Largest amount',
  'amount-asc': 'Smallest amount',
}

export interface TxFilters {
  search: string
  range: DatePreset
  /** yyyy-MM-dd, used when range is 'custom'. */
  from: string
  to: string
  type: TransactionType | null
  accountIds: string[]
  categoryIds: string[]
  tags: string[]
  /** Base-currency amounts as typed (major units); '' means no bound. */
  min: string
  max: string
  sort: SortOrder
}

export const DEFAULT_FILTERS: TxFilters = {
  search: '',
  range: 'all',
  from: '',
  to: '',
  type: null,
  accountIds: [],
  categoryIds: [],
  tags: [],
  min: '',
  max: '',
  sort: 'date-desc',
}

const DATE = /^\d{4}-\d{2}-\d{2}$/
const AMOUNT = /^\d+(\.\d+)?$/

function list(value: string | null): string[] {
  if (!value) return []
  return [
    ...new Set(
      value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ].slice(0, 30)
}

function oneOf<T extends string>(options: readonly T[], value: string | null, fallback: T): T {
  return value !== null && (options as readonly string[]).includes(value) ? (value as T) : fallback
}

/** Reads filters from a query string, ignoring anything malformed. */
export function parseFilters(params: URLSearchParams): TxFilters {
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const min = params.get('min') ?? ''
  const max = params.get('max') ?? ''
  const type = params.get('type')
  return {
    search: (params.get('q') ?? '').slice(0, 100),
    range: oneOf(DATE_PRESETS, params.get('range'), 'all'),
    from: DATE.test(from) && parseDateInput(from) ? from : '',
    to: DATE.test(to) && parseDateInput(to) ? to : '',
    type: oneOf([...TRANSACTION_TYPES, ''] as const, type, '') || null,
    accountIds: list(params.get('acc')),
    categoryIds: list(params.get('cat')),
    tags: list(params.get('tag')).map(normalizeTag).filter(Boolean),
    min: AMOUNT.test(min) ? min : '',
    max: AMOUNT.test(max) ? max : '',
    sort: oneOf(SORTS, params.get('sort'), 'date-desc'),
  }
}

/** Writes filters to a query string, leaving out defaults so URLs stay short. */
export function filtersToParams(filters: TxFilters): URLSearchParams {
  const params = new URLSearchParams()
  const search = filters.search.trim()
  if (search) params.set('q', search)
  if (filters.range !== 'all') params.set('range', filters.range)
  if (filters.range === 'custom') {
    if (filters.from) params.set('from', filters.from)
    if (filters.to) params.set('to', filters.to)
  }
  if (filters.type) params.set('type', filters.type)
  if (filters.accountIds.length) params.set('acc', filters.accountIds.join(','))
  if (filters.categoryIds.length) params.set('cat', filters.categoryIds.join(','))
  if (filters.tags.length) params.set('tag', filters.tags.join(','))
  if (filters.min) params.set('min', filters.min)
  if (filters.max) params.set('max', filters.max)
  if (filters.sort !== 'date-desc') params.set('sort', filters.sort)
  return params
}

/** How many filters (not counting search and sort) are active, for the Filters button badge. */
export function activeFilterCount(filters: TxFilters): number {
  return (
    (filters.range !== 'all' ? 1 : 0) +
    (filters.type ? 1 : 0) +
    (filters.accountIds.length ? 1 : 0) +
    (filters.categoryIds.length ? 1 : 0) +
    (filters.tags.length ? 1 : 0) +
    (filters.min || filters.max ? 1 : 0)
  )
}

/** Start (inclusive) and end (exclusive) instants for a preset, as ISO strings. */
export function resolveRange(
  filters: Pick<TxFilters, 'range' | 'from' | 'to'>,
  now = new Date(),
): { start: string | null; end: string | null } {
  const today = startOfDay(now)
  const tomorrow = addDays(today, 1)
  const iso = (d: Date | null) => (d ? d.toISOString() : null)
  switch (filters.range) {
    case 'this-month':
      return { start: iso(startOfMonth(today)), end: iso(tomorrow) }
    case 'last-month':
      return { start: iso(startOfMonth(subMonths(today, 1))), end: iso(startOfMonth(today)) }
    case 'last-30-days':
      return { start: iso(subDays(today, 29)), end: iso(tomorrow) }
    case 'last-90-days':
      return { start: iso(subDays(today, 89)), end: iso(tomorrow) }
    case 'this-year':
      return { start: iso(startOfYear(today)), end: iso(tomorrow) }
    case 'custom': {
      const from = parseDateInput(filters.from)
      const to = parseDateInput(filters.to)
      return { start: iso(from), end: iso(to ? addDays(to, 1) : null) }
    }
    default:
      return { start: null, end: null }
  }
}

/** Resolved, serialisable query for the list endpoint (also its cache key). */
export interface TxQuery {
  sort: SortOrder
  type: TransactionType | null
  start: string | null
  end: string | null
  accountIds: string[]
  categoryIds: string[]
  tags: string[]
  /** Base-currency minor units, inclusive. */
  minBase: number | null
  maxBase: number | null
  search: string
}

function safeMinor(value: string, currency: string): number | null {
  if (!value) return null
  try {
    return toMinor(value, currency)
  } catch {
    return null
  }
}

/**
 * Turns URL filters into a query. `expandCategory` maps a picked category to itself plus its
 * subcategories, so filtering by "Food" also finds "Food › Groceries".
 */
export function buildQuery(
  filters: TxFilters,
  baseCurrency: string,
  expandCategory: (id: string) => string[] = (id) => [id],
  now = new Date(),
): TxQuery {
  const { start, end } = resolveRange(filters, now)
  return {
    sort: filters.sort,
    type: filters.type,
    start,
    end,
    accountIds: [...filters.accountIds].sort(),
    categoryIds: [...new Set(filters.categoryIds.flatMap(expandCategory))].sort(),
    tags: [...filters.tags].sort(),
    minBase: safeMinor(filters.min, baseCurrency),
    maxBase: safeMinor(filters.max, baseCurrency),
    search: filters.search.trim().toLowerCase(),
  }
}

/** True when the query needs filtering beyond what Firestore does (see `serverPlan`). */
export function hasClientFilters(q: TxQuery): boolean {
  return (
    q.accountIds.length > 0 ||
    q.categoryIds.length > 0 ||
    q.tags.length > 0 ||
    q.minBase !== null ||
    q.maxBase !== null ||
    q.search !== '' ||
    // Sorting by amount can't use a date range in the same Firestore query.
    (q.sort.startsWith('amount') && (q.start !== null || q.end !== null))
  )
}

/**
 * What Firestore does: the type filter, the sort, and the date range when sorting by date.
 * Each combination is covered by firestore.indexes.json.
 */
export function serverPlan(q: TxQuery): {
  field: 'date' | 'baseAmount'
  direction: 'asc' | 'desc'
  type: TransactionType | null
  start: string | null
  end: string | null
} {
  const byDate = q.sort.startsWith('date')
  return {
    field: byDate ? 'date' : 'baseAmount',
    direction: q.sort.endsWith('asc') ? 'asc' : 'desc',
    type: q.type,
    start: byDate ? q.start : null,
    end: byDate ? q.end : null,
  }
}

/** The full filter, checked on the client for every row Firestore returns. */
export function matchesQuery(tx: Transaction, q: TxQuery): boolean {
  if (q.type && tx.type !== q.type) return false
  if (q.start && tx.date < q.start) return false
  if (q.end && tx.date >= q.end) return false
  if (
    q.accountIds.length &&
    !q.accountIds.includes(tx.accountId) &&
    !(tx.toAccountId && q.accountIds.includes(tx.toAccountId))
  ) {
    return false
  }
  if (q.categoryIds.length && !(tx.categoryId && q.categoryIds.includes(tx.categoryId))) {
    return false
  }
  if (q.tags.length && !q.tags.some((tag) => tx.tags.includes(tag))) return false
  if (q.minBase !== null && tx.baseAmount < q.minBase) return false
  if (q.maxBase !== null && tx.baseAmount > q.maxBase) return false
  if (q.search) {
    const haystack = `${tx.payee}\n${tx.note}`.toLowerCase()
    if (!haystack.includes(q.search)) return false
  }
  return true
}
