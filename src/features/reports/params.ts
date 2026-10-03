import { addCalendarDays, isCalendarDate } from '@/utils/dates'
import type { DateRange } from './types'
import { RANGE_PRESETS, type RangePreset } from './utils'

/**
 * Report filters live in the URL so a report can be bookmarked or shared:
 *
 *   /reports?range=custom&from=2026-09-01&to=2026-09-30&acc=a1,a2&cat=food&slice=groceries
 */
export interface ReportSearch {
  preset: RangePreset
  from: string
  to: string
  accountIds: string[]
  /** Drill-down: the top-level category opened, and the slice whose transactions are listed. */
  parentId: string | null
  sliceId: string | null
}

export function parseReportSearch(
  params: URLSearchParams,
  allowed: readonly RangePreset[] = RANGE_PRESETS,
): ReportSearch {
  const range = params.get('range')
  const date = (key: string) => {
    const value = params.get(key) ?? ''
    return isCalendarDate(value) ? value : ''
  }
  const id = (key: string) => {
    const value = params.get(key)
    return value && /^[^/]{1,200}$/.test(value) ? value : null
  }
  return {
    preset: (allowed as readonly string[]).includes(range ?? '')
      ? (range as RangePreset)
      : 'this-month',
    from: date('from'),
    to: date('to'),
    accountIds: [
      ...new Set(
        (params.get('acc') ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ].slice(0, 30),
    parentId: id('cat'),
    sliceId: id('slice'),
  }
}

export function reportSearchParams(search: ReportSearch): URLSearchParams {
  const params = new URLSearchParams()
  if (search.preset !== 'this-month') params.set('range', search.preset)
  if (search.preset === 'custom') {
    if (search.from) params.set('from', search.from)
    if (search.to) params.set('to', search.to)
  }
  if (search.accountIds.length) params.set('acc', search.accountIds.join(','))
  if (search.parentId) params.set('cat', search.parentId)
  if (search.sliceId) params.set('slice', search.sliceId)
  return params
}

/**
 * A link to the Transactions page showing the same range (and accounts, type), so its list
 * can be checked against a report or dashboard figure.
 */
export function transactionsLink(
  range: DateRange,
  options: {
    preset?: RangePreset
    accountIds?: readonly string[]
    type?: 'expense' | 'income'
  } = {},
): string {
  const params = new URLSearchParams()
  // The Transactions page understands these presets with the same meaning.
  if (
    options.preset === 'this-month' ||
    options.preset === 'last-month' ||
    options.preset === 'this-year'
  ) {
    params.set('range', options.preset)
  } else {
    params.set('range', 'custom')
    params.set('from', range.start)
    params.set('to', addCalendarDays(range.end, -1))
  }
  if (options.type) params.set('type', options.type)
  if (options.accountIds?.length) params.set('acc', options.accountIds.join(','))
  return `/transactions?${params.toString()}`
}
