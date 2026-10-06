import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  Pencil,
  Plus,
  Tags,
} from 'lucide-react-native'
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useUid } from '@/features/auth/hooks'
import {
  useCreateCategoryMutation,
  useGetCategoriesQuery,
  useReorderCategoriesMutation,
  useSetCategoriesArchivedMutation,
  useUpdateCategoryMutation,
} from '@/features/categories/api'
import {
  CATEGORY_KINDS,
  type CategoryFormValues,
  type CategoryKind,
} from '@/features/categories/schemas'
import type { Category } from '@/features/categories/types'
import {
  buildCategoryTree,
  nextOrder,
  parentCandidates,
  reorderSiblings,
} from '@/features/categories/utils'
import { useToast } from '@/features/ui/hooks'
import { ColoredIcon } from '@m/components/ColoredIcon'
import { PendingBadge } from '@m/components/PendingBadge'
import { Screen } from '@m/components/Screen'
import { Button } from '@m/components/ui/Button'
import { Card } from '@m/components/ui/Card'
import { Segmented, SwitchRow } from '@m/components/ui/Controls'
import { EmptyState, QueryStates } from '@m/components/ui/ListStates'
import { ActionMenu } from '@m/components/ui/Menu'
import { Sheet } from '@m/components/ui/Sheet'
import { Text } from '@m/components/ui/Text'
import { CategoryForm } from './CategoryForm'

const KIND_LABELS: Record<CategoryKind, string> = { expense: 'Expense', income: 'Income' }

type DialogState =
  | { mode: 'closed' }
  | { mode: 'create'; kind: CategoryKind; parentId?: string }
  | { mode: 'edit'; category: Category }

function siblingsOf(categories: readonly Category[], kind: CategoryKind, parentId: string) {
  const tree = buildCategoryTree(categories, kind, { includeArchived: true })
  if (!parentId) return tree.map((n) => n.category)
  return tree.find((n) => n.category.id === parentId)?.children ?? []
}

