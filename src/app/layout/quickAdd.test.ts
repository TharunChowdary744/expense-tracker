import { describe, expect, it } from 'vitest'
import { quickAddDialog } from './quickAdd'

describe('quickAddDialog', () => {
  it('adds a group expense on a group page, a transaction elsewhere', () => {
    expect(quickAddDialog('/groups/g1')).toEqual({ kind: 'group-expense', groupId: 'g1' })
    expect(quickAddDialog('/groups/g1/')).toEqual({ kind: 'group-expense', groupId: 'g1' })
    expect(quickAddDialog('/groups')).toEqual({ kind: 'quick-add' })
    expect(quickAddDialog('/')).toEqual({ kind: 'quick-add' })
  })
})
