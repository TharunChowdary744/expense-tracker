import type { Category } from '@/features/categories/types'
import type { Transaction } from '@/features/transactions/types'

/** A span of calendar dates (yyyy-MM-dd) in the user's timezone; `end` is exclusive. */
export interface DateRange {
  start: string
  end: string
}

/** The transaction fields reports read. Full transactions satisfy it. */
export type ReportTx = Pick<
  Transaction,
  | 'id'
  | 'type'
  | 'amount'
  | 'currency'
  | 'baseAmount'
  | 'accountId'
  | 'toAccountId'
  | 'categoryId'
  | 'payee'
  | 'note'
  | 'tags'
  | 'date'
>

export type ReportCategory = Pick<Category, 'id' | 'name' | 'kind' | 'parentId' | 'color' | 'order'>

/** Income, expenses and their difference in base-currency minor units. Transfers don't count. */
export interface Totals {
  income: number
  expense: number
  net: number
  /** Income and expense transactions counted. */
  count: number
}

/** Uncategorised spending is reported under this id. */
export const UNCATEGORISED = '__none__'

export interface CategorySlice {
  /** Category id, or UNCATEGORISED. */
  id: string
  name: string
  color: string
  amount: number
  /** Share of the level's total, 0–1 (display only). */
  share: number
  count: number
  /** True when the slice is a top-level category with subcategories to drill into. */
  hasChildren: boolean
  /** True for "spent on the parent itself" at the subcategory level. */
  isParentSelf: boolean
}

export interface MonthTotals extends Totals {
  /** yyyy-MM */
  month: string
}

export interface DayFlow {
  date: string
  income: number
  expense: number
  net: number
  /** Running net from the start of the range. */
  cumulative: number
}

export interface PayeeTotal {
  payee: string
  amount: number
  count: number
}

export interface TagTotal {
  tag: string
  expense: number
  income: number
  count: number
}

export interface ComparisonRow {
  id: string
  name: string
  current: number
  previous: number
  change: number
  /** null when the previous value is zero. */
  changePercent: number | null
}

export interface Comparison {
  /** Expense categories (top level), largest current spend first. */
  rows: ComparisonRow[]
  income: ComparisonRow
  expense: ComparisonRow
  net: ComparisonRow
}
