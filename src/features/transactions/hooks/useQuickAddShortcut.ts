import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { quickAddDialog } from '@/app/layout/quickAdd'
import { dialogOpened } from '@/features/ui/slice'

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]') !== null
  )
}

/**
 * Pressing "n" (with no modifier, outside text fields and dialogs) opens quick-add, or the
 * add-expense sheet on a group's page.
 */
export function useQuickAddShortcut() {
  const dispatch = useAppDispatch()
  const { pathname } = useLocation()
  const dialogOpen = useAppSelector((s) => s.ui.dialog !== null)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'n' && e.key !== 'N') return
      if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return
      if (dialogOpen || isTypingTarget(e.target)) return
      // Any other open dialog or menu (Radix marks them with role) also blocks the shortcut.
      if (document.querySelector('[role="dialog"], [role="menu"], [role="alertdialog"]')) return
      e.preventDefault()
      dispatch(dialogOpened(quickAddDialog(pathname)))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dispatch, dialogOpen, pathname])
}
