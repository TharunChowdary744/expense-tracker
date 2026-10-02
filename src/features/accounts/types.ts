import type { Stored } from '@/services/firestore'
import type { AccountDoc } from './schemas'

export type Account = Stored<AccountDoc>

export interface NetWorth {
  /** Sum of active accounts held in the base currency, in its minor units. */
  base: number
  baseCurrency: string
  /** Active accounts in other currencies, totalled per currency (not converted yet). */
  other: { currency: string; amount: number }[]
}
