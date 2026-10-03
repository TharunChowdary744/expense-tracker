import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Account } from '@/features/accounts/types'
import type { Group, GroupExpense } from '../types'
import { ExpenseForm } from './ExpenseForm'

const stamp = '2026-10-01T00:00:00.000Z'
const stamps = { createdAt: stamp, updatedAt: stamp, createdBy: 'a', pending: false }

const group: Group = {
  id: 'g1',
  name: 'Goa trip',
  emoji: '🏖️',
  currency: 'INR',
  memberIds: ['a', 'b', 'c'],
  members: {
    a: { displayName: 'Asha', email: 'asha@example.com', role: 'owner' },
    b: { displayName: 'Bilal', email: 'bilal@example.com', role: 'member' },
    c: { displayName: 'Chen', email: 'chen@example.com', role: 'member' },
  },
  ownerId: 'a',
  invitedEmails: [],
  simplifyDebts: false,
  ...stamps,
}

const cash: Account = {
  id: 'cash',
  name: 'Cash',
  type: 'cash',
  currency: 'INR',
  openingBalance: 0,
  txTotal: 0,
  color: '#22c55e',
  icon: 'wallet',
  archived: false,
  ...stamps,
}

function setup(props: Partial<Parameters<typeof ExpenseForm>[0]> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(null)
  render(
    <ExpenseForm
      group={group}
      memberIds={['a', 'b', 'c']}
      uid="a"
      accounts={[cash]}
      categories={[]}
      baseCurrency="INR"
      locale="en-IN"
      onSubmit={onSubmit}
      onCancel={vi.fn()}
      {...props}
    />,
  )
  return { onSubmit, user: userEvent.setup() }
}

const shareOf = (name: string) => screen.getByLabelText(`${name}'s share`).textContent

