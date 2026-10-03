import { createSelector, createSlice, type PayloadAction } from '@reduxjs/toolkit'

/**
 * Deletes wait UNDO_MS before they are written, so they can be undone. Rows of a scheduled
 * delete are hidden at once; once committed their ids stay hidden for the session so they
 * can't flash back before the list refetches.
 */
export interface TransactionsUiState {
  pendingDeletes: Record<string, string[]>
  deletedIds: string[]
}

const initialState: TransactionsUiState = { pendingDeletes: {}, deletedIds: [] }

const transactionsSlice = createSlice({
  name: 'transactions',
  initialState,
  reducers: {
    deleteScheduled(state, action: PayloadAction<{ batchId: string; ids: string[] }>) {
      state.pendingDeletes[action.payload.batchId] = action.payload.ids
    },
    deleteUndone(state, action: PayloadAction<string>) {
      delete state.pendingDeletes[action.payload]
    },
    deleteCommitted(state, action: PayloadAction<string>) {
      const ids = state.pendingDeletes[action.payload]
      if (!ids) return
      delete state.pendingDeletes[action.payload]
      state.deletedIds = [...new Set([...state.deletedIds, ...ids])]
    },
  },
})

export const { deleteScheduled, deleteUndone, deleteCommitted } = transactionsSlice.actions
export const transactionsReducer = transactionsSlice.reducer

/** Ids that should not be shown: scheduled for deletion or already deleted. */
export const selectHiddenIds = createSelector(
  [
    (state: { transactions: TransactionsUiState }) => state.transactions.pendingDeletes,
    (state: { transactions: TransactionsUiState }) => state.transactions.deletedIds,
  ],
  (pending, deleted): ReadonlySet<string> =>
    new Set([...Object.values(pending).flat(), ...deleted]),
)
