import { format, isValid, parse } from 'date-fns'
import type { Account } from '@/features/accounts/types'
import type { Category } from '@/features/categories/types'
import { TRANSACTION_TYPE_LABELS } from './schemas'
import type { BalanceTransaction, DayGroup, Transaction } from './types'

/**
 * How much a transaction moves each account it touches, in that account's own currency.
 *
 * A side uses `amount` when the account holds the transaction currency, otherwise
 * `baseAmount` (the form only allows that when the account holds the base currency). So a USD
 * expense paid from an INR account (base INR) takes the converted INR amount off it.
 */
export function balanceEffects(
  tx: BalanceTransaction,
  currencyOf: (accountId: string) => string | undefined,
): Map<string, number> {
  const effects = new Map<string, number>()
  const add = (accountId: string, sign: 1 | -1) => {
    const currency = currencyOf(accountId)
    const value = currency === undefined || currency === tx.currency ? tx.amount : tx.baseAmount
    effects.set(accountId, (effects.get(accountId) ?? 0) + sign * value)
  }
  if (tx.type === 'income') add(tx.accountId, 1)
  else if (tx.type === 'expense') add(tx.accountId, -1)
  else {
    add(tx.accountId, -1)
    if (tx.toAccountId) add(tx.toAccountId, 1)
  }
  return effects
}

/**
 * The change to each account's cached `txTotal` when `before` becomes `after` (either may be
 * null for a create or delete). Accounts whose total doesn't change are left out.
 */
export function accountDeltas(
  before: readonly BalanceTransaction[],
  after: readonly BalanceTransaction[],
  currencyOf: (accountId: string) => string | undefined,
): Map<string, number> {
  const deltas = new Map<string, number>()
  const apply = (tx: BalanceTransaction, sign: 1 | -1) => {
    for (const [id, value] of balanceEffects(tx, currencyOf)) {
      deltas.set(id, (deltas.get(id) ?? 0) + sign * value)
    }
  }
  before.forEach((tx) => apply(tx, -1))
  after.forEach((tx) => apply(tx, 1))
  for (const [id, value] of deltas) if (value === 0) deltas.delete(id)
  return deltas
}

/** Signed base-currency amount for daily totals: income +, expense −, transfer 0. */
export function signedBaseAmount(tx: Pick<Transaction, 'type' | 'baseAmount'>): number {
  if (tx.type === 'income') return tx.baseAmount
  if (tx.type === 'expense') return -tx.baseAmount
  return 0
}

/** yyyy-MM-dd for an ISO timestamp, in the local timezone. */
export function dayKey(iso: string): string {
  return format(new Date(iso), 'yyyy-MM-dd')
}

/** Groups consecutive transactions (already sorted by date) into days with net totals. */
export function groupByDay(items: readonly Transaction[]): DayGroup[] {
  const groups: DayGroup[] = []
  const byKey = new Map<string, DayGroup>()
  for (const tx of items) {
    const key = dayKey(tx.date)
    let group = byKey.get(key)
    if (!group) {
      group = { key, items: [], net: 0 }
      byKey.set(key, group)
      groups.push(group)
    }
    group.items.push(tx)
    group.net += signedBaseAmount(tx)
  }
  return groups
}

/** Today's date as yyyy-MM-dd in the local timezone. */
export function todayInput(now = new Date()): string {
  return format(now, 'yyyy-MM-dd')
}

/** Parses a yyyy-MM-dd input value as a local date, or null. */
export function parseDateInput(value: string): Date | null {
  const date = parse(value, 'yyyy-MM-dd', new Date(0))
  return isValid(date) ? date : null
}

/**
 * The stored instant for a picked day. It keeps a time of day so entries within a day stay in
 * the order they were made: the time from `keepTimeOf` (the existing value when editing) or
 * the current time for new entries.
 */
export function dateInputToIso(value: string, keepTimeOf?: string, now = new Date()): string {
  const day = parseDateInput(value)
  if (!day) throw new RangeError(`Not a valid date: ${value}`)
  const time = keepTimeOf ? new Date(keepTimeOf) : now
  day.setHours(time.getHours(), time.getMinutes(), time.getSeconds(), time.getMilliseconds())
  return day.toISOString()
}

/** Applies a keypad key to the amount text. */
export function applyKey(value: string, key: string): string {
  if (key === 'back') return value.slice(0, -1)
  if (key === 'clear') return ''
  const isOp = ['+', '−', '×', '÷'].includes(key)
  const last = value.slice(-1)
  if (isOp) {
    if (value === '') return value
    // Replace a trailing operator instead of stacking two.
    return ['+', '−', '×', '÷'].includes(last) ? `${value.slice(0, -1)}${key}` : `${value}${key}`
  }
  if (key === '.') {
    const current = value.split(/[+−×÷]/).pop() ?? ''
    if (current.includes('.')) return value
    return `${value}${current === '' ? '0' : ''}.`
  }
  return `${value}${key}`
}

/** Row title and subtitle: payee (or category / type) and category · account. */
export function describeTransaction(
  tx: Transaction,
  accounts: ReadonlyMap<string, Account>,
  categories: ReadonlyMap<string, Category>,
): { title: string; subtitle: string } {
  const account = accounts.get(tx.accountId)?.name ?? 'Unknown account'
  if (tx.type === 'transfer') {
    const to = (tx.toAccountId && accounts.get(tx.toAccountId)?.name) ?? 'Unknown account'
    return { title: tx.note || 'Transfer', subtitle: `${account} → ${to}` }
  }
  const category = tx.categoryId ? categories.get(tx.categoryId) : undefined
  const parent = category?.parentId ? categories.get(category.parentId) : undefined
  const categoryName = category
    ? parent
      ? `${parent.name} › ${category.name}`
      : category.name
    : 'Uncategorised'
  return {
    title: tx.payee || category?.name || TRANSACTION_TYPE_LABELS[tx.type],
    subtitle: `${categoryName} · ${account}`,
  }
}
