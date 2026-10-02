import { describe, expect, it } from 'vitest'
import {
  currencyProblem,
  normalizeTag,
  transactionFormSchema,
  type TransactionFormInput,
} from './schemas'

const accounts: Record<string, string> = { cash: 'INR', bank: 'INR', travel: 'USD', euro: 'EUR' }
const schema = transactionFormSchema({ baseCurrency: 'INR', accountCurrency: (id) => accounts[id] })

const input = (over: Partial<TransactionFormInput> = {}): TransactionFormInput => ({
  type: 'expense',
  amount: '120+30.5',
  currency: 'INR',
  fxRate: '',
  accountId: 'cash',
  toAccountId: '',
  categoryId: 'food',
  date: '2026-10-02',
  payee: ' Market ',
  note: '',
  tags: [' Groceries ', 'groceries', 'Weekly Shop'],
  ...over,
})

const errorFor = (over: Partial<TransactionFormInput>) => {
  const result = schema.safeParse(input(over))
  return result.success ? null : result.error.issues[0]
}

describe('transactionFormSchema', () => {
  it('evaluates the amount and normalises the rest', () => {
    const result = schema.parse(input())
    expect(result).toMatchObject({
      amount: 15050,
      baseAmount: 15050,
      fxRateToBase: 1,
      fxRateText: null,
      categoryId: 'food',
      payee: 'Market',
      tags: ['groceries', 'weekly-shop'],
    })
    expect(result).not.toHaveProperty('toAccountId')
  })

  it('needs a positive amount', () => {
    expect(errorFor({ amount: '' })?.message).toBe('Enter an amount')
    expect(errorFor({ amount: '5-10' })?.message).toMatch(/greater than zero/)
    expect(errorFor({ amount: 'abc' })?.path).toEqual(['amount'])
  })

  it('converts foreign amounts at the given rate', () => {
    const result = schema.parse(input({ amount: '12.50', currency: 'USD', fxRate: '83.5' }))
    expect(result).toMatchObject({
      amount: 1250,
      baseAmount: 104375,
      fxRateToBase: 83.5,
      fxRateText: '83.5',
    })
    expect(errorFor({ currency: 'USD', fxRate: '' })?.path).toEqual(['fxRate'])
    expect(errorFor({ amount: '0.01', currency: 'USD', fxRate: '0.0001' })?.message).toMatch(
      /rounds to zero/,
    )
  })

  it('only allows the account currency or the base currency', () => {
    expect(
      schema.safeParse(input({ accountId: 'travel', currency: 'USD', fxRate: '83' })).success,
    ).toBe(true)
    expect(errorFor({ accountId: 'euro', currency: 'USD', fxRate: '83' })?.path).toEqual([
      'currency',
    ])
  })

  it('validates transfers and drops category and payee', () => {
    expect(errorFor({ type: 'transfer' })?.path).toEqual(['toAccountId'])
    expect(errorFor({ type: 'transfer', toAccountId: 'cash' })?.message).toMatch(/different/)
    expect(errorFor({ type: 'transfer', toAccountId: 'euro' })?.message).toMatch(/other account/)
    const result = schema.parse(input({ type: 'transfer', toAccountId: 'bank' }))
    expect(result).toMatchObject({ toAccountId: 'bank', payee: '' })
    expect(result).not.toHaveProperty('categoryId')
  })
})

describe('helpers', () => {
  it('normalises tags', () => {
    expect(normalizeTag('  Road  Trip ')).toBe('road-trip')
    expect(normalizeTag('x'.repeat(40))).toHaveLength(30)
  })

  it('explains currency problems', () => {
    expect(currencyProblem('USD', 'INR', 'INR')).toBeNull()
    expect(currencyProblem('USD', 'USD', 'INR')).toBeNull()
    expect(currencyProblem('USD', 'EUR', 'INR')).toMatch(/holds EUR/)
  })
})
