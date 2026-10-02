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

/** Renders whichever global dialog is described in the ui slice. */
export function GlobalDialogHost() {
  const dialog = useAppSelector((s) => s.ui.dialog)
  const dispatch = useAppDispatch()

  const title =
    dialog?.kind === 'quick-add' ? 'Quick add' : dialog?.kind === 'confirm' ? dialog.title : ''
  const description =
    dialog?.kind === 'quick-add'
      ? 'Adding expenses, income and transfers arrives in a later phase.'
      : dialog?.kind === 'confirm'
        ? dialog.description
        : undefined

  return (
    <Dialog
      open={dialog !== null}
      onOpenChange={(open) => {
        if (!open) dispatch(dialogClosed())
      }}
    >
      <DialogContent>
        <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          {description}
        </DialogDescription>
        <div className="flex justify-end pt-2">
          <DialogClose asChild>
            <Button variant="secondary">Close</Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  )
}
