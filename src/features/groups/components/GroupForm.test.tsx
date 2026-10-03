import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { GroupForm } from './GroupForm'

function setup() {
  const onSubmit = vi.fn().mockResolvedValue(null)
  render(<GroupForm baseCurrency="INR" locale="en-IN" onSubmit={onSubmit} onCancel={vi.fn()} />)
  return { onSubmit, user: userEvent.setup() }
}

describe('GroupForm', () => {
  it('creates a group with name, currency and cover emoji', async () => {
    const { user, onSubmit } = setup()
    await user.type(screen.getByLabelText('Name'), '  Goa trip ')
    await user.selectOptions(screen.getByLabelText('Currency'), 'USD')
    await user.click(screen.getByRole('radio', { name: '🏖️' }))
    expect(screen.getByRole('radio', { name: '🏖️' })).toHaveAttribute('aria-checked', 'true')
    await user.click(screen.getByRole('button', { name: 'Create group' }))
    expect(onSubmit).toHaveBeenCalledWith({ name: 'Goa trip', currency: 'USD', emoji: '🏖️' })
  })

  it('requires a name', async () => {
    const { user, onSubmit } = setup()
    await user.click(screen.getByRole('button', { name: 'Create group' }))
    expect(await screen.findByText('Enter a name')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
