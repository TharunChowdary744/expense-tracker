import { Plus } from 'lucide-react'
import { useAppDispatch } from '@/app/hooks'
import { Button } from '@/components/ui/button'
import { dialogOpened } from '@/features/ui/slice'

/** Floating quick-add. Placeholder: opens a dialog until the transaction form exists. */
export function QuickAddButton() {
  const dispatch = useAppDispatch()
  return (
    <Button
      size="icon"
      aria-label="Quick add"
      onClick={() => dispatch(dialogOpened({ kind: 'quick-add' }))}
      className="fixed right-4 bottom-20 z-40 size-14 rounded-full shadow-lg md:right-8 md:bottom-8 [&_svg:not([class*='size-'])]:size-6"
    >
      <Plus />
    </Button>
  )
}
