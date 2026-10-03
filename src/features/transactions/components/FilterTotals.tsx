import { skipToken } from '@reduxjs/toolkit/query/react'
import { useMemo } from 'react'
import { useGetTransactionsInRangeQuery } from '@/features/reports/api'
import { totals } from '@/features/reports/utils'
import { calendarDate } from '@/utils/dates'
import { formatMoney } from '@/utils/money'
import { matchesQuery, type TxQuery } from '../filters'
import type { Transaction } from '../types'

interface Props {
  uid: string
  query: TxQuery
  /** Rows loaded so far, used when there is no date range to read in one go. */
  loaded: readonly Transaction[]
  complete: boolean
  baseCurrency: string
  locale?: string
}

/**
 * Income, spending and net for everything matching the filters (transfers left out), so the
 * list can be checked against the dashboard and reports. With a date range it reads the whole
 * range at once; without one it totals the list once every page has loaded.
 */
export function FilterTotals({ uid, query, loaded, complete, baseCurrency, locale }: Props) {
  const ranged = query.start !== null && query.end !== null
  const rangeQuery = useGetTransactionsInRangeQuery(
    ranged
      ? {
          uid,
          start: calendarDate(query.start as string),
          end: calendarDate(query.end as string),
        }
      : skipToken,
  )
  const sum = useMemo(() => {
    if (ranged)
      return rangeQuery.data ? totals(rangeQuery.data.filter((t) => matchesQuery(t, query))) : null
    return complete ? totals(loaded) : null
  }, [ranged, rangeQuery.data, query, complete, loaded])

  if (!sum) return null
  const money = (v: number) => formatMoney(v, baseCurrency, locale)
  return (
    <dl
      aria-label="Totals for these filters"
      className="flex flex-wrap gap-x-5 gap-y-1 rounded-lg border bg-card px-3 py-2 text-sm"
    >
      <div className="flex gap-1.5">
        <dt className="text-muted-foreground">Income</dt>
        <dd className="font-medium text-success tabular-nums">{money(sum.income)}</dd>
      </div>
      <div className="flex gap-1.5">
        <dt className="text-muted-foreground">Spending</dt>
        <dd className="font-medium tabular-nums">{money(sum.expense)}</dd>
      </div>
      <div className="flex gap-1.5">
        <dt className="text-muted-foreground">Net</dt>
        <dd className="font-medium tabular-nums">{money(sum.net)}</dd>
      </div>
    </dl>
  )
}
