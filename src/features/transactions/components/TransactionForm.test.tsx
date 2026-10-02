import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Account } from '@/features/accounts/types'
import type { Category } from '@/features/categories/types'
import type { QuickAddPrefs } from '../prefs'
import type { Transaction } from '../types'
import { todayInput } from '../utils'
import { TransactionForm } from './TransactionForm'

const stamps = {
  createdAt: '2026-10-02T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
  createdBy: 'u1',
  pending: false,
}

const account = (
  id: string,
  name: string,
  currency = 'INR',
  over: Partial<Account> = {},
): Account => ({
  id,
  name,
  type: 'bank',
  currency,
  openingBalance: 100000,
  txTotal: 0,
  color: '#2563eb',
  icon: 'landmark',
  archived: false,
  ...stamps,
  ...over,
})

const category = (id: string, kind: 'expense' | 'income', order = 0): Category => ({
  id,
  name: id,
  kind,
  icon: 'tag',
  color: '#ea580c',
  parentId: null,
  order,
  archived: false,
  ...stamps,
})

const accounts = [
  account('cash', 'Cash'),
  account('bank', 'Bank'),
  account('travel', 'Travel', 'USD'),
  account('old', 'Old', 'INR', { archived: true }),
]
const categories = [
  category('Food', 'expense', 0),
  category('Rent', 'expense', 1),
  category('Salary', 'income'),
]
const emptyPrefs: QuickAddPrefs = {
  lastAccountId: null,
  recentCategoryIds: [],
  recentPayees: [],
  knownTags: [],
  fxRates: {},
}

function setup(props: Partial<Parameters<typeof TransactionForm>[0]> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(null)
  render(
    <TransactionForm
      accounts={accounts}
      categories={categories}
      baseCurrency="INR"
      locale="en-IN"
      prefs={emptyPrefs}
      onSubmit={onSubmit}
      onCancel={vi.fn()}
      {...props}
    />,
  )
  return { onSubmit, user: userEvent.setup() }
}

const amount = () => screen.getByRole('textbox', { name: 'Amount' })

describe('TransactionForm', () => {
  it('adds an expense from a calculator expression with tags created on the fly', async () => {
    const { onSubmit, user } = setup()
    await user.type(amount(), '120+30.5')
    expect(screen.getByText('= ₹150.50')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Category'), 'Food')
    await user.type(screen.getByLabelText('Payee'), 'Market')
    await user.type(screen.getByLabelText('Tags'), 'Weekly Shop{Enter}')
    expect(screen.getByText('#weekly-shop')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add expense' }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'expense',
        amount: 15050,
        baseAmount: 15050,
        currency: 'INR',
        accountId: 'cash',
        categoryId: 'Food',
        payee: 'Market',
        tags: ['weekly-shop'],
        date: todayInput(),
      }),
    )
  })

  it('starts from the last-used account and lists recent categories first', () => {
    setup({ prefs: { ...emptyPrefs, lastAccountId: 'bank', recentCategoryIds: ['Rent'] } })
    expect(screen.getByLabelText('Account')).toHaveValue('bank')
    const recent = within(screen.getByRole('group', { name: 'Recently used' }))
    expect(recent.getAllByRole('option').map((o) => o.textContent)).toEqual(['Rent'])
  })

  it('hides archived accounts and shows only categories of the chosen type', async () => {
    const { user } = setup()
    const accountNames = within(screen.getByLabelText('Account'))
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(accountNames.some((n) => n?.startsWith('Old'))).toBe(false)
    await user.click(screen.getByRole('tab', { name: 'Income' }))
    const options = within(screen.getByLabelText('Category'))
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(options).toEqual(['Uncategorised', 'Salary'])
  })

  it('asks for an exchange rate, prefilled from the last one, for a foreign currency', async () => {
    const { onSubmit, user } = setup({ prefs: { ...emptyPrefs, fxRates: { 'USD>INR': '83.5' } } })
    await user.type(amount(), '12.50')
    await user.selectOptions(screen.getByLabelText('Currency'), 'USD')
    const rate = screen.getByLabelText('Exchange rate: 1 USD in INR')
    expect(rate).toHaveValue('83.5')
    expect(screen.getByText(/Recorded as ₹1,043.75/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add expense' }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 1250,
        currency: 'USD',
        fxRateToBase: 83.5,
        baseAmount: 104375,
      }),
    )
  })

  it('switches currency with the account', async () => {
    const { user } = setup()
    await user.selectOptions(screen.getByLabelText('Account'), 'travel')
    expect(screen.getByLabelText('Currency')).toHaveValue('USD')
  })

  it('needs a different destination for a transfer', async () => {
    const { onSubmit, user } = setup()
    await user.click(screen.getByRole('tab', { name: 'Transfer' }))
    expect(screen.queryByLabelText('Category')).not.toBeInTheDocument()
    await user.type(amount(), '500')
    await user.click(screen.getByRole('button', { name: 'Add transfer' }))
    expect(await screen.findByText('Choose the account the money goes to')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('To account'), 'bank')
    await user.click(screen.getByRole('button', { name: 'Add transfer' }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'transfer',
        amount: 50000,
        accountId: 'cash',
        toAccountId: 'bank',
      }),
    )
  })

  it('shows an amount error instead of submitting', async () => {
    const { onSubmit, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Add expense' }))
    expect(await screen.findByText('Enter an amount')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('prefills an edit and a duplicate', async () => {
    const tx: Transaction = {
      id: 't1',
      type: 'income',
      amount: 500000,
      currency: 'INR',
      fxRateToBase: 1,
      baseAmount: 500000,
      accountId: 'bank',
      categoryId: 'Salary',
      tags: ['work'],
      payee: 'Employer',
      note: 'September',
      date: '2026-09-30T06:30:00.000Z',
      attachments: [],
      ...stamps,
    }
    const { user, onSubmit } = setup({ initial: tx })
    expect(amount()).toHaveValue('5000.00')
    expect(screen.getByRole('tab', { name: 'Income' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText('Date')).toHaveValue('2026-09-30')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: 'Salary', note: 'September' }),
    )
  })
})
