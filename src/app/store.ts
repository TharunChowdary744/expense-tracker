import { configureStore } from '@reduxjs/toolkit'
import { setupListeners } from '@reduxjs/toolkit/query'
import { uiReducer } from '@/features/ui/slice'
import { api } from '@/services/api'

export function createStore() {
  const store = configureStore({
    reducer: {
      [api.reducerPath]: api.reducer,
      ui: uiReducer,
    },
    middleware: (getDefault) => getDefault().concat(api.middleware),
  })
  setupListeners(store.dispatch)
  return store
}

export const store = createStore()

export type AppStore = ReturnType<typeof createStore>
export type RootState = ReturnType<AppStore['getState']>
export type AppDispatch = AppStore['dispatch']
