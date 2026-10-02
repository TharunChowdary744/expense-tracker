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
      prepare(toast: Omit<Toast, 'id' | 'variant'> & { variant?: Toast['variant'] }) {
        return { payload: { id: nanoid(), variant: 'default' as const, ...toast } }
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
