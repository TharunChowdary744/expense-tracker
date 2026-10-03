import { normalizeTag, NOTE_MAX, PAYEE_MAX, TAGS_MAX } from '@/features/transactions/schemas'
import type { ReportCategory } from '@/features/reports/types'
import { currencyProblem } from '@/features/transactions/schemas'
import { unescapeFormula } from '@/utils/csv'
import { CURRENCY_CODE } from '@/utils/currency'
import { calendarDate, isCalendarDate } from '@/utils/dates'
import { convertMinor, currencyDigits, isValidRate, toMinor } from '@/utils/money'

/**
 * The CSV import wizard's pure logic: guessing the column mapping, turning rows into
 * transactions, and flagging duplicates (same day, amount and payee as an existing entry).
 */

export const IMPORT_FIELDS = [
  'date',
  'time',
  'type',
  'amount',
  'debit',
  'credit',
  'currency',
  'account',
  'toAccount',
  'category',
  'payee',
  'note',
  'tags',
  'fxRate',
  'baseAmount',
] as const
export type ImportField = (typeof IMPORT_FIELDS)[number]

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  date: 'Date',
  time: 'Time',
  type: 'Type (expense, income, transfer)',
  amount: 'Amount',
  debit: 'Money out (debit)',
  credit: 'Money in (credit)',
  currency: 'Currency',
  account: 'Account',
  toAccount: 'To account (transfers)',
  category: 'Category',
  payee: 'Payee',
  note: 'Note',
  tags: 'Tags',
  fxRate: 'FX rate to base',
  baseAmount: 'Amount in base currency',
}

/** Field → column index. Unmapped fields are left out. */
export type ColumnMapping = Partial<Record<ImportField, number>>

const HEADER_ALIASES: Record<ImportField, string[]> = {
  date: ['date', 'transaction date', 'txn date', 'value date', 'posting date', 'posted date'],
  time: ['time'],
  type: ['type', 'transaction type', 'kind'],
  amount: ['amount', 'value', 'transaction amount', 'sum'],
  debit: ['debit', 'withdrawal', 'withdrawals', 'money out', 'paid out', 'debit amount'],
  credit: ['credit', 'deposit', 'deposits', 'money in', 'paid in', 'credit amount'],
  currency: ['currency', 'ccy'],
  account: ['account', 'from account', 'account name'],
  toAccount: ['to account'],
  category: ['category'],
  payee: ['payee', 'merchant', 'description', 'name', 'narration', 'details'],
  note: ['note', 'notes', 'memo', 'remarks'],
  tags: ['tags', 'tag', 'labels'],
  fxRate: ['fx rate', 'exchange rate', 'rate'],
  baseAmount: ['base amount', 'amount in base currency'],
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

/** Maps columns whose header matches a known name; each column is used at most once. */
export function guessMapping(header: readonly string[]): ColumnMapping {
  const mapping: ColumnMapping = {}
  const used = new Set<number>()
  const headers = header.map(norm)
  for (const field of IMPORT_FIELDS) {
    for (const alias of HEADER_ALIASES[field]) {
      const index = headers.findIndex((h, i) => h === alias && !used.has(i))
      if (index !== -1) {
        mapping[field] = index
        used.add(index)
        break
      }
    }
  }
  return mapping
}

/** What the mapping still needs before rows can be read, or null when it is complete. */
export function mappingProblem(mapping: ColumnMapping): string | null {
  if (mapping.date === undefined) return 'Choose the column with the date.'
  const hasAmount = mapping.amount !== undefined
  const hasSplit = mapping.debit !== undefined || mapping.credit !== undefined
  if (!hasAmount && !hasSplit)
    return 'Choose the amount column, or the money out / money in columns.'
  if (hasAmount && hasSplit) return 'Use either Amount or Money out / Money in, not both.'
  const columns = Object.values(mapping)
  if (new Set(columns).size !== columns.length) return 'Each column can be used for one field only.'
  return null
}

// ---------------------------------------------------------------------------------------------
// Dates

export const DATE_FORMATS = [
  'yyyy-MM-dd',
  'dd/MM/yyyy',
  'MM/dd/yyyy',
  'dd-MM-yyyy',
  'dd.MM.yyyy',
] as const
export type DateFormat = (typeof DATE_FORMATS)[number]

const DATE_PATTERNS: Record<DateFormat, RegExp> = {
  'yyyy-MM-dd': /^(?<y>\d{4})[-/](?<m>\d{1,2})[-/](?<d>\d{1,2})$/,
  'dd/MM/yyyy': /^(?<d>\d{1,2})\/(?<m>\d{1,2})\/(?<y>\d{2}|\d{4})$/,
  'MM/dd/yyyy': /^(?<m>\d{1,2})\/(?<d>\d{1,2})\/(?<y>\d{2}|\d{4})$/,
  'dd-MM-yyyy': /^(?<d>\d{1,2})-(?<m>\d{1,2})-(?<y>\d{2}|\d{4})$/,
  'dd.MM.yyyy': /^(?<d>\d{1,2})\.(?<m>\d{1,2})\.(?<y>\d{2}|\d{4})$/,
}

/** Reads a date cell (a time after a space or "T" is ignored) as yyyy-MM-dd, or null. */
export function parseDateCell(value: string, format: DateFormat): string | null {
  const datePart = value.trim().split(/[ T]/)[0] ?? ''
  const groups = DATE_PATTERNS[format].exec(datePart)?.groups
  if (!groups) return null
  const year = groups.y?.length === 2 ? `20${groups.y}` : (groups.y ?? '')
  const date = `${year}-${(groups.m ?? '').padStart(2, '0')}-${(groups.d ?? '').padStart(2, '0')}`
  return isCalendarDate(date) ? date : null
}

/** The first format that reads every sample, preferring ISO, then day-first. */
export function guessDateFormat(samples: readonly string[]): DateFormat {
  const values = samples.map((s) => s.trim()).filter(Boolean)
  return DATE_FORMATS.find((f) => values.every((v) => parseDateCell(v, f) !== null)) ?? 'yyyy-MM-dd'
}

const TIME = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/

/** "14:05" or "14:05:09" → "14:05:09", else null. */
export function parseTimeCell(value: string): string | null {
  const match = TIME.exec(value.trim())
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  const s = Number(match[3] ?? 0)
  if (h > 23 || m > 59 || s > 59) return null
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':')
}

