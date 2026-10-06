import type { Group, GroupExpense } from '@/features/groups/types'
import { expenseDefaults } from './expenseDefaults'
import { inviteTokenFrom } from './invites'

const TOKEN = 'abcDEF123_-abcDEF123_-abcDEF12'

describe('inviteTokenFrom', () => {
  it('reads the token from web, app and bare links', () => {
    expect(inviteTokenFrom(`https://x.github.io/expense-tracker/join/${TOKEN}`)).toBe(TOKEN)
    expect(inviteTokenFrom(`ledgerly://join/${TOKEN}`)).toBe(TOKEN)
    expect(inviteTokenFrom(`  https://x.io/join/${TOKEN}?utm=1 `)).toBe(TOKEN)
    expect(inviteTokenFrom(TOKEN)).toBe(TOKEN)
  })

  it('rejects text that is not an invite', () => {
    expect(inviteTokenFrom('')).toBeNull()
    expect(inviteTokenFrom('hello there')).toBeNull()
    expect(inviteTokenFrom('https://x.io/join/short')).toBeNull()
  })
})

describe('expenseDefaults', () => {
  const group = { currency: 'INR' } as Pick<Group, 'currency'>
  const members = ['me', 'you']

  it('starts with an equal split paid by the signed-in member', () => {
    const v = expenseDefaults(group, members, 'me', undefined, [])
    expect(v.paidMode).toBe('single')
    expect(v.payer).toBe('me')
    expect(v.splitType).toBe('equal')
    expect(v.included).toEqual({ me: true, you: true })
    expect(v.shares).toEqual({ me: '1', you: '1' })
  })

  it('fills the form from a saved expense', () => {
    const expense = {
      description: 'Dinner',
      amount: 150000,
      date: '2026-10-01T06:30:00.000Z',
      paidBy: { me: 100000, you: 50000 },
      splitType: 'exact',
      splitInput: { me: 50000, you: 100000 },
      shares: { me: 50000, you: 100000 },
      note: '',
    } as unknown as GroupExpense
    const v = expenseDefaults(group, members, 'me', expense, [])
    expect(v.amount).toBe('1500.00')
    expect(v.paidMode).toBe('multiple')
    expect(v.paid).toEqual({ me: '1000.00', you: '500.00' })
    expect(v.exact).toEqual({ me: '500.00', you: '1000.00' })
  })
})
