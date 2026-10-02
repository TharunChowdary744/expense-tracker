import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { describe, expect, it } from 'vitest'
import { createStore } from './store'
import { ThemeProvider } from './ThemeProvider'
import { routes } from './routes'

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <Provider store={createStore()}>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </Provider>,
  )
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
