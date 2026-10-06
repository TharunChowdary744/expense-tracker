import type { Account } from '@/features/accounts/types'
import type { GroupExpenseFormInput } from '@/features/groups/schemas'
import type { Group, GroupExpense } from '@/features/groups/types'
import { calendarDate } from '@/utils/dates'
import { fromMinor } from '@/utils/money'

/** The group expense form's starting values (a copy of the web form's defaults). */
export function expenseDefaults(
  group: Pick<Group, 'currency'>,
  memberIds: readonly string[],
  uid: string,
  expense: GroupExpense | undefined,
  accounts: readonly Account[],
): GroupExpenseFormInput {
  const cur = group.currency
  const all = (value: string) => Object.fromEntries(memberIds.map((id) => [id, value]))
  const personalAccount =
    accounts.find((a) => !a.archived && a.currency === cur) ?? accounts.find((a) => !a.archived)
  const base: GroupExpenseFormInput = {
    description: '',
    amount: '',
    date: calendarDate(new Date()),
    categoryId: '',
    paidMode: 'single',
    payer: memberIds.includes(uid) ? uid : (memberIds[0] ?? ''),
    paid: all(''),
    splitType: 'equal',
    included: Object.fromEntries(memberIds.map((id) => [id, true])),
    exact: all(''),
    percent: all(''),
    shares: all('1'),
    note: '',
    addToPersonal: false,
    personalAccountId: personalAccount?.id ?? '',
    personalCategoryId: '',
    fxRate: '',
  }
  if (!expense) return base
  const payers = Object.keys(expense.paidBy)
  const input = (map: Record<string, string>, toText: (v: number) => string) => ({
    ...map,
    ...Object.fromEntries(Object.entries(expense.splitInput).map(([id, v]) => [id, toText(v)])),
  })
  return {
    ...base,
    description: expense.description,
    amount: fromMinor(expense.amount, cur),
    date: calendarDate(expense.date),
    categoryId: expense.categoryId ?? '',
    paidMode: payers.length === 1 ? 'single' : 'multiple',
    payer: payers.length === 1 ? (payers[0] as string) : base.payer,
    paid: {
      ...base.paid,
      ...Object.fromEntries(
        Object.entries(expense.paidBy).map(([id, v]) => [id, fromMinor(v, cur)]),
      ),
    },
    splitType: expense.splitType,
    included:
      expense.splitType === 'equal'
        ? Object.fromEntries(memberIds.map((id) => [id, (expense.splitInput[id] ?? 0) > 0]))
        : base.included,
    exact: expense.splitType === 'exact' ? input(all(''), (v) => fromMinor(v, cur)) : base.exact,
    percent: expense.splitType === 'percent' ? input(all(''), String) : base.percent,
    shares: expense.splitType === 'shares' ? input(all('0'), String) : base.shares,
    note: expense.note,
  }
}
