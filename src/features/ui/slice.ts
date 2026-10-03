import { createSlice, nanoid, type PayloadAction } from '@reduxjs/toolkit'
import type { GlobalDialog, Toast } from './types'

export interface UiState {
  toasts: Toast[]
  dialog: GlobalDialog | null
}

const initialState: UiState = { toasts: [], dialog: null }

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    toastAdded: {
      reducer(state, action: PayloadAction<Toast>) {
        state.toasts.push(action.payload)
      },
      prepare(toast: Omit<Toast, 'id' | 'variant'> & { id?: string; variant?: Toast['variant'] }) {
        return {
          payload: { ...toast, id: toast.id ?? nanoid(), variant: toast.variant ?? 'default' },
        }
      },
    },
    toastDismissed(state, action: PayloadAction<string>) {
      state.toasts = state.toasts.filter((t) => t.id !== action.payload)
    },
    dialogOpened(state, action: PayloadAction<GlobalDialog>) {
      state.dialog = action.payload
    },
    dialogClosed(state) {
      state.dialog = null
    },
  },
})

export const { toastAdded, toastDismissed, dialogOpened, dialogClosed } = uiSlice.actions
export const uiReducer = uiSlice.reducer
