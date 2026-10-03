import { Plus } from 'lucide-react'
import { useAppDispatch } from '@/app/hooks'
import { Button } from '@/components/ui/button'
import { dialogOpened } from '@/features/ui/slice'

/** Floating quick-add: opens the transaction sheet (also on the "n" key on desktop). */
export function QuickAddButton() {
  const dispatch = useAppDispatch()
  return (
    <Button
      size="icon"
      aria-label="Quick add"
      aria-keyshortcuts="n"
      title="Add transaction (N)"
      onClick={() => dispatch(dialogOpened({ kind: 'quick-add' }))}
      className="fixed right-4 bottom-20 z-40 size-14 rounded-full shadow-lg md:right-8 md:bottom-8 [&_svg:not([class*='size-'])]:size-6"
    >
      <Plus />
    </Button>
  )
}