/** The stored instant for a day and optional time on this device (noon when no time). */
export function importInstant(day: string, time: string | null): string {
  const [y, mo, d] = day.split('-').map(Number) as [number, number, number]
  const [h, mi, s] = (time ?? '12:00:00').split(':').map(Number) as [number, number, number]
  return new Date(y, mo - 1, d, h, mi, s).toISOString()
}

// ---------------------------------------------------------------------------------------------
// Amounts

/**
 * Reads an amount cell into signed minor units: "1,234.50", "-12", "(12.00)" (negative),
 * "₹ 99", "12.50 CR" (positive) or "12.50 DR" (negative). Null when empty, throws when not a
 * number.
 */
export function parseAmountCell(value: string, currency: string): number | null {
  let text = value.trim()
  if (text === '') return null
  let sign = 1
  if (/\bdr\.?$/i.test(text)) sign = -1
  text = text.replace(/\b(cr|dr)\.?$/i, '')
  if (/^\(.*\)$/.test(text.trim())) {
    sign = -sign
    text = text.trim().slice(1, -1)
  }
  if (/^\s*-/.test(text) || /-\s*$/.test(text)) sign = -sign
  const cleaned = text.replace(/[^\d.,]/g, '')
  if (!/\d/.test(cleaned)) throw new RangeError(`Not an amount: "${value}"`)
  return sign * Math.abs(toMinor(cleaned, currency))
}

// ---------------------------------------------------------------------------------------------
// Rows → transactions

export interface ImportAccount {
  id: string
  name: string
  currency: string
}

export interface ImportContext {
  accounts: readonly ImportAccount[]
  categories: readonly ReportCategory[]
  /** Used for rows without a (known) account. */
  defaultAccountId: string
  baseCurrency: string
  dateFormat: DateFormat
  /** Without a type column, what a positive amount is (bank exports differ). */
  positiveIs: 'income' | 'expense'
}

export interface ImportedTx {
  /** yyyy-MM-dd */
  day: string
  /** ISO instant to store. */
  date: string
  type: 'expense' | 'income' | 'transfer'
  amount: number
  currency: string
  fxRateToBase: number
  baseAmount: number
  accountId: string
  toAccountId?: string
  categoryId?: string
  payee: string
  note: string
  tags: string[]
}

export type ImportRow =
  | { line: number; ok: true; tx: ImportedTx; warnings: string[] }
  | { line: number; ok: false; error: string }

