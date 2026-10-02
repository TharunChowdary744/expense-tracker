import { describe, expect, it } from 'vitest'
import { accountFormSchema, accountSchema } from './schemas'

const form = {
  name: ' HDFC ',
  type: 'bank',
  currency: 'INR',
  openingBalance: '1,250.50',
  color: '#2563eb',
  icon: 'landmark',
}

describe('accountFormSchema', () => {
  it('trims the name and converts the opening balance to minor units', () => {
    expect(accountFormSchema.parse(form)).toEqual({
      ...form,
      name: 'HDFC',
      openingBalance: 125050,
    })
  })

  it('treats an empty balance as zero and accepts negatives', () => {
    expect(accountFormSchema.parse({ ...form, openingBalance: '' }).openingBalance).toBe(0)
    expect(accountFormSchema.parse({ ...form, openingBalance: '-99.99' }).openingBalance).toBe(
      -9999,
    )
    expect(
      accountFormSchema.parse({ ...form, currency: 'JPY', openingBalance: '1500' }).openingBalance,
    ).toBe(1500)
  })

  it('rejects bad input with field messages', () => {
    const result = accountFormSchema.safeParse({
      ...form,
      name: '',
      openingBalance: '12abc',
      color: 'blue',
    })
    expect(result.success).toBe(false)
    const fields = result.error?.issues.map((i) => i.path[0])
    expect(fields).toEqual(expect.arrayContaining(['name', 'color']))
    const balance = accountFormSchema.safeParse({ ...form, openingBalance: '12abc' })
    expect(balance.error?.issues[0]?.path).toEqual(['openingBalance'])
  })
})

describe('accountSchema', () => {
  const stored = {
    name: 'Cash',
    type: 'cash',
    currency: 'INR',
    openingBalance: 0,
    color: '#16a34a',
    icon: 'wallet',
    archived: false,
    createdAt: '2026-10-02T00:00:00.000Z',
    updatedAt: '2026-10-02T00:00:00.000Z',
    createdBy: 'u1',
  }

  it('accepts stored accounts and rejects float balances', () => {
    expect(accountSchema.safeParse(stored).success).toBe(true)
    expect(accountSchema.safeParse({ ...stored, openingBalance: 1.5 }).success).toBe(false)
  })

  it('falls back for cosmetic fields from older data', () => {
    const parsed = accountSchema.parse({ ...stored, archived: undefined, color: 'nope', icon: 5 })
    expect(parsed).toMatchObject({ color: '#64748b', icon: 'wallet', archived: false })
  })
})
