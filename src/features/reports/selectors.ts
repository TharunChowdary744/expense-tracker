import { createSelector } from '@reduxjs/toolkit'
import { computeDashboard, computeReport, type DashboardParams, type ReportParams } from './compute'
import type { CategorySlice, ReportCategory, ReportTx } from './types'
import { filterTransactions, sliceTransactions, categorySpend } from './utils'

/**
 * Memoised report selectors. They take the loaded data and params as arguments (not the
 * store), so each input must keep its identity between renders: RTK Query data does, and the
 * params objects are built with useMemo.
 */

const txsArg = (txs: readonly ReportTx[]) => txs
const categoriesArg = (_txs: unknown, categories: readonly ReportCategory[]) => categories

export const selectReport = createSelector(
  [txsArg, categoriesArg, (_txs: unknown, _c: unknown, params: ReportParams) => params],
  computeReport,
)

export const selectDashboard = createSelector(
  [txsArg, categoriesArg, (_txs: unknown, _c: unknown, params: DashboardParams) => params],
  computeDashboard,
)

/** The filtered transactions for the range (for drill-down lists and exports). */
const rangeSelector = createSelector(
  [txsArg, (_txs: unknown, _c: unknown, params: ReportParams) => params],
  (txs, params) =>
    filterTransactions(
      txs,
      { range: params.range, accountIds: params.accountIds },
      params.timeZone,
    ),
)

export interface DrillParams {
  /** The top-level category drilled into, or null for all categories. */
  parentId: string | null
  /** The slice whose transactions are listed, or null. */
  sliceId: string | null
}

/** Slices for the current drill level and the transactions of the selected slice. */
const drillSelector = createSelector(
  [
    (current: readonly ReportTx[]) => current,
    (_t: unknown, categories: readonly ReportCategory[]) => categories,
    (_t: unknown, _c: unknown, drill: DrillParams) => drill,
  ],
  (current, categories, { parentId, sliceId }) => {
    const slices = categorySpend(current, categories, parentId)
    const slice = slices.find((s) => s.id === sliceId) ?? null
    // Inside a category with nothing picked yet, list all of that category's transactions.
    const transactions = slice
      ? sliceTransactions(current, categories, slice, parentId)
      : parentId !== null
        ? sliceTransactions(current, categories, { id: parentId, isParentSelf: false }, null)
        : []
    return { slices, slice, transactions }
  },
)

/** `drillSelector`, keeping the caller's transaction type (rows are the objects passed in). */
export function selectDrill<T extends ReportTx>(
  current: readonly T[],
  categories: readonly ReportCategory[],
  drill: DrillParams,
): { slices: CategorySlice[]; slice: CategorySlice | null; transactions: T[] } {
  return drillSelector(current, categories, drill) as ReturnType<typeof selectDrill<T>>
}

/** The report's range and accounts applied to `txs`, keeping the caller's transaction type. */
export function selectRangeTransactions<T extends ReportTx>(
  txs: readonly T[],
  params: ReportParams,
): T[] {
  return rangeSelector(txs, null, params) as T[]
}
