import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

/** Progress of a running import or restore, shown by the Import & export page. */
export interface DataProgress {
  task: 'import' | 'restore'
  /** What is being written right now, e.g. "transactions". */
  step: string
  done: number
  total: number
}

export interface DataUiState {
  progress: DataProgress | null
}

const initialState: DataUiState = { progress: null }

const dataSlice = createSlice({
  name: 'data',
  initialState,
  reducers: {
    progressChanged(state, action: PayloadAction<DataProgress>) {
      state.progress = action.payload
    },
    progressCleared(state) {
      state.progress = null
    },
  },
})

export const { progressChanged, progressCleared } = dataSlice.actions
export const dataReducer = dataSlice.reducer

export const selectDataProgress = (state: { data: DataUiState }) => state.data.progress
