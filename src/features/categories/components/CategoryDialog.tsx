import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useUid } from '@/features/auth/hooks'
import { useToast } from '@/features/ui/hooks'
import { useCreateCategoryMutation, useUpdateCategoryMutation } from '../api'
import type { CategoryFormValues, CategoryKind } from '../schemas'
import type { Category } from '../types'
import { buildCategoryTree, nextOrder, parentCandidates } from '../utils'
import { CategoryForm } from './CategoryForm'

export type CategoryDialogState =
  | { mode: 'closed' }
  | { mode: 'create'; kind: CategoryKind; parentId?: string }
  | { mode: 'edit'; category: Category }

interface Props {
  state: CategoryDialogState
  categories: readonly Category[]
  onClose: () => void
}

/** The siblings a category would join under `parentId` ('' = top level), archived included. */
function siblingsOf(categories: readonly Category[], kind: CategoryKind, parentId: string) {
  const tree = buildCategoryTree(categories, kind, { includeArchived: true })
  if (!parentId) return tree.map((n) => n.category)
  return tree.find((n) => n.category.id === parentId)?.children ?? []
}

export function CategoryDialog({ state, categories, onClose }: Props) {
  const uid = useUid()
  const toast = useToast()
  const [createCategory] = useCreateCategoryMutation()
  const [updateCategory] = useUpdateCategoryMutation()

  const open = state.mode !== 'closed'
  const kind =
    state.mode === 'edit' ? state.category.kind : state.mode === 'create' ? state.kind : 'expense'
  const editing = state.mode === 'edit' ? state.category : undefined
  const hasChildren = editing ? categories.some((c) => c.parentId === editing.id) : false
  const parents = parentCandidates(categories, kind, editing?.id)
  // Keep an archived current parent selectable so editing does not silently move the category.
  const currentParent = categories.find((c) => c.id === editing?.parentId)
  if (currentParent && !parents.some((p) => p.id === currentParent.id)) parents.push(currentParent)

  async function onSubmit(values: CategoryFormValues): Promise<string | null> {
    let result
    if (editing) {
      const parentChanged = (editing.parentId ?? '') !== values.parentId
      result = await updateCategory({
        uid,
        id: editing.id,
        values,
        order: parentChanged ? nextOrder(siblingsOf(categories, kind, values.parentId)) : undefined,
      })
    } else {
      result = await createCategory({
        uid,
        kind,
        order: nextOrder(siblingsOf(categories, kind, values.parentId)),
        values,
      })
    }
    if ('error' in result) return String(result.error)
    toast({ title: editing ? 'Category saved' : 'Category created', variant: 'success' })
    onClose()
    return null
  }

  const title = editing
    ? 'Edit category'
    : state.mode === 'create' && state.parentId
      ? 'New subcategory'
      : `New ${kind} category`

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          {kind === 'expense' ? 'Expense' : 'Income'} categories group your transactions in budgets
          and reports.
        </DialogDescription>
        {open && (
          <CategoryForm
            key={editing?.id ?? 'new'}
            category={editing}
            parents={parents}
            hasChildren={hasChildren}
            defaultParentId={state.mode === 'create' ? (state.parentId ?? '') : ''}
            onSubmit={onSubmit}
            onCancel={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
