import type { RecurringRule } from '@/features/recurring/types'
import type { Transaction } from '@/features/transactions/types'

export type ToastVariant = 'default' | 'success' | 'error'

export interface Toast {
  id: string
  title: string
  description?: string
  variant: ToastVariant
  /** An optional button; clicking it dispatches `onAction` (a plain, serialisable action). */
  action?: { label: string; altText: string; onAction: { type: string; payload?: unknown } }
}

/** Global dialogs are described by serialisable data and rendered by <GlobalDialogHost />. */
export type GlobalDialog =
  | { kind: 'quick-add'; recurring?: boolean }
  | { kind: 'edit-recurring'; rule: RecurringRule }
  | { kind: 'edit-transaction'; transaction: Transaction; duplicate?: boolean }
  | { kind: 'confirm'; title: string; description?: string }
