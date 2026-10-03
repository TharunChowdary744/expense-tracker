import { SortableList } from '@/components/SortableList'
import type { CategoryKind } from '../schemas'
import type { Category, CategoryNode } from '../types'
import { CategoryRow } from './CategoryRow'

interface Props {
  kind: CategoryKind
  nodes: CategoryNode[]
  /** Reorders within one sibling group: move `activeId` to where `overId` is. */
  onMove: (siblings: Category[], activeId: string, overId: string) => void
  onEdit: (category: Category) => void
  onToggleArchived: (category: Category) => void
  onAddSubcategory: (parent: Category) => void
}

/** Top-level categories, each with its sortable subcategories nested beneath it. */
export function CategoryTree({
  kind,
  nodes,
  onMove,
  onEdit,
  onToggleArchived,
  onAddSubcategory,
}: Props) {
  const topLevel = nodes.map((n) => n.category)
  const childrenOf = new Map(nodes.map((n) => [n.category.id, n.children]))

  const rowProps = (category: Category, siblings: Category[]) => {
    const index = siblings.findIndex((c) => c.id === category.id)
    const prev = siblings[index - 1]
    const next = siblings[index + 1]
    return {
      category,
      canMoveUp: prev !== undefined,
      canMoveDown: next !== undefined,
      onMoveUp: () => prev && onMove(siblings, category.id, prev.id),
      onMoveDown: () => next && onMove(siblings, category.id, next.id),
      onEdit: () => onEdit(category),
      onToggleArchived: () => onToggleArchived(category),
    }
  }

  return (
    <SortableList
      items={topLevel}
      label={`${kind === 'expense' ? 'Expense' : 'Income'} categories`}
      nameOf={(c) => c.name}
      onMove={(activeId, overId) => onMove(topLevel, activeId, overId)}
      renderItem={(category, handle, isDragging) => {
        const children = childrenOf.get(category.id) ?? []
        return (
          <>
            <CategoryRow
              {...rowProps(category, topLevel)}
              handle={handle}
              isDragging={isDragging}
              onAddSubcategory={category.archived ? undefined : () => onAddSubcategory(category)}
            />
            {children.length > 0 && (
              <SortableList
                items={children}
                label={`Subcategories of ${category.name}`}
                nameOf={(c) => c.name}
                onMove={(activeId, overId) => onMove(children, activeId, overId)}
                className="mt-2 ml-6 border-l pl-3"
                renderItem={(child, childHandle, childDragging) => (
                  <CategoryRow
                    {...rowProps(child, children)}
                    handle={childHandle}
                    isDragging={childDragging}
                  />
                )}
              />
            )}
          </>
        )
      }}
    />
  )
}
