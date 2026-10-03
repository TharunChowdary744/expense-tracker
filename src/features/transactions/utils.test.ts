import { describe, expect, it } from 'vitest'
import type { Transaction } from './types'
import {
  accountDeltas,
  applyKey,
  balanceEffects,
  dateInputToIso,
  dayKey,
  groupByDay,
  parseDateInput,
  signedBaseAmount,
  todayInput,
} from './utils'

const currencies: Record<string, string> = { cash: 'INR', bank: 'INR', travel: 'USD' }
const currencyOf = (id: string) => currencies[id]

const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: 't1',
  type: 'expense',
  amount: 1000,
  currency: 'INR',
  fxRateToBase: 1,
  baseAmount: 1000,
  accountId: 'cash',
  tags: [],
  payee: '',
  note: '',
  date: '2026-10-02T06:30:00.000Z',
  attachments: [],
  createdAt: '2026-10-02T06:30:00.000Z',
  updatedAt: '2026-10-02T06:30:00.000Z',
  createdBy: 'u1',
  pending: false,
  ...over,
})

describe('balanceEffects', () => {
  it('subtracts expenses and adds income', () => {
    expect([...balanceEffects(tx(), currencyOf)]).toEqual([['cash', -1000]])
    expect([...balanceEffects(tx({ type: 'income' }), currencyOf)]).toEqual([['cash', 1000]])
  })

  it('moves both sides of a transfer', () => {
    const effects = balanceEffects(tx({ type: 'transfer', toAccountId: 'bank' }), currencyOf)
    expect(Object.fromEntries(effects)).toEqual({ cash: -1000, bank: 1000 })
  })

  it('uses the base amount on a base-currency account for a foreign transaction', () => {
    const usd = tx({ currency: 'USD', amount: 1250, fxRateToBase: 83.5, baseAmount: 104375 })
    expect(Object.fromEntries(balanceEffects(usd, currencyOf))).toEqual({ cash: -104375 })
    expect(Object.fromEntries(balanceEffects({ ...usd, accountId: 'travel' }, currencyOf))).toEqual(
      {
        travel: -1250,
      },
    )
  })

  it('handles a cross-currency transfer side by side', () => {
    const effects = balanceEffects(
      tx({
        type: 'transfer',
        currency: 'USD',
        amount: 10000,
        baseAmount: 832500,
        accountId: 'bank',
        toAccountId: 'travel',
      }),
      currencyOf,
    )
    expect(Object.fromEntries(effects)).toEqual({ bank: -832500, travel: 10000 })
  })
})

describe('accountDeltas', () => {
  it('reverses the old effect and applies the new one, dropping zeros', () => {
    const before = tx({ amount: 1000, baseAmount: 1000 })
    const after = tx({ amount: 1500, baseAmount: 1500, accountId: 'bank' })
    expect(Object.fromEntries(accountDeltas([before], [after], currencyOf))).toEqual({
      cash: 1000,
      bank: -1500,
    })
    expect(accountDeltas([before], [before], currencyOf).size).toBe(0)
  })

  it('sums several deletes on the same account', () => {
    const deltas = accountDeltas(
      [tx(), tx({ id: 't2', type: 'income', amount: 300 })],
      [],
      currencyOf,
    )
    expect(Object.fromEntries(deltas)).toEqual({ cash: 700 })
  })
})

describe('grouping', () => {
  it('signs base amounts for daily totals', () => {
    expect(signedBaseAmount(tx())).toBe(-1000)
    expect(signedBaseAmount(tx({ type: 'income' }))).toBe(1000)
    expect(signedBaseAmount(tx({ type: 'transfer' }))).toBe(0)
  })

  it('groups by local day and totals each day', () => {
    const items = [
      tx({ id: 'a', date: '2026-10-02T10:00:00', type: 'income', baseAmount: 5000 }),
      tx({ id: 'b', date: '2026-10-02T08:00:00' }),
      tx({ id: 'c', date: '2026-10-01T23:00:00', type: 'transfer' }),
    ].map((t) => ({ ...t, date: new Date(t.date).toISOString() }))
    const groups = groupByDay(items)
    expect(groups.map((g) => [g.key, g.items.length, g.net])).toEqual([
      ['2026-10-02', 2, 4000],
      ['2026-10-01', 1, 0],
    ])
  })
})

describe('dates', () => {
  it('converts between date inputs and stored instants in local time', () => {
    const now = new Date(2026, 9, 2, 14, 35, 10, 5)
    expect(todayInput(now)).toBe('2026-10-02')
    const iso = dateInputToIso('2026-09-30', undefined, now)
    expect(dayKey(iso)).toBe('2026-09-30')
    expect(new Date(iso).getHours()).toBe(14)
    const kept = dateInputToIso('2026-09-29', new Date(2026, 0, 1, 7, 5).toISOString())
    expect(new Date(kept).getHours()).toBe(7)
    expect(parseDateInput('2026-02-30')).toBeNull()
    expect(() => dateInputToIso('nope')).toThrow()
  })
})

describe('applyKey', () => {
  it('builds calculator expressions', () => {
    expect(applyKey('', '+')).toBe('')
    expect(applyKey('12', '+')).toBe('12+')
    expect(applyKey('12+', '×')).toBe('12×')
    expect(applyKey('', '.')).toBe('0.')
    expect(applyKey('1.5', '.')).toBe('1.5')
    expect(applyKey('1.5+', '.')).toBe('1.5+0.')
    expect(applyKey('12', 'back')).toBe('1')
    expect(applyKey('12', 'clear')).toBe('')
    expect(applyKey('1', '0')).toBe('10')
  })
})
