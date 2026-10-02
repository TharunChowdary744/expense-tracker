import type { Account, BalanceTransaction, NetWorth } from './types'

/**
 * Current balance = opening balance + every transaction that touches the account.
 * Expenses and outgoing transfers subtract, income and incoming transfers add.
 * Until transactions exist (phase 3) callers pass none, so this is the opening balance.
 */
export function accountBalance(
  account: Pick<Account, 'id' | 'openingBalance'>,
  transactions: readonly BalanceTransaction[] = [],
): number {
  let balance = account.openingBalance
  for (const tx of transactions) {
    if (tx.type === 'income' && tx.accountId === account.id) balance += tx.amount
    else if (tx.type === 'expense' && tx.accountId === account.id) balance -= tx.amount
    else if (tx.type === 'transfer') {
      if (tx.accountId === account.id) balance -= tx.amount
      if (tx.toAccountId === account.id) balance += tx.amount
    }
  }
  return balance
}

/**
 * Net worth of the active (non-archived) accounts. Base-currency accounts are summed;
 * other currencies are totalled separately until exchange rates exist.
 */
export function netWorth(
  accounts: readonly Account[],
  balances: ReadonlyMap<string, number>,
  baseCurrency: string,
): NetWorth {
  let base = 0
  const other = new Map<string, number>()
  for (const account of accounts) {
    if (account.archived) continue
    const balance = balances.get(account.id) ?? account.openingBalance
    if (account.currency === baseCurrency) base += balance
    else other.set(account.currency, (other.get(account.currency) ?? 0) + balance)
  }
  return {
    base,
    baseCurrency,
    other: [...other.entries()]
      .map(([currency, amount]) => ({ currency, amount }))
      .sort((a, b) => a.currency.localeCompare(b.currency)),
  }
}

/** Active accounts first, then by name. */
export function compareAccounts(a: Account, b: Account): number {
  if (a.archived !== b.archived) return a.archived ? 1 : -1
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
}