const TYPE_WORDS: Record<string, ImportedTx['type']> = {
  expense: 'expense',
  expenses: 'expense',
  debit: 'expense',
  dr: 'expense',
  withdrawal: 'expense',
  income: 'income',
  credit: 'income',
  cr: 'income',
  deposit: 'income',
  transfer: 'transfer',
}

function byName<T extends { name: string }>(items: readonly T[]): Map<string, T> {
  const map = new Map<string, T>()
  for (const item of items) {
    const key = norm(item.name)
    if (!map.has(key)) map.set(key, item)
  }
  return map
}

/** Finds a category by "Parent › Child", "Parent > Child" or a unique name, of the given kind. */
export function matchCategory(
  label: string,
  kind: 'expense' | 'income',
  categories: readonly ReportCategory[],
): ReportCategory | undefined {
  const wanted = norm(label)
  if (!wanted) return undefined
  const ofKind = categories.filter((c) => c.kind === kind)
  const byId = new Map(ofKind.map((c) => [c.id, c]))
  const [parentPart, childPart] = wanted.split(/\s*(?:›|>)\s*/)
  if (childPart !== undefined) {
    return ofKind.find(
      (c) =>
        norm(c.name) === childPart &&
        c.parentId !== null &&
        norm(byId.get(c.parentId)?.name ?? '') === parentPart,
    )
  }
  const named = ofKind.filter((c) => norm(c.name) === wanted)
  // Prefer a top-level category when a subcategory has the same name.
  return named.find((c) => c.parentId === null) ?? named[0]
}

/** Turns data rows (header excluded) into transactions or row errors. `line` is 1-based. */
export function mapRows(
  rows: readonly (readonly string[])[],
  mapping: ColumnMapping,
  ctx: ImportContext,
  firstLine = 2,
): ImportRow[] {
  const accountsByName = byName(ctx.accounts)
  const accountsById = new Map(ctx.accounts.map((a) => [a.id, a]))
  const cell = (row: readonly string[], field: ImportField) => {
    const index = mapping[field]
    return index === undefined ? '' : unescapeFormula((row[index] ?? '').trim())
  }

  return rows.map((row, i): ImportRow => {
    const line = firstLine + i
    const fail = (error: string): ImportRow => ({ line, ok: false, error })
    const warnings: string[] = []

    const day = parseDateCell(cell(row, 'date'), ctx.dateFormat)
    if (!day) return fail(`Date "${cell(row, 'date')}" isn't in the ${ctx.dateFormat} format.`)
    const timeText = cell(row, 'time')
    const time = timeText ? parseTimeCell(timeText) : null

    const accountText = cell(row, 'account')
    const account =
      (accountText && accountsByName.get(norm(accountText))) ||
      accountsById.get(ctx.defaultAccountId)
    if (!account) return fail('Choose an account to import into.')
    if (accountText && norm(account.name) !== norm(accountText)) {
      warnings.push(`Account "${accountText}" not found; using ${account.name}.`)
    }

    const currencyText = cell(row, 'currency').toUpperCase()
    const currency = currencyText || account.currency
    if (!CURRENCY_CODE.test(currency)) return fail(`Currency "${currencyText}" isn't a valid code.`)

    // Amount and type.
    let signed: number | null
    try {
      if (mapping.amount !== undefined) {
        signed = parseAmountCell(cell(row, 'amount'), currency)
      } else {
        const out = parseAmountCell(cell(row, 'debit'), currency)
        const inn = parseAmountCell(cell(row, 'credit'), currency)
        signed = out === null && inn === null ? null : (inn ?? 0) - Math.abs(out ?? 0)
      }
    } catch {
      return fail('The amount is not a number.')
    }
    if (signed === null || signed === 0) return fail('The amount is empty or zero.')

    const typeText = norm(cell(row, 'type'))
    let type: ImportedTx['type']
    if (typeText) {
      const known = TYPE_WORDS[typeText]
      if (!known) return fail(`Type "${cell(row, 'type')}" should be expense, income or transfer.`)
      type = known
    } else if (mapping.amount === undefined) {
      type = signed > 0 ? 'income' : 'expense'
    } else {
      const positive = signed > 0
      type = positive === (ctx.positiveIs === 'income') ? 'income' : 'expense'
    }
    const amount = Math.abs(signed)
    if (!Number.isSafeInteger(amount)) return fail('The amount is too large.')

    // Transfer target.
    let toAccountId: string | undefined
    if (type === 'transfer') {
      const target = accountsByName.get(norm(cell(row, 'toAccount')))
      if (!target) return fail('Transfers need a "To account" that matches one of your accounts.')
      if (target.id === account.id) return fail('A transfer needs two different accounts.')
      const problem = currencyProblem(currency, target.currency, ctx.baseCurrency)
      if (problem) return fail(problem.replace('This account', `${target.name}`))
      toAccountId = target.id
    }
    const problem = currencyProblem(currency, account.currency, ctx.baseCurrency)
    if (problem) return fail(problem.replace('This account', account.name))

    // Base amount.
    let fxRateToBase = 1
    let baseAmount = amount
    if (currency !== ctx.baseCurrency) {
      const rateText = cell(row, 'fxRate')
      const baseText = cell(row, 'baseAmount')
      try {
        if (rateText && isValidRate(rateText)) {
          fxRateToBase = Number(rateText)
          baseAmount = convertMinor(amount, currency, ctx.baseCurrency, rateText)
        } else if (baseText) {
          baseAmount = Math.abs(parseAmountCell(baseText, ctx.baseCurrency) ?? 0)
          const scale = 10 ** (currencyDigits(currency) - currencyDigits(ctx.baseCurrency))
          fxRateToBase = (baseAmount / amount) * scale
        } else {
          return fail(`${currency} rows need an FX rate or base amount column.`)
        }
      } catch {
        return fail('The FX rate or base amount is not a number.')
      }
      if (baseAmount <= 0) return fail('The amount in the base currency rounds to zero.')
    }

    // Category.
    let categoryId: string | undefined
    const categoryText = cell(row, 'category')
    if (categoryText && type !== 'transfer') {
      const match = matchCategory(categoryText, type, ctx.categories)
      if (match) categoryId = match.id
      else warnings.push(`Category "${categoryText}" not found; left uncategorised.`)
    }

    const payee = type === 'transfer' ? '' : cell(row, 'payee').slice(0, PAYEE_MAX)
    const note = cell(row, 'note').slice(0, NOTE_MAX)
    const tags = [
      ...new Set(cell(row, 'tags').split(/[;,|]/).map(normalizeTag).filter(Boolean)),
    ].slice(0, TAGS_MAX)

    return {
      line,
      ok: true,
      warnings,
      tx: {
        day,
        date: importInstant(day, time),
        type,
        amount,
        currency,
        fxRateToBase,
        baseAmount,
        accountId: account.id,
        ...(toAccountId ? { toAccountId } : {}),
        ...(categoryId ? { categoryId } : {}),
        payee,
        note,
        tags,
      },
    }
  })
}

