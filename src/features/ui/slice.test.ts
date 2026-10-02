import { describe, expect, it } from 'vitest'
import { dialogClosed, dialogOpened, toastAdded, toastDismissed, uiReducer } from './slice'

describe('ui slice', () => {
  it('adds a toast with an id and default variant, then dismisses it', () => {
    let state = uiReducer(undefined, toastAdded({ title: 'Saved' }))
    expect(state.toasts).toHaveLength(1)
    const toast = state.toasts[0]!
    expect(toast).toMatchObject({ title: 'Saved', variant: 'default' })
    expect(toast.id).toBeTruthy()

    state = uiReducer(state, toastDismissed(toast.id))
    expect(state.toasts).toEqual([])
  })

  it('opens and closes the global dialog', () => {
    let state = uiReducer(undefined, dialogOpened({ kind: 'quick-add' }))
    expect(state.dialog).toEqual({ kind: 'quick-add' })
    state = uiReducer(state, dialogClosed())
    expect(state.dialog).toBeNull()
  })
})
