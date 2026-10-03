import { createSelector, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { JobView } from './types'

/** Mirror of the receipt queue for the UI. The queue (queue.ts) owns the jobs and files. */
export interface ReceiptsState {
  jobs: Record<string, JobView>
  online: boolean
}

const initialState: ReceiptsState = {
  jobs: {},
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
}

const receiptsSlice = createSlice({
  name: 'receipts',
  initialState,
  reducers: {
    jobUpserted(state, action: PayloadAction<JobView>) {
      state.jobs[action.payload.id] = action.payload
    },
    jobProgressed(state, action: PayloadAction<{ id: string; progress: number }>) {
      const job = state.jobs[action.payload.id]
      if (job) job.progress = action.payload.progress
    },
    jobRemoved(state, action: PayloadAction<string>) {
      delete state.jobs[action.payload]
    },
    jobsCleared(state) {
      state.jobs = {}
    },
    connectivityChanged(state, action: PayloadAction<boolean>) {
      state.online = action.payload
    },
  },
})

export const { jobUpserted, jobProgressed, jobRemoved, jobsCleared, connectivityChanged } =
  receiptsSlice.actions
export const receiptsReducer = receiptsSlice.reducer

type State = { receipts: ReceiptsState }

/** Upload jobs for one parent (by Storage prefix), oldest first. */
export const selectUploadsFor = createSelector(
  [(s: State) => s.receipts.jobs, (_s: State, prefix: string) => prefix],
  (jobs, prefix) =>
    Object.values(jobs)
      .filter((j) => j.op === 'upload' && j.prefix === prefix)
      .sort((a, b) => a.createdAt - b.createdAt),
)

/** Uploads not yet finished, across everything (for a global indicator). */
export const selectActiveUploadCount = (s: State) =>
  Object.values(s.receipts.jobs).filter(
    (j) => j.op === 'upload' && (j.status === 'queued' || j.status === 'uploading'),
  ).length
