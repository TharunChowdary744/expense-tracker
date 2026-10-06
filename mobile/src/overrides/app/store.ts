import { combineReducers, configureStore } from '@reduxjs/toolkit'
import { setupListeners } from '@reduxjs/toolkit/query'
import { authReducer } from '@/features/auth/slice'
import { budgetAlerts } from '@/features/budgets/listener'
import { dataReducer } from '@/features/data/slice'
import { receiptsReducer } from '@/features/receipts/slice'
import { transactionsReducer } from '@/features/transactions/slice'
import { uiReducer } from '@/features/ui/slice'
import { api } from '@/services/api'
import { preferencesReducer } from '@m/features/preferences/slice'

/**
 * The mobile store: the web app's reducers and middleware (same state shape, so the shared
 * selectors and hooks work unchanged) plus device preferences.
 */
const rootReducer = combineReducers({
  [api.reducerPath]: api.reducer,
  auth: authReducer,
  data: dataReducer,
  receipts: receiptsReducer,
  transactions: transactionsReducer,
  ui: uiReducer,
  preferences: preferencesReducer,
})

export type RootState = ReturnType<typeof rootReducer>

export function createStore(preloadedState?: Partial<RootState>) {
  const store = configureStore({
    reducer: rootReducer,
    preloadedState,
    middleware: (getDefault) =>
      getDefault().prepend(budgetAlerts.middleware).concat(api.middleware),
  })
  setupListeners(store.dispatch)
  return store
}

export const store = createStore()

export type AppStore = ReturnType<typeof createStore>
export type AppDispatch = AppStore['dispatch']
