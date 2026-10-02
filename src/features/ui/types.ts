export type ToastVariant = 'default' | 'success' | 'error'

export interface Toast {
  id: string
  title: string
  description?: string
  variant: ToastVariant
}

/** Global dialogs are described by serialisable data and rendered by <GlobalDialogHost />. */
export type GlobalDialog =
  { kind: 'quick-add' } | { kind: 'confirm'; title: string; description?: string }
