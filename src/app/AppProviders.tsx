import type { ReactNode } from 'react'
import { Provider } from 'react-redux'
import { ErrorBoundary } from './ErrorBoundary'
import { store } from './store'
import { ThemeProvider } from './ThemeProvider'

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <Provider store={store}>
        <ThemeProvider>{children}</ThemeProvider>
      </Provider>
    </ErrorBoundary>
  )
}
