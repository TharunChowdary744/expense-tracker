import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Account } from '../types'
import { AccountForm } from './AccountForm'

const existing: Account = {
  id: 'acc1',
  name: 'Visa',
  type: 'card',
  currency: 'USD',
  openingBalance: -12345,
  color: '#dc2626',
  icon: 'credit-card',
  archived: false,
  createdAt: '2026-10-02T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
  createdBy: 'u1',
  pending: false,
}

function setup(props: Partial<Parameters<typeof AccountForm>[0]> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(null)
  const onCancel = vi.fn()
  render(
    <AccountForm
      defaultCurrency="INR"
      locale="en"
      onSubmit={onSubmit}
      onCancel={onCancel}
      {...props}
    />,
  )
  return { onSubmit, onCancel, user: userEvent.setup() }
}

describe('AccountForm', () => {
  it('creates an account with the balance in minor units', async () => {
    const { onSubmit, user } = setup()
    await user.type(screen.getByLabelText('Name'), 'Savings')
    await user.selectOptions(screen.getByLabelText('Type'), 'cash')
    expect(screen.getByLabelText('Currency')).toHaveValue('INR')
    await user.type(screen.getByLabelText('Opening balance'), '2,500.75')
    await user.click(screen.getByRole('radio', { name: 'Green' }))
    await user.click(screen.getByRole('radio', { name: 'Piggy bank' }))
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Savings',
      type: 'cash',
      currency: 'INR',
      openingBalance: 250075,
      color: '#16a34a',
      icon: 'piggy-bank',
    })
  })

  it('shows field errors and does not submit invalid input', async () => {
    const { onSubmit, user } = setup()
    await user.type(screen.getByLabelText('Opening balance'), '12abc')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('Enter a name')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('reports an invalid amount once the rest is valid', async () => {
    const { onSubmit, user } = setup()
    await user.type(screen.getByLabelText('Name'), 'Cash')
    await user.type(screen.getByLabelText('Opening balance'), '1.2.3')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText('Enter an amount like 1500 or -250.75')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('edits an existing account, showing its balance in major units', async () => {
    const { onSubmit, user } = setup({ account: existing })
    const balance = screen.getByLabelText('Opening balance')
    expect(balance).toHaveValue('-123.45')
    expect(screen.getByRole('radio', { name: 'Credit card' })).toBeChecked()
    await user.clear(screen.getByLabelText('Name'))
    await user.type(screen.getByLabelText('Name'), 'Visa Gold')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Visa Gold', currency: 'USD', openingBalance: -12345 }),
    )
  })

  it('shows the error returned by the save', async () => {
    const { user } = setup({
      account: existing,
      onSubmit: vi.fn().mockResolvedValue("You don't have permission to do that."),
    })
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('permission')
  })

  it('cancels', async () => {
    const { onCancel, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
  })
})
