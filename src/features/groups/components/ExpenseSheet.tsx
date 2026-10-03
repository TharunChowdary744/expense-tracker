import { useMemo, useState } from 'react'
import { ListSkeleton } from '@/components/ListStates'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { useGetAccountsQuery } from '@/features/accounts/api'
import { useGetCategoriesQuery } from '@/features/categories/api'
import { useUserSettings } from '@/features/settings/hooks'
import { useToast } from '@/features/ui/hooks'
import { deviceTimeZone, zonedTime } from '@/utils/dates'
import { formatMoney } from '@/utils/money'
import { useDeleteGroupExpenseMutation, useSaveGroupExpenseMutation } from '../api'
import { useActor } from '../hooks/useActor'
import type { GroupExpenseFormValues } from '../schemas'
import { orderMembers } from '../split'
import type { Group, GroupExpense } from '../types'
import { activity, orderedMemberIds } from '../utils'
import { actorName } from '../writes'
import { ConfirmDialog } from './ConfirmDialog'
import { ExpenseForm } from './ExpenseForm'

interface Props {
  group: Group
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Edit this expense; omit to add one. */
  expense?: GroupExpense
}

/** Expenses are dated at local noon, safely inside the chosen day for nearby timezones. */
const EXPENSE_HOUR = 12

export function ExpenseSheet({ group, open, onOpenChange, expense }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent aria-describedby="group-expense-description">
        <SheetTitle className="pr-8 text-lg font-semibold">
          {expense ? 'Edit expense' : 'Add expense'}
        </SheetTitle>
        <SheetDescription
          id="group-expense-description"
          className="mb-4 text-sm text-muted-foreground"
        >
          {group.emoji} {group.name} · amounts in {group.currency}
        </SheetDescription>
        {open && (
          <ExpenseSheetBody
            key={expense?.id ?? 'new'}
            group={group}
            expense={expense}
            onDone={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

function ExpenseSheetBody({
  group,
  expense,
  onDone,
}: {
  group: Group
  expense?: GroupExpense
  onDone: () => void
}) {
  const actor = useActor()
  const toast = useToast()
  const { baseCurrency, locale } = useUserSettings()
  const accounts = useGetAccountsQuery(actor.uid)
  const categories = useGetCategoriesQuery(actor.uid)
  const [saveExpense] = useSaveGroupExpenseMutation()
  const [deleteExpense] = useDeleteGroupExpenseMutation()
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // Current members, plus anyone already in this expense (e.g. a former member).
  const memberIds = useMemo(() => {
    const current = orderedMemberIds(group)
    if (!expense) return current
    const involved = [
      ...Object.keys(expense.paidBy),
      ...Object.keys(expense.shares),
      ...Object.keys(expense.splitInput),
    ]
    return orderMembers([...current, ...involved], current)
  }, [group, expense])

  const money = (minor: number) => formatMoney(minor, group.currency, locale)
  const name = actorName(actor)

  async function onSubmit(values: GroupExpenseFormValues): Promise<string | null> {
    const currencies = Object.fromEntries((accounts.data ?? []).map((a) => [a.id, a.currency]))
    const result = await saveExpense({
      actor,
      group: { id: group.id, name: group.name },
      ...(expense ? { expenseId: expense.id } : {}),
      values,
      dateIso: zonedTime(values.date, deviceTimeZone(), EXPENSE_HOUR).toISOString(),
      summary: (expense ? activity.expenseEdited : activity.expenseAdded)(
        name,
        values.description,
        money(values.amount),
      ),
      accountCurrencies: currencies,
    })
    if ('error' in result) return String(result.error)
    toast({
      title: expense ? 'Expense saved' : `${values.description} added`,
      description: values.personal
        ? `Your share of ${money(values.personal.amount)} was also added to your transactions.`
        : undefined,
      variant: 'success',
    })
    onDone()
    return null
  }

  async function onDelete(): Promise<string | null> {
    if (!expense) return null
    const result = await deleteExpense({
      actor,
      groupId: group.id,
      expenseId: expense.id,
      summary: activity.expenseDeleted(name, expense.description, money(expense.amount)),
    })
    if ('error' in result) return String(result.error)
    toast({ title: `${expense.description} deleted`, variant: 'success' })
    onDone()
    return null
  }

  if (accounts.isLoading || categories.isLoading) return <ListSkeleton rows={3} />

  return (
    <>
      <ExpenseForm
        group={group}
        memberIds={memberIds}
        uid={actor.uid}
        expense={expense}
        accounts={accounts.data ?? []}
        categories={categories.data ?? []}
        baseCurrency={baseCurrency}
        locale={locale}
        onSubmit={onSubmit}
        onDelete={expense ? () => setConfirmingDelete(true) : undefined}
        onCancel={onDone}
      />
      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title={`Delete ${expense?.description ?? 'this expense'}?`}
        description="Balances update for everyone in the group. A personal expense you linked to it stays in your transactions."
        confirmLabel="Delete expense"
        busyLabel="Deleting…"
        destructive
        onConfirm={onDelete}
      />
    </>
  )
}
