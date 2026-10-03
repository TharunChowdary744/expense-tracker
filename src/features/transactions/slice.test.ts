import { describe, expect, it } from 'vitest'
import {
  deleteCommitted,
  deleteScheduled,
  deleteUndone,
  selectHiddenIds,
  transactionsReducer,
} from './slice'

describe('transactions slice', () => {
  it('hides scheduled deletes, restores on undo and keeps committed ones hidden', () => {
    let state = transactionsReducer(undefined, deleteScheduled({ batchId: 'b1', ids: ['a', 'b'] }))
    state = transactionsReducer(state, deleteScheduled({ batchId: 'b2', ids: ['c'] }))
    expect([...selectHiddenIds({ transactions: state })].sort()).toEqual(['a', 'b', 'c'])

    state = transactionsReducer(state, deleteUndone('b1'))
    expect([...selectHiddenIds({ transactions: state })]).toEqual(['c'])

    state = transactionsReducer(state, deleteCommitted('b2'))
    expect(state.pendingDeletes).toEqual({})
    expect(state.deletedIds).toEqual(['c'])
    // Committing an undone batch does nothing.
    expect(transactionsReducer(state, deleteCommitted('b1'))).toBe(state)
  })
})
