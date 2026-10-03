import type { Account, NetWorth } from './types'

/**
 * Current balance = opening balance + the account's cached transaction total. `txTotal` is the
 * sum of every transaction's effect on the account (see `balanceEffects` in transactions) and
 * is changed with `increment()` in the same batch as each transaction write.
 */
export function accountBalance(account: Pick<Account, 'openingBalance' | 'txTotal'>): number {
  return account.openingBalance + account.txTotal
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
