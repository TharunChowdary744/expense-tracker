import { describe, expect, it } from 'vitest'
import {
  allocate,
  convertMinor,
  currencyDigits,
  formatMoney,
  fromMinor,
  isMinor,
  isValidRate,
  toMinor,
} from './money'

/** Intl output uses narrow/no-break spaces in some locales; normalise for readable asserts. */
const plain = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ')

describe('currencyDigits', () => {
  it('knows the minor-unit digits per currency', () => {
    expect(currencyDigits('INR')).toBe(2)
    expect(currencyDigits('usd')).toBe(2)
    expect(currencyDigits('JPY')).toBe(0)
    expect(currencyDigits('KWD')).toBe(3)
    // Cached path.
    expect(currencyDigits('JPY')).toBe(0)
  })

  it('rejects malformed codes', () => {
    expect(() => currencyDigits('RUPEES')).toThrow(RangeError)
  })
})

describe('toMinor', () => {
  it('parses plain and grouped decimal strings', () => {
    expect(toMinor('12.34', 'INR')).toBe(1234)
    expect(toMinor('1,234.5', 'USD')).toBe(123450)
    expect(toMinor(' 1 000 ', 'EUR')).toBe(100000)
    expect(toMinor('1_000.01', 'EUR')).toBe(100001)
    expect(toMinor('.5', 'USD')).toBe(50)
    expect(toMinor('7.', 'USD')).toBe(700)
    expect(toMinor('+3', 'USD')).toBe(300)
  })

  it('handles zero and never returns negative zero', () => {
    expect(toMinor('0', 'INR')).toBe(0)
    expect(Object.is(toMinor('-0', 'INR'), 0)).toBe(true)
    expect(Object.is(toMinor('-0.001', 'INR'), 0)).toBe(true)
    expect(toMinor(0, 'INR')).toBe(0)
  })

  it('handles negative amounts', () => {
    expect(toMinor('-12.34', 'INR')).toBe(-1234)
    expect(toMinor(-0.5, 'USD')).toBe(-50)
    expect(toMinor('-1,000', 'JPY')).toBe(-1000)
  })

  it('respects currencies with zero and three digits', () => {
    expect(toMinor('1500', 'JPY')).toBe(1500)
    expect(toMinor('1500.4', 'JPY')).toBe(1500)
    expect(toMinor('1.234', 'KWD')).toBe(1234)
  })

  it('rounds extra decimals half away from zero', () => {
    expect(toMinor('0.005', 'USD')).toBe(1)
    expect(toMinor('0.004', 'USD')).toBe(0)
    expect(toMinor('-0.005', 'USD')).toBe(-1)
    expect(toMinor('1.999', 'USD')).toBe(200)
    expect(toMinor('1500.5', 'JPY')).toBe(1501)
  })

  it('accepts numbers without float drift', () => {
    expect(toMinor(0.1 + 0.2, 'USD')).toBe(30)
    expect(toMinor(19.99, 'USD')).toBe(1999)
    expect(toMinor(1e-7, 'USD')).toBe(0)
    expect(toMinor(5e-3, 'USD')).toBe(1)
  })

  it('rejects invalid input', () => {
    for (const bad of ['', ' ', '-', '.', 'abc', '1.2.3', '1e5', '12$', '--1']) {
      expect(() => toMinor(bad, 'USD'), bad).toThrow(RangeError)
    }
    expect(() => toMinor(Number.NaN, 'USD')).toThrow(RangeError)
    expect(() => toMinor(Number.POSITIVE_INFINITY, 'USD')).toThrow(RangeError)
    expect(() => toMinor(1e21, 'USD')).toThrow(RangeError)
  })

  it('rejects amounts beyond the safe integer range', () => {
    expect(() => toMinor('90071992547409.92', 'USD')).toThrow(/too large/)
    expect(toMinor('90071992547409.91', 'USD')).toBe(Number.MAX_SAFE_INTEGER)
  })
})

