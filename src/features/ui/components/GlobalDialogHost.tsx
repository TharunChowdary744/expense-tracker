import { lazy, Suspense, useEffect } from 'react'
import { useLocation } from 'react-router'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { dialogClosed } from '../slice'

const TransactionSheet = lazy(async () => ({
  default: (await import('@/features/transactions/components/TransactionSheet')).TransactionSheet,
}))

/** Renders whichever global dialog is described in the ui slice. */
export function GlobalDialogHost() {
  const dialog = useAppSelector((s) => s.ui.dialog)
  const dispatch = useAppDispatch()
  const { pathname } = useLocation()
  // The group page renders its own add-expense sheet; drop the request if it's left behind.
  const strandedGroupExpense =
    dialog?.kind === 'group-expense' && pathname !== `/groups/${dialog.groupId}`
  useEffect(() => {
    if (strandedGroupExpense) dispatch(dialogClosed())
  }, [strandedGroupExpense, dispatch])
  const isTransaction =
    dialog?.kind === 'quick-add' ||
    dialog?.kind === 'edit-transaction' ||
    dialog?.kind === 'edit-recurring'

  return (
    <>
      {/* The transaction form is a separate chunk, loaded when the sheet first opens. */}
      {isTransaction && (
        <Suspense fallback={null}>
          <TransactionSheet />
        </Suspense>
      )}
      <Dialog
        open={dialog?.kind === 'confirm'}
        onOpenChange={(open) => {
          if (!open) dispatch(dialogClosed())
        }}
      >
        <DialogContent>
          <DialogTitle className="text-lg font-semibold">
            {dialog?.kind === 'confirm' ? dialog.title : ''}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {dialog?.kind === 'confirm' ? dialog.description : undefined}
          </DialogDescription>
          <div className="flex justify-end pt-2">
            <DialogClose asChild>
              <Button variant="secondary">Close</Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
