import { describe, expect, it } from 'vitest'
import type { Account } from './types'
import { accountBalance, compareAccounts, netWorth } from './utils'

const account = (over: Partial<Account> = {}): Account => ({
  id: 'a',
  name: 'Bank',
  type: 'bank',
  currency: 'INR',
  openingBalance: 10000,
  txTotal: 0,
  color: '#2563eb',
  icon: 'landmark',
  archived: false,
  createdAt: '2026-10-02T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
  createdBy: 'u1',
  pending: false,
  ...over,
})

describe('accountBalance', () => {
  it('is the opening balance plus the cached transaction total', () => {
    expect(accountBalance(account())).toBe(10000)
    expect(accountBalance(account({ openingBalance: -500 }))).toBe(-500)
    expect(accountBalance(account({ txTotal: -12550 }))).toBe(10000 - 12550)
  })
})

describe('netWorth', () => {
  it('sums active base-currency accounts and groups the rest by currency', () => {
    const accounts = [
      account({ id: 'a', openingBalance: 10000 }),
      account({ id: 'b', openingBalance: -2500 }),
      account({ id: 'c', currency: 'USD', openingBalance: 300 }),
      account({ id: 'd', currency: 'USD', openingBalance: 200 }),
      account({ id: 'e', currency: 'EUR', openingBalance: 50 }),
      account({ id: 'f', openingBalance: 99999, archived: true }),
    ]
    const balances = new Map([
      ['a', 12000],
      ['b', -2500],
    ])
    expect(netWorth(accounts, balances, 'INR')).toEqual({
      base: 9500,
      baseCurrency: 'INR',
      other: [
        { currency: 'EUR', amount: 50 },
        { currency: 'USD', amount: 500 },
      ],
    })
  })

  it('is zero with no accounts', () => {
    expect(netWorth([], new Map(), 'USD')).toEqual({ base: 0, baseCurrency: 'USD', other: [] })
  })
})

describe('compareAccounts', () => {
  it('lists active accounts first, then by name', () => {
    const sorted = [
      account({ id: '1', name: 'zeta' }),
      account({ id: '2', name: 'Alpha', archived: true }),
      account({ id: '3', name: 'beta' }),
    ].sort(compareAccounts)
    expect(sorted.map((a) => a.id)).toEqual(['3', '1', '2'])
  })
})
