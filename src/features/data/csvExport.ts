import type { ReportCategory, ReportTx } from '@/features/reports/types'
import { calendarDate } from '@/utils/dates'
import { toCsv } from '@/utils/csv'
import { fromMinor } from '@/utils/money'

/**
 * Transactions as CSV. The columns are the ones the import wizard recognises, so an exported
 * file imports back unchanged: amounts are positive major-unit decimals with a Type column,
 * dates and times are in the user's timezone, and categories are "Parent › Child".
 */
export const CSV_COLUMNS = [
  'Date',
  'Time',
  'Type',
  'Amount',
  'Currency',
  'Account',
  'To account',
  'Category',
  'Payee',
  'Note',
  'Tags',
  'FX rate',
  'Base amount',
  'Base currency',
] as const

const NUMERIC = new Set([3, 11, 12])

export interface CsvExportContext {
  accounts: ReadonlyMap<string, { name: string }>
  categories: readonly ReportCategory[]
  baseCurrency: string
  timeZone?: string
}

export type ExportTx = ReportTx & { fxRateToBase: number }

/** "Food › Groceries" for a subcategory, "Food" for a top-level one, '' when none. */
export function categoryLabel(
  categoryId: string | undefined,
  byId: ReadonlyMap<string, ReportCategory>,
): string {
  if (!categoryId) return ''
  const category = byId.get(categoryId)
  if (!category) return ''
  const parent = category.parentId ? byId.get(category.parentId) : undefined
  return parent ? `${parent.name} › ${category.name}` : category.name
}

function timeOf(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso))
}

/** Oldest first, so the file reads like a statement. */
export function transactionsToCsv(txs: readonly ExportTx[], ctx: CsvExportContext): string {
  const byId = new Map(ctx.categories.map((c) => [c.id, c]))
  const accountName = (id: string | undefined) => (id ? (ctx.accounts.get(id)?.name ?? '') : '')
  const sorted = [...txs].sort((a, b) =>
    a.date === b.date ? a.id.localeCompare(b.id) : a.date < b.date ? -1 : 1,
  )
  const rows = sorted.map((tx) => [
    calendarDate(tx.date, ctx.timeZone),
    timeOf(tx.date, ctx.timeZone),
    tx.type,
    fromMinor(tx.amount, tx.currency),
    tx.currency,
    accountName(tx.accountId),
    accountName(tx.toAccountId),
    categoryLabel(tx.categoryId, byId),
    tx.payee,
    tx.note,
    tx.tags.join(';'),
    String(tx.fxRateToBase),
    fromMinor(tx.baseAmount, ctx.baseCurrency),
    ctx.baseCurrency,
  ])
  return toCsv(CSV_COLUMNS, rows, NUMERIC)
}

/** "ledgerly-transactions-2026-10-01-to-2026-10-31.csv" */
export function exportFileName(
  prefix: string,
  from: string | null,
  to: string | null,
  ext: string,
) {
  const span = from && to ? `-${from}-to-${to}` : from ? `-from-${from}` : to ? `-to-${to}` : ''
  return `ledgerly-${prefix}${span}.${ext}`
}
