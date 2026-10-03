import type { GlobalDialog } from '@/features/ui/types'

const GROUP_PAGE = /^\/groups\/([^/]+)\/?$/

/** What the "+" button and the "n" shortcut open: a group expense on a group's page. */
export function quickAddDialog(pathname: string): GlobalDialog {
  const groupId = GROUP_PAGE.exec(pathname)?.[1]
  return groupId ? { kind: 'group-expense', groupId } : { kind: 'quick-add' }
}
