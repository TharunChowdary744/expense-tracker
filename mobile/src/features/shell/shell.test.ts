import { mobilePath } from './links'
import { quickAddDialog, showsQuickAdd } from './quickAdd'

describe('mobilePath', () => {
  it('maps web budget and group pages to the mobile detail routes', () => {
    expect(mobilePath('/budgets/b1')).toBe('/budget/b1')
    expect(mobilePath('/groups/g1?tab=settle')).toBe('/group/g1?tab=settle')
  })

  it('keeps other in-app paths and their query', () => {
    expect(mobilePath('/transactions?range=this-month&type=expense')).toBe(
      '/transactions?range=this-month&type=expense',
    )
    expect(mobilePath('/budgets')).toBe('/budgets')
  })

  it('ignores links that are not in-app paths', () => {
    expect(mobilePath('https://example.com')).toBeNull()
    expect(mobilePath('')).toBeNull()
  })
})

describe('quick add', () => {
  it('adds a group expense on a group page, a transaction elsewhere', () => {
    expect(quickAddDialog('/group/g1')).toEqual({ kind: 'group-expense', groupId: 'g1' })
    expect(quickAddDialog('/transactions')).toEqual({ kind: 'quick-add' })
    expect(quickAddDialog('/groups')).toEqual({ kind: 'quick-add' })
  })

  it('is hidden on forms and settings screens', () => {
    expect(showsQuickAdd('/')).toBe(true)
    expect(showsQuickAdd('/budget/b1')).toBe(true)
    for (const path of [
      '/profile',
      '/settings',
      '/notifications',
      '/data',
      '/data/import',
      '/join/abc',
    ]) {
      expect(showsQuickAdd(path)).toBe(false)
    }
  })
})
