import type { Stored } from '@/services/firestore'
import type { ActivityDoc, GroupDoc, GroupExpenseDoc, InviteDoc, SettlementDoc } from './schemas'

export type Group = Stored<GroupDoc>
export type GroupExpense = Stored<GroupExpenseDoc>
export type Settlement = Stored<SettlementDoc>
export type Activity = Stored<ActivityDoc>
export type Invite = Stored<InviteDoc>