export function CategoriesScreen() {
  const uid = useUid()
  const toast = useToast()
  const { data: categories, error, isLoading, refetch } = useGetCategoriesQuery(uid)
  const [reorder] = useReorderCategoriesMutation()
  const [setArchived] = useSetCategoriesArchivedMutation()
  const [createCategory] = useCreateCategoryMutation()
  const [updateCategory] = useUpdateCategoryMutation()
  const [kind, setKind] = useState<CategoryKind>('expense')
  const [showArchived, setShowArchived] = useState(false)
  const [dialog, setDialog] = useState<DialogState>({ mode: 'closed' })

  const all = categories ?? []
  const archivedCount = all.filter((c) => c.kind === kind && c.archived).length
  const nodes = buildCategoryTree(all, kind, { includeArchived: showArchived })

  function fullSiblings(category: Category): Category[] {
    return siblingsOf(all, category.kind, category.parentId ?? '')
  }

  async function move(category: Category, visible: Category[], delta: -1 | 1) {
    const index = visible.findIndex((c) => c.id === category.id)
    const over = visible[index + delta]
    if (!over) return
    const updates = reorderSiblings(fullSiblings(category), category.id, over.id)
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

  async function toggleArchived(category: Category) {
    const archived = !category.archived
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

  // Dialog state
  const editing = dialog.mode === 'edit' ? dialog.category : undefined
  const dialogKind =
    dialog.mode === 'edit' ? dialog.category.kind : dialog.mode === 'create' ? dialog.kind : kind
  const hasChildren = editing ? all.some((c) => c.parentId === editing.id) : false
  const parents = parentCandidates(all, dialogKind, editing?.id)
  const currentParent = all.find((c) => c.id === editing?.parentId)
  if (currentParent && !parents.some((p) => p.id === currentParent.id)) parents.push(currentParent)

  async function onSubmit(values: CategoryFormValues): Promise<string | null> {
    let result
    if (editing) {
      const parentChanged = (editing.parentId ?? '') !== values.parentId
      result = await updateCategory({
        uid,
        id: editing.id,
        values,
        order: parentChanged ? nextOrder(siblingsOf(all, dialogKind, values.parentId)) : undefined,
      })
    } else {
      result = await createCategory({
        uid,
        kind: dialogKind,
        order: nextOrder(siblingsOf(all, dialogKind, values.parentId)),
        values,
      })
    }
    if ('error' in result) return String(result.error)
    toast({ title: editing ? 'Category saved' : 'Category created', variant: 'success' })
    setDialog({ mode: 'closed' })
    return null
  }

  function row(category: Category, siblings: Category[], depth: 0 | 1) {
    const index = siblings.findIndex((c) => c.id === category.id)
    return (
      <Card
        key={category.id}
        style={[styles.row, depth === 1 && styles.child, category.archived && { opacity: 0.7 }]}
      >
        <ColoredIcon icon={category.icon} color={category.color} size={depth ? 30 : 36} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text weight={depth ? undefined : '600'} numberOfLines={1}>
            {category.name}
          </Text>
          {category.archived || category.pending ? (
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              {category.archived ? (
                <Text variant="caption" tone="muted">
                  Archived
                </Text>
              ) : null}
              {category.pending ? <PendingBadge /> : null}
            </View>
          ) : null}
        </View>
        <ActionMenu
          label={`Actions for ${category.name}`}
          title={category.name}
          actions={[
            { label: 'Edit', icon: Pencil, onPress: () => setDialog({ mode: 'edit', category }) },
            ...(depth === 0 && !category.archived
              ? [
                  {
                    label: 'Add subcategory',
                    icon: Plus,
                    onPress: () =>
                      setDialog({ mode: 'create', kind: category.kind, parentId: category.id }),
                  },
                ]
              : []),
            {
              label: 'Move up',
              icon: ArrowUp,
              disabled: index <= 0,
              onPress: () => void move(category, siblings, -1),
            },
            {
              label: 'Move down',
              icon: ArrowDown,
              disabled: index === siblings.length - 1,
              onPress: () => void move(category, siblings, 1),
            },
            {
              label: category.archived ? 'Restore' : 'Archive',
              icon: category.archived ? ArchiveRestore : Archive,
              onPress: () => void toggleArchived(category),
            },
          ]}
        />
      </Card>
    )
  }

  const topLevel = nodes.map((n) => n.category)

  return (
    <Screen>
      <Segmented
        label="Category type"
        value={kind}
        onChange={setKind}
        options={CATEGORY_KINDS.map((k) => ({ value: k, label: KIND_LABELS[k] }))}
      />
      <Button
        title={`Add ${kind} category`}
        icon={Plus}
        onPress={() => setDialog({ mode: 'create', kind })}
      />
      {archivedCount > 0 ? (
        <SwitchRow
          label={`Show archived (${archivedCount})`}
          value={showArchived}
          onChange={setShowArchived}
        />
      ) : null}
      <QueryStates
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        isEmpty={nodes.length === 0}
        empty={
          <EmptyState
            icon={Tags}
            title={`No ${kind} categories yet`}
            description="Categories group your transactions in budgets and reports."
            action={
              <Button
                title={`Add ${kind} category`}
                icon={Plus}
                onPress={() => setDialog({ mode: 'create', kind })}
              />
            }
          />
        }
      >
        <Text variant="small" tone="muted">
          Use a category’s menu to move it up or down.
        </Text>
        <View style={{ gap: 6 }}>
          {nodes.map((node) => (
            <View key={node.category.id} style={{ gap: 6 }}>
              {row(node.category, topLevel, 0)}
              {node.children.map((child) => row(child, node.children, 1))}
            </View>
          ))}
        </View>
      </QueryStates>

      <Sheet
        open={dialog.mode !== 'closed'}
        onClose={() => setDialog({ mode: 'closed' })}
        title={
          editing
            ? 'Edit category'
            : dialog.mode === 'create' && dialog.parentId
              ? 'New subcategory'
              : `New ${dialogKind} category`
        }
        subtitle={`${KIND_LABELS[dialogKind]} categories group your transactions in budgets and reports.`}
      >
        {dialog.mode !== 'closed' ? (
          <CategoryForm
            key={editing?.id ?? 'new'}
            category={editing}
            parents={parents}
            hasChildren={hasChildren}
            defaultParentId={dialog.mode === 'create' ? (dialog.parentId ?? '') : ''}
            onSubmit={onSubmit}
            onCancel={() => setDialog({ mode: 'closed' })}
          />
        ) : null}
      </Sheet>
    </Screen>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10 },
  child: { marginLeft: 28 },
})
