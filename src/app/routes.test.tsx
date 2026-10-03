import { act, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { describe, expect, it } from 'vitest'
import { authStateChanged, signOutRequested } from '@/features/auth/slice'
import type { AuthUser } from '@/features/auth/types'
import { createStore } from './store'
import { ThemeProvider } from './ThemeProvider'
import { routes } from './routes'

const user: AuthUser = {
  uid: 'u1',
  email: 'ada@example.com',
  displayName: 'Ada',
  photoURL: null,
  emailVerified: true,
  providerIds: ['password'],
}

function renderAt(path: string, signedIn: AuthUser | null | 'loading' = user) {
  const store = createStore()
  if (signedIn !== 'loading') store.dispatch(authStateChanged(signedIn))
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <Provider store={store}>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </Provider>,
  )
  return router
}

describe('routes', () => {
  it('renders a lazy page inside the layout', async () => {
    renderAt('/budgets')
    expect(await screen.findByRole('heading', { name: 'Budgets' })).toBeInTheDocument()
    expect(screen.getAllByRole('navigation', { name: 'Main' }).length).toBeGreaterThan(0)
  })

  it('shows the 404 page for unknown URLs', async () => {
    renderAt('/nope/not-here')
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })
})

describe('auth guards', () => {
  it('sends signed-out visitors to sign-in and remembers where they were going', async () => {
    const router = renderAt('/transactions?tab=all', null)
    // The router first loads the lazy transactions page module, which is large on a cold run.
    expect(
      await screen.findByRole('heading', { name: 'Sign in' }, { timeout: 5000 }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/sign-in')
    expect(router.state.location.state).toEqual({ from: '/transactions?tab=all' })
  })

  it('does not remember the old page after an explicit sign-out', async () => {
    const store = createStore()
    store.dispatch(authStateChanged(user))
    const router = createMemoryRouter(routes, { initialEntries: ['/profile'] })
    render(
      <Provider store={store}>
        <ThemeProvider>
          <RouterProvider router={router} />
        </ThemeProvider>
      </Provider>,
    )
    expect(await screen.findByRole('heading', { name: 'Profile', level: 1 })).toBeInTheDocument()
    act(() => {
      store.dispatch(signOutRequested())
      store.dispatch(authStateChanged(null))
    })
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(router.state.location.state).toBeNull()
  })

  it('shows a skeleton, not a redirect, until the first auth event', async () => {
    const router = renderAt('/transactions', 'loading')
    await waitFor(() => expect(router.state.initialized).toBe(true))
    expect(await screen.findByRole('status', { name: 'Loading' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/transactions')
  })

  it('returns a signed-in user from sign-in to the page they asked for', async () => {
    const router = createMemoryRouter(routes, {
      initialEntries: [{ pathname: '/sign-in', state: { from: '/budgets' } }],
    })
    const store = createStore()
    store.dispatch(authStateChanged(user))
    render(
      <Provider store={store}>
        <ThemeProvider>
          <RouterProvider router={router} />
        </ThemeProvider>
      </Provider>,
    )
    expect(await screen.findByRole('heading', { name: 'Budgets' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/budgets')
  })

  it('ignores an off-site return target', async () => {
    const router = createMemoryRouter(routes, {
      initialEntries: [{ pathname: '/sign-in', state: { from: '//evil.example' } }],
    })
    const store = createStore()
    store.dispatch(authStateChanged(user))
    render(
      <Provider store={store}>
        <ThemeProvider>
          <RouterProvider router={router} />
        </ThemeProvider>
      </Provider>,
    )
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
  })

  it('keeps signed-in users out of the auth pages', async () => {
    const router = renderAt('/sign-up')
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
  })

  it('sends unverified email accounts to the verify-email notice everywhere', async () => {
    const unverified = { ...user, emailVerified: false }
    const router = renderAt('/budgets', unverified)
    expect(await screen.findByRole('heading', { name: 'Verify your email' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/verify-email')
  })

  it('does not require verification for Google accounts', async () => {
    renderAt('/budgets', { ...user, emailVerified: false, providerIds: ['google.com'] })
    expect(await screen.findByRole('heading', { name: 'Budgets' })).toBeInTheDocument()
  })
})
