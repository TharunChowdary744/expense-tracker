import { describe, expect, it } from 'vitest'
import { budgetFormSchema, budgetSchema, parseThresholds, type BudgetFormInput } from './schemas'

const input = (overrides: Partial<BudgetFormInput> = {}): BudgetFormInput => ({
  name: ' Food ',
  period: 'monthly',
  scope: 'categories',
  categoryIds: ['food', 'food'],
  amount: '5,000',
  rollover: false,
  thresholds: '80, 100',
  ...overrides,
})

describe('budgetFormSchema', () => {
  const schema = budgetFormSchema('INR')

  it('converts the form into stored values', () => {
    const result = schema.safeParse(input({ amount: '5000.5' }))
    expect(result.success && result.data).toEqual({
      name: 'Food',
      period: 'monthly',
      categoryIds: ['food'],
      amount: 500_050,
      rollover: false,
      alertThresholds: [80, 100],
    })
  })

  it('clears categories for an overall budget', () => {
    const result = schema.safeParse(input({ scope: 'overall' }))
    expect(result.success && result.data.categoryIds).toEqual([])
  })

  it('reports field errors', () => {
    const issues = (overrides: Partial<BudgetFormInput>) => {
      const result = schema.safeParse(input(overrides))
      return result.success ? [] : result.error.issues.map((i) => i.path.join('.'))
    }
    expect(issues({ amount: '' })).toEqual(['amount'])
    expect(issues({ amount: '0' })).toEqual(['amount'])
    expect(issues({ amount: 'abc' })).toEqual(['amount'])
    expect(issues({ categoryIds: [] })).toEqual(['categoryIds'])
    expect(issues({ thresholds: '' })).toEqual(['thresholds'])
    expect(issues({ name: '' })).toEqual(['name'])
  })

  it('uses the currency minor units (JPY has none)', () => {
    const result = budgetFormSchema('JPY').safeParse(input({ amount: '5000' }))
    expect(result.success && result.data.amount).toBe(5000)
  })
})

describe('parseThresholds', () => {
  it('parses, sorts and dedupes', () => {
    expect(parseThresholds('100, 80 80%')).toEqual([80, 100])
    expect(parseThresholds('50,75,90,100,120')).toEqual([50, 75, 90, 100, 120])
  })

  it('rejects bad input', () => {
    expect(parseThresholds('')).toEqual(expect.any(String))
    expect(parseThresholds('80.5')).toEqual(expect.any(String))
    expect(parseThresholds('0')).toEqual(expect.any(String))
    expect(parseThresholds('1001')).toEqual(expect.any(String))
    expect(parseThresholds('10, 20, 30, 40, 50, 60')).toEqual(expect.any(String))
  })
})

describe('budgetSchema', () => {
  it('defaults bad thresholds to 80 and 100 and sorts good ones', () => {
    const doc = {
      name: 'Food',
      period: 'weekly',
      categoryIds: [],
      amount: 100,
      rollover: true,
      alertThresholds: [100, 80],
      startDate: 'x',
      createdAt: 'x',
      updatedAt: 'x',
      createdBy: 'a',
    }
    expect(budgetSchema.parse(doc).alertThresholds).toEqual([80, 100])
    expect(budgetSchema.parse({ ...doc, alertThresholds: 'nope' }).alertThresholds).toEqual([
      80, 100,
    ])
  })
})
