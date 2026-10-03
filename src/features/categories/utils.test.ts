import { describe, expect, it } from 'vitest'
import type { Category } from './types'
import {
  buildCategoryTree,
  categoryPickerOptions,
  moveItem,
  nextOrder,
  orderUpdates,
  parentCandidates,
  reorderSiblings,
} from './utils'

const cat = (id: string, over: Partial<Category> = {}): Category => ({
  id,
  name: id,
  kind: 'expense',
  icon: 'tag',
  color: '#64748b',
  parentId: null,
  order: 0,
  archived: false,
  createdAt: '2026-10-02T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
  createdBy: 'u1',
  pending: false,
  ...over,
})

const data = [
  cat('Food', { order: 1 }),
  cat('Rent', { order: 0 }),
  cat('Groceries', { parentId: 'Food', order: 1 }),
  cat('Dining', { parentId: 'Food', order: 0 }),
  cat('Old', { order: 2, archived: true }),
  cat('OldChild', { parentId: 'Old', archived: true }),
  cat('Snacks', { parentId: 'Food', order: 2, archived: true }),
  cat('Orphan', { parentId: 'gone', order: 3 }),
  cat('Salary', { kind: 'income' }),
]

describe('buildCategoryTree', () => {
  it('nests subcategories in order and hides archived ones by default', () => {
    const tree = buildCategoryTree(data, 'expense')
    expect(tree.map((n) => n.category.id)).toEqual(['Rent', 'Food', 'Orphan'])
    expect(tree[1]?.children.map((c) => c.id)).toEqual(['Dining', 'Groceries'])
  })

  it('includes archived categories when asked', () => {
    const tree = buildCategoryTree(data, 'expense', { includeArchived: true })
    expect(tree.map((n) => n.category.id)).toEqual(['Rent', 'Food', 'Old', 'Orphan'])
    expect(tree[1]?.children.map((c) => c.id)).toEqual(['Dining', 'Groceries', 'Snacks'])
    expect(tree[2]?.children.map((c) => c.id)).toEqual(['OldChild'])
  })

  it('keeps kinds apart and breaks order ties by name', () => {
    expect(buildCategoryTree(data, 'income').map((n) => n.category.id)).toEqual(['Salary'])
    const ties = buildCategoryTree([cat('b'), cat('a'), cat('A2')], 'expense')
    expect(ties.map((n) => n.category.id)).toEqual(['a', 'A2', 'b'])
  })
})

describe('categoryPickerOptions', () => {
  it('lists active categories with subcategories under their parent', () => {
    expect(categoryPickerOptions(data, 'expense')).toEqual([
      { id: 'Rent', label: 'Rent', depth: 0 },
      { id: 'Food', label: 'Food', depth: 0 },
      { id: 'Dining', label: 'Food › Dining', depth: 1 },
      { id: 'Groceries', label: 'Food › Groceries', depth: 1 },
      { id: 'Orphan', label: 'Orphan', depth: 0 },
    ])
  })
})

describe('parentCandidates', () => {
  it('offers active top-level categories of the kind, except itself', () => {
    expect(parentCandidates(data, 'expense', 'Food').map((c) => c.id)).toEqual(['Rent', 'Orphan'])
    expect(parentCandidates(data, 'income').map((c) => c.id)).toEqual(['Salary'])
  })
})

describe('ordering helpers', () => {
  it('nextOrder goes after the largest order', () => {
    expect(nextOrder([])).toBe(0)
    expect(nextOrder([{ order: 0 }, { order: 4 }, { order: 2 }])).toBe(5)
  })

  it('moveItem moves within bounds and ignores invalid indexes', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
    expect(moveItem(['a', 'b'], 0, 5)).toEqual(['a', 'b'])
    expect(moveItem(['a', 'b'], -1, 0)).toEqual(['a', 'b'])
  })

  it('orderUpdates only writes changed positions', () => {
    const current = new Map([
      ['a', 0],
      ['b', 1],
      ['c', 2],
    ])
    expect(orderUpdates(['a', 'c', 'b'], current)).toEqual([
      { id: 'c', order: 1 },
      { id: 'b', order: 2 },
    ])
  })

  it('reorderSiblings moves an item onto another and renumbers', () => {
    const siblings = buildCategoryTree(data, 'expense', { includeArchived: true }).map(
      (n) => n.category,
    )
    // Rent(0) Food(1) Old(2) Orphan(3): move Orphan onto Food.
    expect(reorderSiblings(siblings, 'Orphan', 'Food')).toEqual([
      { id: 'Orphan', order: 1 },
      { id: 'Food', order: 2 },
      { id: 'Old', order: 3 },
    ])
    expect(reorderSiblings(siblings, 'Food', 'Food')).toEqual([])
    expect(reorderSiblings(siblings, 'Food', 'missing')).toEqual([])
  })
})
