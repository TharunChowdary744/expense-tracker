import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useUid } from '@/features/auth/hooks'
import { useToast } from '@/features/ui/hooks'
import { useDeleteBudgetMutation } from '../api'
import type { Budget } from '../types'

interface Props {
  budget: Budget | null
  onOpenChange: (open: boolean) => void
  onDeleted?: () => void
}

export function DeleteBudgetDialog({ budget, onOpenChange, onDeleted }: Props) {
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
    onOpenChange(false)
    onDeleted?.()
  }

  return (
    <Dialog open={budget !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle className="text-lg font-semibold">Delete {budget?.name}?</DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          The budget is removed. Your transactions and past alerts are kept.
        </DialogDescription>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={busy} onClick={() => void confirm()}>
            {busy ? 'Deleting…' : 'Delete budget'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
