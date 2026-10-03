import { createSelector } from '@reduxjs/toolkit'
import { computeDashboard, computeReport, type DashboardParams, type ReportParams } from './compute'
import type { ReportCategory, ReportTx } from './types'
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
export const selectRangeTransactions = createSelector(
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
export const selectDrill = createSelector(
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