describe('fromMinor', () => {
  it('returns exact decimal strings', () => {
    expect(fromMinor(1234, 'INR')).toBe('12.34')
    expect(fromMinor(5, 'USD')).toBe('0.05')
    expect(fromMinor(1500, 'JPY')).toBe('1500')
    expect(fromMinor(1, 'KWD')).toBe('0.001')
  })

  it('handles zero and negatives', () => {
    expect(fromMinor(0, 'USD')).toBe('0.00')
    expect(fromMinor(-0, 'USD')).toBe('0.00')
    expect(fromMinor(-1230, 'EUR')).toBe('-12.30')
    expect(fromMinor(-7, 'JPY')).toBe('-7')
  })

  it('round-trips with toMinor', () => {
    for (const minor of [0, 1, -1, 99, 100, -100, 123456789, Number.MAX_SAFE_INTEGER]) {
      expect(toMinor(fromMinor(minor, 'USD'), 'USD')).toBe(minor)
    }
  })

  it('rejects non-integer minor units', () => {
    expect(() => fromMinor(1.5, 'USD')).toThrow(RangeError)
    expect(() => fromMinor(Number.NaN, 'USD')).toThrow(RangeError)
  })
})

describe('formatMoney', () => {
  it('shows the right symbol for INR, USD and EUR', () => {
    expect(formatMoney(123456, 'INR', 'en-IN')).toBe('₹1,234.56')
    expect(formatMoney(123456, 'USD', 'en-US')).toBe('$1,234.56')
    expect(plain(formatMoney(123456, 'EUR', 'de-DE'))).toBe('1.234,56 €')
    expect(formatMoney(123456, 'EUR', 'en-IE')).toBe('€1,234.56')
  })

  it('uses Indian digit grouping for en-IN', () => {
    expect(formatMoney(1234567890, 'INR', 'en-IN')).toBe('₹1,23,45,678.90')
  })

  it('formats zero and negative amounts', () => {
    expect(formatMoney(0, 'USD', 'en-US')).toBe('$0.00')
    expect(formatMoney(-5, 'USD', 'en-US')).toBe('-$0.05')
    expect(formatMoney(-123456, 'INR', 'en-IN')).toBe('-₹1,234.56')
  })

  it('uses the currency digits', () => {
    expect(formatMoney(1500, 'JPY', 'en-US')).toBe('¥1,500')
    expect(plain(formatMoney(1234, 'KWD', 'en-US'))).toBe('KWD 1.234')
  })

  it('formats the largest safe amount exactly', () => {
    expect(formatMoney(Number.MAX_SAFE_INTEGER, 'USD', 'en-US')).toBe('$90,071,992,547,409.91')
  })

  it('passes display options through', () => {
    expect(formatMoney(500, 'USD', 'en-US', { signDisplay: 'always' })).toBe('+$5.00')
    expect(plain(formatMoney(500, 'USD', 'en-US', { currencyDisplay: 'code' }))).toBe('USD 5.00')
  })

  it('works with the default locale', () => {
    expect(formatMoney(100, 'USD')).toMatch(/1/)
  })
})

