import type { GlobalDialog } from '@/features/ui/types'

const GROUP_PAGE = /^\/group\/([^/]+)\/?$/

/** What the "+" button opens: a group expense on a group's page, otherwise a transaction. */
export function quickAddDialog(pathname: string): GlobalDialog {
  const groupId = GROUP_PAGE.exec(pathname)?.[1]
  return groupId ? { kind: 'group-expense', groupId } : { kind: 'quick-add' }
}

/** Screens without the "+" button: forms and settings rather than main screens. */
const HIDDEN = [/^\/profile/, /^\/settings/, /^\/notifications/, /^\/data/, /^\/join\//]

export function showsQuickAdd(pathname: string): boolean {
  return !HIDDEN.some((re) => re.test(pathname))
}

/** Main tab screens, where the button sits above the tab bar. */
export const TAB_PATHS = ['/', '/transactions', '/budgets', '/groups', '/more']
