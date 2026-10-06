import { useState } from 'react'
import { useUid } from '@/features/auth/hooks'
import {
  useCreateBudgetMutation,
  useDeleteBudgetMutation,
  useUpdateBudgetMutation,
} from '@/features/budgets/api'
import type { BudgetFormValues } from '@/features/budgets/schemas'
import type { Budget } from '@/features/budgets/types'
import type { Category } from '@/features/categories/types'
import { useUserSettings } from '@/features/settings/hooks'
import { useToast } from '@/features/ui/hooks'
import { ConfirmDialog } from '@m/components/ui/Dialog'
import { Sheet } from '@m/components/ui/Sheet'
import { BudgetForm } from './BudgetForm'

/** Create (no `budget`) or edit a budget in a sheet. */
export function BudgetSheet({
  open,
  onClose,
  budget,
  categories,
}: {
  open: boolean
  onClose: () => void
  budget?: Budget
  categories: readonly Category[]
}) {
  const uid = useUid()
  const toast = useToast()
  const { baseCurrency, weekStartsOn } = useUserSettings()
  const [createBudget] = useCreateBudgetMutation()
  const [updateBudget] = useUpdateBudgetMutation()

  async function onSubmit(values: BudgetFormValues): Promise<string | null> {
    const result = budget
      ? await updateBudget({
          uid,
          id: budget.id,
          values,
          ...(values.period === budget.period ? {} : { weekStartsOn }),
        })
      : await createBudget({ uid, values, weekStartsOn })
    if ('error' in result) return String(result.error)
    toast({ title: budget ? 'Budget saved' : 'Budget created', variant: 'success' })
    onClose()
    return null
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={budget ? 'Edit budget' : 'New budget'}
      subtitle="A spending limit for all expenses or chosen categories."
    >
      {open ? (
        <BudgetForm
          key={budget?.id ?? 'new'}
          budget={budget}
          categories={categories}
          baseCurrency={baseCurrency}
          onSubmit={onSubmit}
          onCancel={onClose}
        />
      ) : null}
    </Sheet>
  )
}

export function DeleteBudgetDialog({
  budget,
  onClose,
  onDeleted,
}: {
  budget: Budget | null
  onClose: () => void
  onDeleted?: () => void
}) {
  const uid = useUid()
  const toast = useToast()
  const [deleteBudget] = useDeleteBudgetMutation()
  const [busy, setBusy] = useState(false)

  async function confirm() {
    if (!budget) return
    setBusy(true)
    const result = await deleteBudget({ uid, id: budget.id })
    setBusy(false)
    if ('error' in result) {
      toast({
        title: 'Could not delete the budget',
        description: String(result.error),
        variant: 'error',
      })
      return
    }
    toast({ title: `${budget.name} deleted`, variant: 'success' })
    onClose()
    onDeleted?.()
  }

  return (
    <ConfirmDialog
      open={budget !== null}
      onClose={onClose}
      onConfirm={() => void confirm()}
      title={`Delete ${budget?.name ?? 'budget'}?`}
      description="The budget is removed. Your transactions and past alerts are kept."
      confirmLabel={busy ? 'Deleting…' : 'Delete budget'}
      destructive
      loading={busy}
    />
  )
}
