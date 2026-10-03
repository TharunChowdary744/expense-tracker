import type { Stored } from '@/services/firestore'
import type { TransactionDoc } from './schemas'

export type Transaction = Stored<TransactionDoc>

/** The transaction fields that move account balances. */
export type BalanceTransaction = Pick<
  TransactionDoc,
  'type' | 'amount' | 'baseAmount' | 'currency' | 'accountId' | 'toAccountId'
>

export interface DayGroup {
  /** yyyy-MM-dd in the user's timezone. */
  key: string
  items: Transaction[]
  /** Income minus expenses in base-currency minor units; transfers don't count. */
  net: number
}
