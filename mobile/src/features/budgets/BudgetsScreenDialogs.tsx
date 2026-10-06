import type { Budget } from '@/features/budgets/types'
import type { Category } from '@/features/categories/types'
import { BudgetSheet, DeleteBudgetDialog } from './BudgetDialogs'

export type DialogState = { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; budget: Budget }

/** The create/edit sheet and the delete dialog of a budgets screen. */
export function BudgetDeleteHost({
  dialog,
  onCloseDialog,
  deleting,
  onCloseDelete,
  onDeleted,
  categories,
}: {
  dialog: DialogState
  onCloseDialog: () => void
  deleting: Budget | null
  onCloseDelete: () => void
  onDeleted?: () => void
  categories: readonly Category[]
}) {
  return (
    <>
      <BudgetSheet
        open={dialog.mode !== 'closed'}
        onClose={onCloseDialog}
        budget={dialog.mode === 'edit' ? dialog.budget : undefined}
        categories={categories}
      />
      <DeleteBudgetDialog budget={deleting} onClose={onCloseDelete} onDeleted={onDeleted} />
    </>
  )
}
