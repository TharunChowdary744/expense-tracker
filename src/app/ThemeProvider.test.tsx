import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ThemeProvider } from './ThemeProvider'
import { THEME_STORAGE_KEY, useTheme } from './theme-context'

function Probe() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  return (
    <>
      <p>
        {theme}/{resolvedTheme}
      </p>
      <button onClick={() => setTheme('dark')}>dark</button>
    </>
  )
}

describe('ThemeProvider', () => {
  it('follows the system preference by default', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    expect(screen.getByText('system/light')).toBeInTheDocument()
    expect(document.documentElement).not.toHaveClass('dark')
  })

  it('applies, persists and restores an explicit override', async () => {
    const { unmount } = render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'dark' }))
    expect(document.documentElement).toHaveClass('dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    unmount()

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    expect(screen.getByText('dark/dark')).toBeInTheDocument()
  })
})