describe('allocate', () => {
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

  it('splits evenly when it can', () => {
    expect(allocate(300, [1, 1, 1])).toEqual([100, 100, 100])
  })

  it('gives leftover units to the earliest parts on ties', () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33])
    expect(allocate(101, [1, 1, 1])).toEqual([34, 34, 33])
    expect(allocate(5, [1, 1, 1, 1, 1, 1, 1])).toEqual([1, 1, 1, 1, 1, 0, 0])
  })

  it('gives leftover units to the largest remainders first', () => {
    // Exact shares: 32.9967, 16.5033, 49.5 → floors 32, 16, 49 (97), two left over,
    // which go to the largest remainders: .9967 (index 0) then .5033 (index 1).
    expect(allocate(99, [33.33, 16.67, 50])).toEqual([33, 17, 49])
    expect(allocate(10, [3, 7])).toEqual([3, 7])
    expect(allocate(1, [1, 2])).toEqual([0, 1])
  })

  it('supports percentage weights with decimals', () => {
    const parts = allocate(10000, [33.33, 33.33, 33.34])
    expect(parts).toEqual([3333, 3333, 3334])
    expect(sum(parts)).toBe(10000)
  })

  it('handles zero totals and zero weights', () => {
    expect(allocate(0, [1, 2, 3])).toEqual([0, 0, 0])
    expect(allocate(100, [0, 1, 0])).toEqual([0, 100, 0])
    expect(allocate(7, [0, 1, 1])).toEqual([0, 4, 3])
  })

  it('splits negative totals symmetrically', () => {
    expect(allocate(-100, [1, 1, 1])).toEqual([-34, -33, -33])
    expect(allocate(-1, [1, 1])).toEqual([-1, 0])
    expect(allocate(-1, [1, 1]).every((x) => !Object.is(x, -0))).toBe(true)
  })

  it('handles a single part and large totals', () => {
    expect(allocate(12345, [7])).toEqual([12345])
    const big = Number.MAX_SAFE_INTEGER
    const parts = allocate(big, [1, 1, 1])
    expect(parts.reduce((a, b) => BigInt(a) + BigInt(b), 0n)).toBe(BigInt(big))
  })

  it('always sums to the total', () => {
    const cases: [number, number[]][] = [
      [1000, [1, 2, 3, 4]],
      [9999, [0.1, 0.2, 0.7]],
      [-777, [5, 3, 1]],
      [1, [1, 1, 1, 1]],
      [123456, [1e-7, 2e-7]],
    ]
    for (const [total, weights] of cases) {
      expect(sum(allocate(total, weights))).toBe(total)
    }
  })

  it('rejects invalid input', () => {
    expect(() => allocate(100, [])).toThrow(/at least one weight/)
    expect(() => allocate(100, [0, 0])).toThrow(/positive/)
    expect(() => allocate(100, [1, -1])).toThrow(/non-negative/)
    expect(() => allocate(100, [Number.NaN])).toThrow(/non-negative/)
    expect(() => allocate(100, [Number.POSITIVE_INFINITY])).toThrow(/non-negative/)
    expect(() => allocate(1.5, [1])).toThrow(/safe integer/)
  })
})

describe('isMinor', () => {
  it('accepts safe integers only', () => {
    expect(isMinor(0)).toBe(true)
    expect(isMinor(-150)).toBe(true)
    expect(isMinor(1.5)).toBe(false)
    expect(isMinor('100')).toBe(false)
    expect(isMinor(Number.MAX_SAFE_INTEGER + 1)).toBe(false)
  })
})

describe('isValidRate', () => {
  it('accepts positive decimal strings', () => {
    expect(isValidRate('83.25')).toBe(true)
    expect(isValidRate(' 1 ')).toBe(true)
    expect(isValidRate('0.0000000001')).toBe(true)
  })

  it('rejects zero, signs, exponents and too many digits', () => {
    expect(isValidRate('0')).toBe(false)
    expect(isValidRate('0.000')).toBe(false)
    expect(isValidRate('-1')).toBe(false)
    expect(isValidRate('1e3')).toBe(false)
    expect(isValidRate('1.')).toBe(false)
    expect(isValidRate('')).toBe(false)
    expect(isValidRate('0.00000000001')).toBe(false)
    expect(isValidRate('1234567890123')).toBe(false)
  })
})

describe('convertMinor', () => {
  it('converts between currencies with different minor digits', () => {
    expect(convertMinor(1250, 'USD', 'INR', '83.5')).toBe(104375)
    expect(convertMinor(1000, 'JPY', 'INR', '0.56')).toBe(56000)
    expect(convertMinor(100000, 'INR', 'JPY', '1.79')).toBe(1790)
    expect(convertMinor(1000, 'KWD', 'USD', '3.25')).toBe(325)
  })

  it('rounds half away from zero', () => {
    expect(convertMinor(1, 'USD', 'INR', '0.5')).toBe(1)
    expect(convertMinor(1, 'USD', 'INR', '0.49')).toBe(0)
    expect(convertMinor(-1, 'USD', 'INR', '0.5')).toBe(-1)
    expect(convertMinor(-1, 'USD', 'INR', '0.4')).toBe(0)
    expect(Object.is(convertMinor(-1, 'USD', 'INR', '0.4'), 0)).toBe(true)
  })

  it('is exact for large amounts', () => {
    expect(convertMinor(900719925474099, 'USD', 'USD', '1')).toBe(900719925474099)
  })

  it('rejects invalid input', () => {
    expect(() => convertMinor(100, 'USD', 'INR', '0')).toThrow(/exchange rate/)
    expect(() => convertMinor(1.5, 'USD', 'INR', '1')).toThrow(/safe integer/)
    expect(() => convertMinor(Number.MAX_SAFE_INTEGER, 'USD', 'INR', '2')).toThrow(/too large/)
  })
})