describe('ExpenseForm', () => {
  it('splits 1,000 equally as 333.34 / 333.33 / 333.33 and submits exact minor units', async () => {
    const { user, onSubmit } = setup()
    await user.type(screen.getByLabelText('Description'), 'Dinner')
    await user.type(screen.getByLabelText('Amount (INR)'), '1000')

    expect(shareOf('You')).toBe('₹333.34')
    expect(shareOf('Bilal')).toBe('₹333.33')
    expect(shareOf('Chen')).toBe('₹333.33')
    expect(screen.getByText(/Adds up to ₹1,000\.00/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Add expense' }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Dinner',
        amount: 100000,
        paidBy: { a: 100000 },
        splitType: 'equal',
        splitInput: { a: 1, b: 1, c: 1 },
        shares: { a: 33334, b: 33333, c: 33333 },
      }),
    )
  })

  it('excludes unchecked members from an equal split', async () => {
    const { user, onSubmit } = setup()
    await user.type(screen.getByLabelText('Description'), 'Taxi')
    await user.type(screen.getByLabelText('Amount (INR)'), '301')
    await user.click(screen.getByRole('checkbox', { name: 'Chen' }))
    expect(shareOf('Chen')).toBe('₹0.00')
    await user.click(screen.getByRole('button', { name: 'Add expense' }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ shares: { a: 15050, b: 15050 } }),
    )
  })

  it('validates percentages live and rejects totals other than 100%', async () => {
    const { user, onSubmit } = setup()
    await user.type(screen.getByLabelText('Description'), 'Hotel')
    await user.type(screen.getByLabelText('Amount (INR)'), '1000')
    await user.click(screen.getByText('Percentages'))
    const shares = screen.getByRole('list', { name: 'Shares' })
    const inputs = within(shares).getAllByRole('textbox')
    await user.type(inputs[0] as HTMLElement, '50')
    await user.type(inputs[1] as HTMLElement, '30')
    expect(
      screen.getByText(/Percentages must add up to 100%: 20% left to assign/),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Add expense' }))
    expect(onSubmit).not.toHaveBeenCalled()

    await user.type(inputs[2] as HTMLElement, '30')
    expect(screen.getByText(/10% too much/)).toBeInTheDocument()
    await user.clear(inputs[2] as HTMLElement)
    await user.type(inputs[2] as HTMLElement, '20')
    await user.click(screen.getByRole('button', { name: 'Add expense' }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        splitType: 'percent',
        splitInput: { a: 50, b: 30, c: 20 },
        shares: { a: 50000, b: 30000, c: 20000 },
      }),
    )
  })

  it('splits by shares (2:1:1)', async () => {
    const { user, onSubmit } = setup()
    await user.type(screen.getByLabelText('Description'), 'Groceries')
    await user.type(screen.getByLabelText('Amount (INR)'), '1000')
    await user.click(screen.getByText('Shares', { selector: 'label' }))
    const inputs = within(screen.getByRole('list', { name: 'Shares' })).getAllByRole('textbox')
    await user.clear(inputs[0] as HTMLElement)
    await user.type(inputs[0] as HTMLElement, '2')
    expect(shareOf('You')).toBe('₹500.00')
    expect(shareOf('Bilal')).toBe('₹250.00')
    await user.click(screen.getByRole('button', { name: 'Add expense' }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ shares: { a: 50000, b: 25000, c: 25000 } }),
    )
  })

  it('rejects exact amounts that do not add up', async () => {
    const { user, onSubmit } = setup()
    await user.type(screen.getByLabelText('Description'), 'Tickets')
    await user.type(screen.getByLabelText('Amount (INR)'), '100')
    await user.click(screen.getByText('Exact amounts'))
    const inputs = within(screen.getByRole('list', { name: 'Shares' })).getAllByRole('textbox')
    await user.type(inputs[0] as HTMLElement, '60')
    await user.type(inputs[1] as HTMLElement, '50')
    expect(screen.getByText(/₹10\.00 too much/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add expense' }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('takes several payers whose amounts must add up', async () => {
    const { user, onSubmit } = setup()
    await user.type(screen.getByLabelText('Description'), 'Villa')
    await user.type(screen.getByLabelText('Amount (INR)'), '900')
    await user.click(screen.getByLabelText('Several people'))
    await user.type(screen.getByRole('textbox', { name: 'You' }), '600')
    expect(screen.getByText(/₹300\.00 left to assign/)).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: 'Bilal' }), '300')
    await user.click(screen.getByRole('button', { name: 'Add expense' }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ paidBy: { a: 60000, b: 30000 } }),
    )
  })

  it('adds my share to my personal transactions when asked', async () => {
    const { user, onSubmit } = setup()
    await user.type(screen.getByLabelText('Description'), 'Dinner')
    await user.type(screen.getByLabelText('Amount (INR)'), '1000')
    await user.click(screen.getByRole('switch', { name: /Also add my share/ }))
    expect(screen.getByText(/Records an expense of ₹333\.34/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add expense' }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        personal: {
          accountId: 'cash',
          amount: 33334,
          currency: 'INR',
          fxRateToBase: 1,
          baseAmount: 33334,
        },
      }),
    )
  })

  it('prefills an existing expense for editing', async () => {
    const expense: GroupExpense = {
      id: 'e1',
      description: 'Boat',
      amount: 120000,
      currency: 'INR',
      date: '2026-10-02T06:30:00.000Z',
      paidBy: { b: 120000 },
      splitType: 'shares',
      splitInput: { a: 1, b: 2 },
      shares: { a: 40000, b: 80000 },
      note: '',
      attachments: [],
      ...stamps,
    }
    const { user, onSubmit } = setup({ expense })
    expect(screen.getByLabelText('Description')).toHaveValue('Boat')
    expect(screen.getByLabelText('Amount (INR)')).toHaveValue('1200.00')
    expect(shareOf('You')).toBe('₹400.00')
    expect(shareOf('Chen')).toBe('₹0.00')
    expect(screen.queryByRole('switch', { name: /Also add my share/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ paidBy: { b: 120000 }, shares: { a: 40000, b: 80000 } }),
    )
  })
})
