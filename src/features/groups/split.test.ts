import { describe, expect, it } from 'vitest'
import {
  computePaidBy,
  computeShares,
  memberEffect,
  orderMembers,
  percentToHundredths,
  sumMap,
} from './split'

const order = ['a', 'b', 'c']

describe('orderMembers', () => {
  it('puts members in group order, then unknown uids alphabetically', () => {
    expect(orderMembers(['z', 'c', 'a', 'y'], order)).toEqual(['a', 'c', 'y', 'z'])
  })
})

describe('computeShares: equal', () => {
  it('splits 1,000.00 three ways as 333.34 / 333.33 / 333.33', () => {
    const result = computeShares(100000, 'equal', { a: 1, b: 1, c: 1 }, order)
    expect(result).toEqual({ ok: true, shares: { a: 33334, b: 33333, c: 33333 } })
    if (result.ok) expect(sumMap(result.shares)).toBe(100000)
  })

  it('gives the remainder to the earliest members in group order, whatever the input order', () => {
    const result = computeShares(100, 'equal', { c: 1, b: 1, a: 1 }, order)
    expect(result).toEqual({ ok: true, shares: { a: 34, b: 33, c: 33 } })
  })

  it('only includes chosen members', () => {
    expect(computeShares(1001, 'equal', { a: 1, b: 0, c: 1 }, order)).toEqual({
      ok: true,
      shares: { a: 501, c: 500 },
    })
  })

  it('needs at least one member', () => {
    expect(computeShares(100, 'equal', { a: 0 }, order)).toEqual({ ok: false, reason: 'none' })
  })

  it('leaves out members whose share rounds to zero', () => {
    expect(computeShares(2, 'equal', { a: 1, b: 1, c: 1 }, order)).toEqual({
      ok: true,
      shares: { a: 1, b: 1 },
    })
  })
})

describe('computeShares: exact', () => {
  it('accepts amounts that add up', () => {
    expect(computeShares(1000, 'exact', { a: 600, b: 400, c: 0 }, order)).toEqual({
      ok: true,
      shares: { a: 600, b: 400 },
    })
  })

  it('reports how far off the total is', () => {
    expect(computeShares(1000, 'exact', { a: 600, b: 300 }, order)).toEqual({
      ok: false,
      reason: 'total',
      difference: -100,
    })
    expect(computeShares(1000, 'exact', { a: 600, b: 500 }, order)).toEqual({
      ok: false,
      reason: 'total',
      difference: 100,
    })
  })

  it('rejects fractions of a minor unit and negatives', () => {
    expect(computeShares(1000, 'exact', { a: 999.5, b: 0.5 }, order).ok).toBe(false)
    expect(computeShares(1000, 'exact', { a: 1100, b: -100 }, order).ok).toBe(false)
  })
})

describe('computeShares: percent', () => {
  it('splits by percentage and sums exactly', () => {
    const result = computeShares(100000, 'percent', { a: 50, b: 25, c: 25 }, order)
    expect(result).toEqual({ ok: true, shares: { a: 50000, b: 25000, c: 25000 } })
  })

  it('accepts two decimals that add up to 100', () => {
    const result = computeShares(100000, 'percent', { a: 33.34, b: 33.33, c: 33.33 }, order)
    expect(result).toEqual({ ok: true, shares: { a: 33340, b: 33330, c: 33330 } })
  })

  it('distributes remainders deterministically', () => {
    const result = computeShares(1001, 'percent', { a: 33.33, b: 33.33, c: 33.34 }, order)
    expect(result.ok && sumMap(result.shares)).toBe(1001)
  })

  it('rejects totals other than 100', () => {
    expect(computeShares(1000, 'percent', { a: 50, b: 40 }, order)).toEqual({
      ok: false,
      reason: 'total',
      difference: -1000,
    })
    expect(computeShares(1000, 'percent', { a: 60, b: 50 }, order)).toEqual({
      ok: false,
      reason: 'total',
      difference: 1000,
    })
  })

  it('rejects more than two decimals', () => {
    expect(computeShares(1000, 'percent', { a: 33.333, b: 66.667 }, order)).toEqual({
      ok: false,
      reason: 'invalid',
    })
  })
})

describe('computeShares: shares', () => {
  it('splits 2:1:1', () => {
    expect(computeShares(100000, 'shares', { a: 2, b: 1, c: 1 }, order)).toEqual({
      ok: true,
      shares: { a: 50000, b: 25000, c: 25000 },
    })
  })

  it('handles remainders', () => {
    const result = computeShares(1000, 'shares', { a: 1, b: 1, c: 1 }, order)
    expect(result).toEqual({ ok: true, shares: { a: 334, b: 333, c: 333 } })
  })

  it('needs at least one share', () => {
    expect(computeShares(1000, 'shares', { a: 0, b: 0 }, order)).toEqual({
      ok: false,
      reason: 'none',
    })
  })
})

describe('computeShares: amount', () => {
  it('rejects zero, negative and fractional amounts', () => {
    expect(computeShares(0, 'equal', { a: 1 }, order).ok).toBe(false)
    expect(computeShares(-5, 'equal', { a: 1 }, order).ok).toBe(false)
    expect(computeShares(1.5, 'equal', { a: 1 }, order).ok).toBe(false)
  })
})

describe('percentToHundredths', () => {
  it('scales exact two-decimal percentages', () => {
    expect(percentToHundredths(33.33)).toBe(3333)
    expect(percentToHundredths(0.1)).toBe(10)
    expect(percentToHundredths(100)).toBe(10000)
    expect(percentToHundredths(33.333)).toBeNull()
    expect(percentToHundredths(-1)).toBeNull()
  })
})

describe('computePaidBy', () => {
  it('accepts one payer for the whole amount', () => {
    expect(computePaidBy(1000, { a: 1000 })).toEqual({ ok: true, paidBy: { a: 1000 } })
  })

  it('accepts several payers that add up and drops zeros', () => {
    expect(computePaidBy(1000, { a: 700, b: 300, c: 0 })).toEqual({
      ok: true,
      paidBy: { a: 700, b: 300 },
    })
  })

  it('reports a wrong total', () => {
    expect(computePaidBy(1000, { a: 700, b: 200 })).toEqual({
      ok: false,
      reason: 'total',
      difference: -100,
    })
  })

  it('needs a payer', () => {
    expect(computePaidBy(1000, {})).toEqual({ ok: false, reason: 'none' })
  })
})

describe('memberEffect', () => {
  it('is paid minus share', () => {
    const expense = { paidBy: { a: 900 }, shares: { a: 300, b: 300, c: 300 } }
    expect(memberEffect(expense, 'a')).toBe(600)
    expect(memberEffect(expense, 'b')).toBe(-300)
    expect(memberEffect(expense, 'z')).toBe(0)
  })
})
