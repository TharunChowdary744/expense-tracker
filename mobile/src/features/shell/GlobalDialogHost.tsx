import { usePathname } from 'expo-router'
import { useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { dialogClosed } from '@/features/ui/slice'
import { Button } from '@m/components/ui/Button'
import { Dialog } from '@m/components/ui/Dialog'
import { TransactionSheet } from '@m/features/transactions/TransactionSheet'

/** Renders whichever global dialog is described in the ui slice. */
export function GlobalDialogHost() {
  const dialog = useAppSelector((s) => s.ui.dialog)
  const dispatch = useAppDispatch()
  const pathname = usePathname()
  // The group screen renders its own add-expense sheet; drop the request if it's left behind.
  const stranded = dialog?.kind === 'group-expense' && pathname !== `/group/${dialog.groupId}`
  useEffect(() => {
    if (stranded) dispatch(dialogClosed())
  }, [stranded, dispatch])
  const close = () => dispatch(dialogClosed())

  return (
    <>
      <TransactionSheet />
      <Dialog
        open={dialog?.kind === 'confirm'}
        onClose={close}
        title={dialog?.kind === 'confirm' ? dialog.title : ''}
        description={dialog?.kind === 'confirm' ? dialog.description : undefined}
        actions={<Button title="Close" variant="secondary" onPress={close} />}
      />
    </>
  )
}