// ---------------------------------------------------------------------------------------------
// Duplicates

export interface ExistingTx {
  date: string
  amount: number
  currency: string
  payee: string
}

function dupKey(day: string, amount: number, currency: string, payee: string): string {
  return `${day}|${currency}|${amount}|${norm(payee)}`
}

/**
 * Indexes of `candidates` that look like an existing transaction: same calendar day, amount
 * (and currency) and payee (ignoring case and spaces). Each existing transaction matches at
 * most one candidate, so two identical coffees on one day only count as duplicates if two
 * already exist.
 */
export function findDuplicates(
  candidates: readonly Pick<ImportedTx, 'day' | 'amount' | 'currency' | 'payee'>[],
  existing: readonly ExistingTx[],
  timeZone?: string,
): Set<number> {
  const available = new Map<string, number>()
  for (const tx of existing) {
    const key = dupKey(calendarDate(tx.date, timeZone), tx.amount, tx.currency, tx.payee)
    available.set(key, (available.get(key) ?? 0) + 1)
  }
  const duplicates = new Set<number>()
  candidates.forEach((c, index) => {
    const key = dupKey(c.day, c.amount, c.currency, c.payee)
    const left = available.get(key) ?? 0
    if (left > 0) {
      duplicates.add(index)
      available.set(key, left - 1)
    }
  })
  return duplicates
}

/** The calendar span (end exclusive) covering the given days, for loading existing entries. */
export function daySpan(days: readonly string[]): { start: string; end: string } | null {
  if (days.length === 0) return null
  const sorted = [...days].sort()
  const last = sorted[sorted.length - 1] as string
  const [y, m, d] = last.split('-').map(Number) as [number, number, number]
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
  return { start: sorted[0] as string, end: next }
}
