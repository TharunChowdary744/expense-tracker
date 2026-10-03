import { configureStore } from '@reduxjs/toolkit'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { uiReducer } from '@/features/ui/slice'
import { selectHiddenIds, transactionsReducer } from './slice'
import type { Transaction } from './types'

const initiate = vi.fn()
vi.mock('./api', () => ({
  transactionsApi: {
    endpoints: { deleteTransactions: { initiate: (arg: unknown) => initiate(arg) } },
  },
}))

const { scheduleDelete, UNDO_MS } = await import('./deleteFlow')

const tx = { id: 't1' } as Transaction

function makeStore() {
  return configureStore({
    reducer: { transactions: transactionsReducer, ui: uiReducer },
    middleware: (getDefault) => getDefault({ serializableCheck: false }),
  })
}

describe('scheduleDelete', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    initiate.mockReset()
    initiate.mockReturnValue(() => Promise.resolve({ data: null }))
  })
  afterEach(() => vi.useRealTimers())

  it('hides at once and deletes after the undo window', async () => {
    const store = makeStore()
    store.dispatch(scheduleDelete({ uid: 'u1', transactions: [tx], currencies: {} }))
    expect(selectHiddenIds(store.getState()).has('t1')).toBe(true)
    const toast = store.getState().ui.toasts[0]
    expect(toast?.action?.label).toBe('Undo')

    await vi.advanceTimersByTimeAsync(UNDO_MS)
    expect(initiate).toHaveBeenCalledWith({ uid: 'u1', transactions: [tx], currencies: {} })
    expect(store.getState().transactions.deletedIds).toEqual(['t1'])
    expect(store.getState().ui.toasts).toEqual([])
  })

  it('does nothing after Undo', async () => {
    const store = makeStore()
    store.dispatch(scheduleDelete({ uid: 'u1', transactions: [tx], currencies: {} }))
    const undo = store.getState().ui.toasts[0]?.action?.onAction
    store.dispatch(undo as { type: string })
    expect(selectHiddenIds(store.getState()).size).toBe(0)
    await vi.advanceTimersByTimeAsync(UNDO_MS)
    expect(initiate).not.toHaveBeenCalled()
  })

  it('brings the rows back when the delete fails', async () => {
    initiate.mockReturnValue(() => Promise.resolve({ error: 'Offline' }))
    const store = makeStore()
    store.dispatch(scheduleDelete({ uid: 'u1', transactions: [tx], currencies: {} }))
    await vi.advanceTimersByTimeAsync(UNDO_MS)
    expect(selectHiddenIds(store.getState()).size).toBe(0)
    expect(store.getState().ui.toasts.at(-1)).toMatchObject({
      title: 'Could not delete',
      variant: 'error',
    })
  })
})
