import type { Stored } from '@/services/firestore'
import type { Occurrence } from './engine'
import type { RecurringDoc } from './schemas'

export type RecurringRule = Stored<RecurringDoc>

export type RuleStatus = 'active' | 'paused' | 'ended'

/** One occurrence of a rule that hasn't been posted or skipped yet. */
export interface PendingOccurrence {
  rule: RecurringRule
  occurrence: Occurrence
  /** The transaction doc id it posts to: `${ruleId}_${occurrenceKey}`. */
  txId: string
  /** Days from today in the rule's timezone (negative when overdue). */
  daysAway: number
}
