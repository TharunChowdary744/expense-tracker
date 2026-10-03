import { describe, expect, it } from 'vitest'
import {
  groupExpenseSchema,
  inviteEmailSchema,
  previewSplit,
  settlementFormSchema,
  type GroupExpenseFormInput,
} from './schemas'

const stamps = { createdAt: 'x', updatedAt: 'x', createdBy: 'a' }

describe('groupExpenseSchema', () => {
  const base = {
    description: 'Dinner',
    amount: 100000,
    currency: 'INR',
    date: '2026-10-03T06:30:00.000Z',
    paidBy: { a: 100000 },
    splitType: 'equal',
    splitInput: { a: 1, b: 1, c: 1 },
    shares: { a: 33334, b: 33333, c: 33333 },
    note: '',
    attachments: [],
    ...stamps,
  }

  it('accepts a doc that keeps the invariant', () => {
    expect(groupExpenseSchema.safeParse(base).success).toBe(true)
  })

  it('rejects docs where paid or shares do not add up', () => {
    expect(groupExpenseSchema.safeParse({ ...base, paidBy: { a: 99999 } }).success).toBe(false)
    expect(
      groupExpenseSchema.safeParse({ ...base, shares: { a: 33333, b: 33333, c: 33333 } }).success,
    ).toBe(false)
    expect(groupExpenseSchema.safeParse({ ...base, shares: { a: 100000.5 } }).success).toBe(false)
  })
})

describe('previewSplit', () => {
  const input: GroupExpenseFormInput = {
    description: 'x',
    amount: '1000',
    date: '2026-10-03',
    categoryId: '',
    paidMode: 'single',
    payer: 'a',
    paid: {},
    splitType: 'equal',
    included: { a: true, b: true, c: true },
    exact: {},
    percent: {},
    shares: {},
    note: '',
    addToPersonal: false,
    personalAccountId: '',
    personalCategoryId: '',
    fxRate: '',
  }
  const ctx = { currency: 'INR', memberOrder: ['a', 'b', 'c'] }

  it('evaluates calculator amounts', () => {
    expect(previewSplit({ ...input, amount: '600+400' }, ctx).amount).toBe(100000)
  })

  it('reports a missing amount', () => {
    expect(previewSplit({ ...input, amount: '' }, ctx).amountError).toBe('Enter an amount')
  })

  it('points at the member whose input is invalid', () => {
    const preview = previewSplit(
      { ...input, splitType: 'percent', percent: { a: '50', b: 'abc' } },
      ctx,
    )
    expect(preview.splitInvalid).toBe('b')
    expect(preview.split).toEqual({ ok: false, reason: 'invalid' })
  })
})

describe('settlementFormSchema', () => {
  const schema = settlementFormSchema('INR')
  const base = { fromUid: 'b', toUid: 'a', amount: '200', date: '2026-10-03', note: '' }

  it('converts the amount to minor units', () => {
    expect(schema.parse(base)).toEqual({ ...base, amount: 20000 })
  })

  it('rejects paying yourself and non-positive amounts', () => {
    expect(schema.safeParse({ ...base, toUid: 'b' }).success).toBe(false)
    expect(schema.safeParse({ ...base, amount: '0' }).success).toBe(false)
    expect(schema.safeParse({ ...base, amount: '' }).success).toBe(false)
  })
})

describe('inviteEmailSchema', () => {
  it('lower-cases and validates the address', () => {
    expect(inviteEmailSchema.parse({ email: ' Eve@Example.COM ' })).toEqual({
      email: 'eve@example.com',
    })
    expect(inviteEmailSchema.safeParse({ email: 'not-an-email' }).success).toBe(false)
  })
})
