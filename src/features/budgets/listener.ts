import { createListenerMiddleware, isAnyOf } from '@reduxjs/toolkit'
import { recurringApi } from '@/features/recurring/api'
import { transactionsApi } from '@/features/transactions/api'
import { toastAdded } from '@/features/ui/slice'
import { budgetsApi } from './api'
import { highestPerBudget } from './alerts'

const { createTransaction, updateTransaction, deleteTransactions, recategorizeTransactions } =
  transactionsApi.endpoints

const { runRecurring, confirmOccurrence } = recurringApi.endpoints

const transactionWritten = isAnyOf(
  createTransaction.matchFulfilled,
  updateTransaction.matchFulfilled,
  deleteTransactions.matchFulfilled,
  recategorizeTransactions.matchFulfilled,
  runRecurring.matchFulfilled,
  confirmOccurrence.matchFulfilled,
)

/** The transaction dates a write touched, so backdated entries are checked in their period. */
export function affectedDates(action: {
  payload?: unknown
  meta: { arg: { endpointName: string; originalArgs: unknown } }
}): string[] {
  const { endpointName, originalArgs } = action.meta.arg
  const args = originalArgs as Record<string, unknown>
  const payload = (action.payload ?? {}) as Record<string, unknown>
  switch (endpointName) {
    case 'runRecurring':
      return payload.postedDates as string[]
    case 'confirmOccurrence':
      return [payload.dateIso as string]
    case 'createTransaction':
      return [args.dateIso as string]
    case 'updateTransaction':
      return [(args.before as { date: string }).date, args.dateIso as string]
    case 'deleteTransactions':
      return (args.transactions as { date: string }[]).map((t) => t.date)
    default:
      return []
  }
}

/**
 * Budget threshold alerts. After every successful transaction write this runs the alert check
 * (one at a time, so two quick writes can't both create the same alert) and shows a toast for
 * each budget that newly crossed a threshold.
 */
export const budgetAlerts = createListenerMiddleware()

let queue: Promise<void> = Promise.resolve()

budgetAlerts.startListening({
  predicate: (action): boolean => transactionWritten(action),
  effect: async (action, { dispatch }) => {
    if (!transactionWritten(action)) return
    // A catch-up run that found nothing to post wrote no transactions.
    if (runRecurring.matchFulfilled(action) && action.payload.posted === 0) return
    const uid = (action.meta.arg.originalArgs as { uid: string }).uid
    const dates = affectedDates(action)
    queue = queue
      .then(async () => {
        const result = await dispatch(
          budgetsApi.endpoints.checkBudgetAlerts.initiate(
            { uid, affectedDates: dates },
            { track: false },
          ),
        )
        if (!('data' in result) || !result.data) return
        for (const alert of highestPerBudget(result.data)) {
          dispatch(
            toastAdded({
              title: alert.title,
              description: alert.body,
              variant: alert.threshold >= 100 ? 'error' : 'default',
            }),
          )
        }
      })
      .catch((error: unknown) => console.warn('[budgets] alert check failed', error))
    await queue
  },
})
