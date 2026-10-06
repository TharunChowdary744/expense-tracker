import { useMemo, useState } from 'react'
import { useAppSelector } from '@/app/hooks'
import { useGetAccountsQuery } from '@/features/accounts/api'
import { useGetCategoriesQuery } from '@/features/categories/api'
import {
  newGroupExpenseId,
  useDeleteGroupExpenseMutation,
  useSaveGroupExpenseMutation,
} from '@/features/groups/api'
import { useActor } from '@/features/groups/hooks/useActor'
import type { GroupExpenseFormValues } from '@/features/groups/schemas'
import { orderMembers } from '@/features/groups/split'
import type { Group, GroupExpense } from '@/features/groups/types'
import { activity, orderedMemberIds } from '@/features/groups/utils'
import { actorName } from '@/features/groups/writes'
import { receiptsEnabled } from '@/features/receipts/flag'
import { commitDrafts } from '@/features/receipts/queue'
import { selectUploadsFor } from '@/features/receipts/slice'
import type { ReceiptParent } from '@/features/receipts/types'
import { receiptPrefix } from '@/features/receipts/utils'
import { useUserSettings } from '@/features/settings/hooks'
import { useToast } from '@/features/ui/hooks'
import { deviceTimeZone, zonedTime } from '@/utils/dates'
import { formatMoney } from '@/utils/money'
import { ConfirmDialog } from '@m/components/ui/Dialog'
import { ListSkeleton } from '@m/components/ui/ListStates'
import { Sheet } from '@m/components/ui/Sheet'
import { AttachmentsField } from '../receipts/AttachmentsField'
import { ExpenseForm } from './ExpenseForm'

/** Expenses are dated at local noon, safely inside the chosen day for nearby timezones. */
const EXPENSE_HOUR = 12

export function ExpenseSheet({
  group,
  open,
  onClose,
  expense,
}: {
  group: Group
  open: boolean
  onClose: () => void
  /** Edit this expense; omit to add one. */
  expense?: GroupExpense
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={expense ? 'Edit expense' : 'Add expense'}
      subtitle={`${group.emoji} ${group.name} · amounts in ${group.currency}`}
    >
      {open ? (
        <ExpenseSheetBody
          key={expense?.id ?? 'new'}
          group={group}
          expense={expense}
          onDone={onClose}
        />
      ) : null}
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
  const [deleteExpense, { isLoading: deleting }] = useDeleteGroupExpenseMutation()
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  // A new expense gets its id now, so receipts can upload while the form is filled in.
  const [expenseId] = useState(() => expense?.id ?? newGroupExpenseId(group.id))
  const parent = useMemo<ReceiptParent>(
    () => ({ kind: 'group', uid: actor.uid, groupId: group.id, id: expenseId }),
    [actor.uid, group.id, expenseId],
  )
  const prefix = receiptPrefix(parent)
  const uploads = useAppSelector((s) => selectUploadsFor(s, prefix))
  const [preparingFiles, setPreparingFiles] = useState(false)

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
    if (!expense && preparingFiles) return 'Wait for the receipts to finish compressing.'
    const currencies = Object.fromEntries((accounts.data ?? []).map((a) => [a.id, a.currency]))
    const result = await saveExpense({
      actor,
      group: { id: group.id, name: group.name },
      ...(expense
        ? { expenseId: expense.id }
        : {
            newExpenseId: expenseId,
            attachments: uploads
              .filter((u) => u.draft && u.status !== 'failed')
              .map((u) => u.attachment),
          }),
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
    if (!expense) commitDrafts(prefix)
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

  async function onDelete() {
    if (!expense) return
    const result = await deleteExpense({
      actor,
      groupId: group.id,
      expenseId: expense.id,
      attachments: expense.attachments,
      summary: activity.expenseDeleted(name, expense.description, money(expense.amount)),
    })
    setConfirmingDelete(false)
    if ('error' in result) {
      toast({
        title: 'Could not delete the expense',
        description: String(result.error),
        variant: 'error',
      })
      return
    }
    toast({ title: `${expense.description} deleted`, variant: 'success' })
    onDone()
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
        attachments={
          receiptsEnabled ? (
            <AttachmentsField
              parent={parent}
              mode={expense ? 'saved' : 'draft'}
              onBusyChange={setPreparingFiles}
            />
          ) : undefined
        }
        onSubmit={onSubmit}
        onDelete={expense ? () => setConfirmingDelete(true) : undefined}
        onCancel={onDone}
      />
      <ConfirmDialog
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        title={`Delete ${expense?.description ?? 'this expense'}?`}
        description={`Balances update for everyone in the group${receiptsEnabled ? ', and its receipts are deleted' : ''}. A personal expense you linked to it stays in your transactions.`}
        confirmLabel={deleting ? 'Deleting…' : 'Delete expense'}
        destructive
        loading={deleting}
        onConfirm={() => void onDelete()}
      />
    </>
  )
}
