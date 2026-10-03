import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useUid } from '@/features/auth/hooks'
import type { Category } from '@/features/categories/types'
import { useUserSettings } from '@/features/settings/hooks'
import { useToast } from '@/features/ui/hooks'
import { useCreateBudgetMutation, useUpdateBudgetMutation } from '../api'
import type { BudgetFormValues } from '../schemas'
import type { Budget } from '../types'
import { BudgetForm } from './BudgetForm'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Edit this budget; omit to create one. */
  budget?: Budget
  categories: readonly Category[]
}

export function BudgetDialog({ open, onOpenChange, budget, categories }: Props) {
  const uid = useUid()
  const toast = useToast()
  const { baseCurrency, weekStartsOn } = useUserSettings()
  const [createBudget] = useCreateBudgetMutation()
  const [updateBudget] = useUpdateBudgetMutation()

  async function onSubmit(values: BudgetFormValues): Promise<string | null> {
    const result = budget
      ? await updateBudget({ uid, id: budget.id, values })
      : await createBudget({ uid, values, weekStartsOn })
    if ('error' in result) return String(result.error)
    toast({ title: budget ? 'Budget saved' : 'Budget created', variant: 'success' })
    onOpenChange(false)
    return null
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogTitle className="text-lg font-semibold">
          {budget ? 'Edit budget' : 'New budget'}
        </DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          Set a spending limit for all expenses or for chosen categories.
        </DialogDescription>
        {open && (
          <BudgetForm
            key={budget?.id ?? 'new'}
            budget={budget}
            categories={categories}
            baseCurrency={baseCurrency}
            onSubmit={onSubmit}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
