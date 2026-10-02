import type { Stored } from '@/services/firestore'
import type { AccountDoc } from './schemas'

export type Account = Stored<AccountDoc>

/** The transaction fields that move an account balance (phase 3 supplies real ones). */
export interface BalanceTransaction {
  type: 'expense' | 'income' | 'transfer'
  amount: number
  accountId: string
  toAccountId?: string
}

export interface NetWorth {
  /** Sum of active accounts held in the base currency, in its minor units. */
  base: number
  baseCurrency: string
  /** Active accounts in other currencies, totalled per currency (not converted yet). */
  other: { currency: string; amount: number }[]
}
