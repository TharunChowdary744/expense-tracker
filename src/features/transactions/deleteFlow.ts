import { nanoid, type ThunkAction, type UnknownAction } from '@reduxjs/toolkit'
import { toastAdded, toastDismissed } from '@/features/ui/slice'
import { transactionsApi, type AccountCurrencies } from './api'
import { deleteCommitted, deleteScheduled, deleteUndone, type TransactionsUiState } from './slice'
import type { Transaction } from './types'

/** How long a delete can be undone before it is written. */
export const UNDO_MS = 5000

type State = { transactions: TransactionsUiState }
type Thunk = ThunkAction<void, State, unknown, UnknownAction>

/** Scheduled deletes, so they can be written early when the page is closed. */
const scheduled = new Map<string, { timer: ReturnType<typeof setTimeout>; run: () => void }>()
let flushRegistered = false

function registerFlush() {
  if (flushRegistered || typeof window === 'undefined') return
  flushRegistered = true
  // Best effort: closing the tab inside the undo window still deletes.
  window.addEventListener('pagehide', () => {
    for (const { timer, run } of [...scheduled.values()]) {
      clearTimeout(timer)
      run()
    }
  })
}

/**
 * Hides the transactions now and deletes them after UNDO_MS unless the toast's Undo is
 * pressed. Balance changes are reversed in the same batch as the delete.
 */
export function scheduleDelete(args: {
  uid: string
  transactions: Transaction[]
  currencies: AccountCurrencies
}): Thunk {
  return (dispatch, getState) => {
    const { uid, transactions, currencies } = args
    if (transactions.length === 0) return
    registerFlush()
    const batchId = nanoid()
    const toastId = nanoid()
    dispatch(deleteScheduled({ batchId, ids: transactions.map((t) => t.id) }))
    dispatch(
      toastAdded({
        id: toastId,
        title:
          transactions.length === 1
            ? 'Transaction deleted'
            : `${transactions.length} transactions deleted`,
        action: { label: 'Undo', altText: 'Undo delete', onAction: deleteUndone(batchId) },
      }),
    )

    const run = () => {
      scheduled.delete(batchId)
      if (!(batchId in getState().transactions.pendingDeletes)) return
      dispatch(toastDismissed(toastId))
      void dispatch(
        transactionsApi.endpoints.deleteTransactions.initiate({ uid, transactions, currencies }),
      ).then((result) => {
        if ('error' in result) {
          dispatch(deleteUndone(batchId))
          dispatch(
            toastAdded({
              title: 'Could not delete',
              description: String(result.error),
              variant: 'error',
            }),
          )
        } else {
          dispatch(deleteCommitted(batchId))
        }
      })
    }
    scheduled.set(batchId, { timer: setTimeout(run, UNDO_MS), run })
  }
}
