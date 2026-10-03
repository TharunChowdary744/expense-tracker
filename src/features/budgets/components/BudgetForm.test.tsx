import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Category } from '@/features/categories/types'
import type { Budget } from '../types'
import { BudgetForm } from './BudgetForm'

const stamp = '2026-10-01T00:00:00.000Z'
function category(id: string, name: string, parentId: string | null = null): Category {
  return {
    id,
    name,
    kind: 'expense',
    icon: 'tag',
    color: '#ea580c',
    parentId,
    order: 0,
    archived: false,
    createdAt: stamp,
    updatedAt: stamp,
    createdBy: 'u1',
    pending: false,
  }
}
const categories = [
  category('food', 'Food'),
  category('groceries', 'Groceries', 'food'),
  category('transport', 'Transport'),
]

const existing: Budget = {
  id: 'b1',
  name: 'Food',
  period: 'weekly',
  categoryIds: ['food'],
  amount: 150_050,
  rollover: true,
  alertThresholds: [50, 100],
  startDate: stamp,
  createdAt: stamp,
  updatedAt: stamp,
  createdBy: 'u1',
  pending: false,
}

function setup(props: Partial<Parameters<typeof BudgetForm>[0]> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(null)
  const onCancel = vi.fn()
  render(
    <BudgetForm
      categories={categories}
      baseCurrency="INR"
      onSubmit={onSubmit}
      onCancel={onCancel}
      {...props}
    />,
  )
  return { onSubmit, onCancel, user: userEvent.setup() }
}

describe('BudgetForm', () => {
  it('creates a monthly category budget with default alerts', async () => {
    const { onSubmit, user } = setup()
    await user.type(screen.getByLabelText('Name'), 'Food')
    await user.type(screen.getByLabelText('Limit'), '5,000')
    await user.click(screen.getByRole('checkbox', { name: /Food/ }))
    // A selected parent covers (and locks) its subcategories.
    expect(screen.getByRole('checkbox', { name: 'Groceries' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Groceries' })).toBeDisabled()
    expect(screen.getByLabelText('Alert at (% of limit)')).toHaveValue('80, 100')
    await user.click(screen.getByRole('button', { name: 'Create budget' }))

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Food',
      period: 'monthly',
      categoryIds: ['food'],
      amount: 500_000,
      rollover: false,
      alertThresholds: [80, 100],
    })
  })

  it('creates an overall weekly budget with rollover', async () => {
    const { onSubmit, user } = setup()
    await user.type(screen.getByLabelText('Name'), 'Everything')
    await user.selectOptions(screen.getByLabelText('Period'), 'weekly')
    await user.type(screen.getByLabelText('Limit'), '2000')
    await user.click(screen.getByRole('radio', { name: 'All expenses' }))
    expect(screen.queryByRole('group', { name: 'Categories' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('switch', { name: 'Roll over' }))
    await user.click(screen.getByRole('button', { name: 'Create budget' }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        period: 'weekly',
        categoryIds: [],
        rollover: true,
        amount: 200_000,
      }),
    )
  })

  it('shows field errors and does not submit', async () => {
    const { onSubmit, user } = setup()
    await user.clear(screen.getByLabelText('Alert at (% of limit)'))
    await user.type(screen.getByLabelText('Alert at (% of limit)'), '80, abc')
    await user.click(screen.getByRole('button', { name: 'Create budget' }))

    expect(await screen.findByText('Enter a name')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Name'), 'Food')
    await user.click(screen.getByRole('button', { name: 'Create budget' }))
    expect(await screen.findByText('Enter the limit')).toBeInTheDocument()
    expect(screen.getByText('Choose at least one category')).toBeInTheDocument()
    expect(screen.getByText('"abc" is not a whole percentage')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('edits an existing budget', async () => {
    const { onSubmit, user } = setup({ budget: existing })
    expect(screen.getByLabelText('Limit')).toHaveValue('1500.50')
    expect(screen.getByLabelText('Period')).toHaveValue('weekly')
    expect(screen.getByRole('switch', { name: 'Roll over' })).toBeChecked()
    await user.click(screen.getByRole('checkbox', { name: 'Transport' }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Food',
      period: 'weekly',
      categoryIds: ['food', 'transport'],
      amount: 150_050,
      rollover: true,
      alertThresholds: [50, 100],
    })
  })

  it('shows a save error from the parent', async () => {
    const { user } = setup({
      budget: existing,
      onSubmit: vi.fn().mockResolvedValue('Something went wrong. Try again.'),
    })
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong')
  })
})
