import { Plus } from 'lucide-react'
import { useLocation } from 'react-router'
import { useAppDispatch } from '@/app/hooks'
import { Button } from '@/components/ui/button'
import { dialogOpened } from '@/features/ui/slice'
import { quickAddDialog } from './quickAdd'

/**
 * Floating quick-add: opens the transaction sheet (also on the "n" key on desktop), or the
 * add-expense sheet on a group's page.
 */
export function QuickAddButton() {
  const dispatch = useAppDispatch()
  const { pathname } = useLocation()
  const dialog = quickAddDialog(pathname)
  return (
    <Button
      size="icon"
      aria-label={dialog.kind === 'group-expense' ? 'Add group expense' : 'Quick add'}
      aria-keyshortcuts="n"
      title={dialog.kind === 'group-expense' ? 'Add group expense (N)' : 'Add transaction (N)'}
      onClick={() => dispatch(dialogOpened(dialog))}
      className="fixed right-4 bottom-20 z-40 size-14 rounded-full shadow-lg md:right-8 md:bottom-8 [&_svg:not([class*='size-'])]:size-6"
    >
      <Plus />
    </Button>
  )
}
