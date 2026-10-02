import { Plus, Tags } from 'lucide-react'
import { useId, useState } from 'react'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ListStates'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useUid } from '@/features/auth/hooks'
import { useToast } from '@/features/ui/hooks'
import {
  useGetCategoriesQuery,
  useReorderCategoriesMutation,
  useSetCategoriesArchivedMutation,
} from '../api'
import { CategoryDialog, type CategoryDialogState } from '../components/CategoryDialog'
import { CategoryTree } from '../components/CategoryTree'
import { CATEGORY_KINDS, type CategoryKind } from '../schemas'
import type { Category } from '../types'
import { buildCategoryTree, reorderSiblings } from '../utils'

const KIND_LABELS: Record<CategoryKind, string> = { expense: 'Expense', income: 'Income' }

export function CategoriesPage() {
  const uid = useUid()
  const toast = useToast()
  const switchId = useId()
  const { data: categories, error, isLoading, refetch } = useGetCategoriesQuery(uid)
  const [reorder] = useReorderCategoriesMutation()
  const [setArchived] = useSetCategoriesArchivedMutation()
  const [kind, setKind] = useState<CategoryKind>('expense')
  const [showArchived, setShowArchived] = useState(false)
  const [dialog, setDialog] = useState<CategoryDialogState>({ mode: 'closed' })

  const all = categories ?? []
  const archivedCount = all.filter((c) => c.kind === kind && c.archived).length

  async function move(siblings: Category[], activeId: string, overId: string) {
    // Reorder within the full sibling group (archived included) so hidden items keep their
    // place relative to the visible ones.
    const full = fullSiblings(siblings)
    const updates = reorderSiblings(full, activeId, overId)
    if (updates.length === 0) return
    const result = await reorder({ uid, updates })
    if ('error' in result) {
      toast({
        title: 'Could not save the new order',
        description: String(result.error),
        variant: 'error',
      })
    }
  }

  function fullSiblings(visible: Category[]): Category[] {
    const first = visible[0]
    if (!first) return []
    const tree = buildCategoryTree(all, first.kind, { includeArchived: true })
    const parent = tree.find((n) => n.children.some((c) => c.id === first.id))
    return parent ? parent.children : tree.map((n) => n.category)
  }

  async function toggleArchived(category: Category) {
    const archived = !category.archived
    // Archiving a parent archives its subcategories; restoring a subcategory restores its parent.
    const ids = archived
      ? [
          category.id,
          ...all.filter((c) => c.parentId === category.id && !c.archived).map((c) => c.id),
        ]
      : [
          category.id,
          ...all.filter((c) => c.id === category.parentId && c.archived).map((c) => c.id),
        ]
    const result = await setArchived({ uid, ids, archived })
    if ('error' in result) {
      toast({
        title: 'Could not update the category',
        description: String(result.error),
        variant: 'error',
      })
      return
    }
    const extra = ids.length - 1
    toast({
      title: archived ? `${category.name} archived` : `${category.name} restored`,
      description:
        extra > 0
          ? archived
            ? `Its ${extra} subcategor${extra === 1 ? 'y was' : 'ies were'} archived too.`
            : 'Its parent category was restored too.'
          : archived
            ? 'It is hidden from pickers but kept for past transactions.'
            : undefined,
      variant: 'success',
    })
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Categories</h1>
        <Button onClick={() => setDialog({ mode: 'create', kind })}>
          <Plus aria-hidden />
          Add {kind} category
        </Button>
      </div>

      <Tabs value={kind} onValueChange={(v) => setKind(v as CategoryKind)} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList aria-label="Category type">
            {CATEGORY_KINDS.map((k) => (
              <TabsTrigger key={k} value={k}>
                {KIND_LABELS[k]}
              </TabsTrigger>
            ))}
          </TabsList>
          {archivedCount > 0 && (
            <div className="flex items-center gap-2">
              <Switch id={switchId} checked={showArchived} onCheckedChange={setShowArchived} />
              <label htmlFor={switchId} className="text-sm">
                Show archived ({archivedCount})
              </label>
            </div>
          )}
        </div>

        {CATEGORY_KINDS.map((k) => {
          const nodes = buildCategoryTree(all, k, { includeArchived: showArchived })
          return (
            <TabsContent key={k} value={k}>
              {isLoading ? (
                <ListSkeleton label="Loading categories" />
              ) : error ? (
                <ErrorState
                  title="Could not load your categories"
                  message={String(error)}
                  onRetry={() => void refetch()}
                />
              ) : nodes.length === 0 ? (
                <EmptyState
                  icon={Tags}
                  title={`No ${k} categories yet`}
                  description="Categories group your transactions in budgets and reports."
                  action={
                    <Button onClick={() => setDialog({ mode: 'create', kind: k })}>
                      <Plus aria-hidden />
                      Add {k} category
                    </Button>
                  }
                />
              ) : (
                <>
                  <p className="mb-3 text-sm text-muted-foreground">
                    Drag the grip, or focus it and press Space, to reorder.
                  </p>
                  <CategoryTree
                    kind={k}
                    nodes={nodes}
                    onMove={(siblings, activeId, overId) => void move(siblings, activeId, overId)}
                    onEdit={(category) => setDialog({ mode: 'edit', category })}
                    onToggleArchived={(category) => void toggleArchived(category)}
                    onAddSubcategory={(parent) =>
                      setDialog({ mode: 'create', kind: k, parentId: parent.id })
                    }
                  />
                </>
              )}
            </TabsContent>
          )
        })}
      </Tabs>

      <CategoryDialog
        state={dialog}
        categories={all}
        onClose={() => setDialog({ mode: 'closed' })}
      />
    </section>
  )
}
