import type {
  CategorySlice,
  Comparison,
  DateRange,
  DayFlow,
  MonthTotals,
  PayeeTotal,
  ReportCategory,
  ReportTx,
  TagTotal,
  Totals,
} from './types'
import {
  categorySpend,
  comparePeriods,
  dailyFlow,
  filterTransactions,
  monthKeys,
  monthlyTotals,
  tagTotals,
  topPayees,
  totals,
} from './utils'

/** Everything the Reports page shows for one range, account filter and timezone. */
export interface ReportParams {
  range: DateRange
  previous: DateRange
  /** The 12 months for the trend chart. */
  trend: DateRange
  accountIds: readonly string[]
  timeZone: string
}

export interface Report {
  totals: Totals
  previousTotals: Totals
  byCategory: CategorySlice[]
  monthlyTrend: MonthTotals[]
  incomeVsExpense: MonthTotals[]
  flow: DayFlow[]
  payees: PayeeTotal[]
  tags: TagTotal[]
  comparison: Comparison
}

/** Pure; runs on the main thread (memoised with createSelector) or in the report worker. */
export function computeReport(
  txs: readonly ReportTx[],
  categories: readonly ReportCategory[],
  params: ReportParams,
): Report {
  const { range, previous, trend, accountIds, timeZone } = params
  const current = filterTransactions(txs, { range, accountIds }, timeZone)
  const before = filterTransactions(txs, { range: previous, accountIds }, timeZone)
  const trendTxs = filterTransactions(txs, { range: trend, accountIds }, timeZone)
  return {
    totals: totals(current),
    previousTotals: totals(before),
    byCategory: categorySpend(current, categories),
    monthlyTrend: monthlyTotals(trendTxs, monthKeys(trend), timeZone),
    incomeVsExpense: monthlyTotals(current, monthKeys(range), timeZone),
    flow: dailyFlow(current, range, timeZone),
    payees: topPayees(current, 10),
    tags: tagTotals(current),
    comparison: comparePeriods(current, before, categories),
  }
}

export interface DashboardParams {
  range: DateRange
  previous: DateRange
  timeZone: string
}

export interface DashboardSummary {
  totals: Totals
  previousTotals: Totals
  topCategories: CategorySlice[]
}

export function computeDashboard(
  txs: readonly ReportTx[],
  categories: readonly ReportCategory[],
  params: DashboardParams,
): DashboardSummary {
  const current = filterTransactions(txs, { range: params.range, accountIds: [] }, params.timeZone)
  const before = filterTransactions(
    txs,
    { range: params.previous, accountIds: [] },
    params.timeZone,
  )
  return {
    totals: totals(current),
    previousTotals: totals(before),
    topCategories: categorySpend(current, categories).slice(0, 5),
  }
}
