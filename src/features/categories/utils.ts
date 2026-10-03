import type { CategoryKind } from './schemas'
import type { Category, CategoryNode, CategoryOption } from './types'

/** Sibling order: `order`, then name, then id so the result is always stable. */
export function compareCategories(a: Category, b: Category): number {
  return (
    a.order - b.order ||
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) ||
    a.id.localeCompare(b.id)
  )
}

/**
 * Groups one kind's categories into top-level nodes with their subcategories, each level in
 * sibling order. Subcategories whose parent is missing (or of another kind) become top-level.
 * Archived categories are left out unless `includeArchived`; hiding a parent hides its children.
 */
export function buildCategoryTree(
  categories: readonly Category[],
  kind: CategoryKind,
  { includeArchived = false }: { includeArchived?: boolean } = {},
): CategoryNode[] {
  const ofKind = categories.filter((c) => c.kind === kind)
  const byId = new Map(ofKind.map((c) => [c.id, c]))
  const isTopLevel = (c: Category) => !c.parentId || !byId.has(c.parentId)

  return ofKind
    .filter((c) => isTopLevel(c) && (includeArchived || !c.archived))
    .sort(compareCategories)
    .map((category) => ({
      category,
      children: ofKind
        .filter(
          (c) => !isTopLevel(c) && c.parentId === category.id && (includeArchived || !c.archived),
        )
        .sort(compareCategories),
    }))
}

/**
 * Options for category pickers: active categories only, parents followed by their
 * subcategories. Archived ones stay in Firestore (history keeps them) but cannot be picked.
 */
export function categoryPickerOptions(
  categories: readonly Category[],
  kind: CategoryKind,
): CategoryOption[] {
  return buildCategoryTree(categories, kind).flatMap(({ category, children }) => [
    { id: category.id, label: category.name, depth: 0 as const },
    ...children.map((child) => ({
      id: child.id,
      label: `${category.name} › ${child.name}`,
      depth: 1 as const,
    })),
  ])
}

/** Categories that can be the parent of `self`: active, top-level, same kind, not itself. */
export function parentCandidates(
  categories: readonly Category[],
  kind: CategoryKind,
  selfId?: string,
): Category[] {
  return buildCategoryTree(categories, kind)
    .map((node) => node.category)
    .filter((c) => c.id !== selfId)
}

/** The next `order` for a new item at the end of a sibling group. */
export function nextOrder(siblings: readonly Pick<Category, 'order'>[]): number {
  return siblings.reduce((max, c) => Math.max(max, c.order + 1), 0)
}

/** Moves the item at `from` to `to`, returning a new array. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items]
  if (from < 0 || from >= next.length || to < 0 || to >= next.length) return next
  const [item] = next.splice(from, 1) as [T]
  next.splice(to, 0, item)
  return next
}

/** The `order` updates needed so `orderedIds` are numbered 0..n-1; unchanged ones are skipped. */
export function orderUpdates(
  orderedIds: readonly string[],
  current: ReadonlyMap<string, number>,
): { id: string; order: number }[] {
  return orderedIds
    .map((id, order) => ({ id, order }))
    .filter(({ id, order }) => current.get(id) !== order)
}

/**
 * Moves `activeId` to where `overId` is within one sibling group (already in display order)
 * and returns the `order` writes that persist it. Empty when nothing changes.
 */
export function reorderSiblings(
  siblings: readonly Category[],
  activeId: string,
  overId: string,
): { id: string; order: number }[] {
  const ids = siblings.map((c) => c.id)
  const from = ids.indexOf(activeId)
  const to = ids.indexOf(overId)
  if (from === -1 || to === -1 || from === to) return []
  return orderUpdates(moveItem(ids, from, to), new Map(siblings.map((c) => [c.id, c.order])))
}
