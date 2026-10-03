import type { Stored } from '@/services/firestore'
import type { Period } from './period'
import type { BudgetDoc } from './schemas'

export type Budget = Stored<BudgetDoc>

/** A threshold notification that should exist but doesn't yet. */
export interface PlannedAlert {
  /** Notification doc id, also the dedupe key: budgetId + period + threshold. */
  id: string
  budgetId: string
  budgetName: string
  threshold: number
  period: Period
  spent: number
  limit: number
}
