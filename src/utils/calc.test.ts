import { describe, expect, it } from 'vitest'
import { evaluateAmount, isExpression } from './calc'

describe('evaluateAmount', () => {
  it('parses plain amounts', () => {
    expect(evaluateAmount('12', 'INR')).toBe(1200)
    expect(evaluateAmount('1,234.5', 'INR')).toBe(123450)
    expect(evaluateAmount('.5', 'USD')).toBe(50)
    expect(evaluateAmount('1500', 'JPY')).toBe(1500)
  })

  it('respects operator precedence and is exact', () => {
    expect(evaluateAmount('120+45.5', 'INR')).toBe(16550)
    expect(evaluateAmount('10+2×3', 'INR')).toBe(1600)
    expect(evaluateAmount('100-20*2', 'INR')).toBe(6000)
    expect(evaluateAmount('0.1+0.2', 'USD')).toBe(30)
    expect(evaluateAmount('1200 ÷ 3', 'INR')).toBe(40000)
    expect(evaluateAmount('10x3', 'INR')).toBe(3000)
    expect(evaluateAmount('50−20', 'INR')).toBe(3000)
  })

  it('rounds only the final result, half away from zero', () => {
    expect(evaluateAmount('100/3', 'INR')).toBe(3333)
    expect(evaluateAmount('200/3', 'INR')).toBe(6667)
    expect(evaluateAmount('0.005', 'USD')).toBe(1)
    expect(evaluateAmount('1-1.005', 'USD')).toBe(-1)
    expect(evaluateAmount('1-1.004', 'USD')).toBe(0)
  })

  it('ignores a trailing operator', () => {
    expect(evaluateAmount('12+', 'INR')).toBe(1200)
  })

  it('rejects malformed input', () => {
    expect(() => evaluateAmount('', 'INR')).toThrow(/Enter an amount/)
    expect(() => evaluateAmount('+', 'INR')).toThrow(/Enter an amount/)
    expect(() => evaluateAmount('+5', 'INR')).toThrow(/Two operators/)
    expect(() => evaluateAmount('5++5', 'INR')).toThrow(/Two operators/)
    expect(() => evaluateAmount('5*/5', 'INR')).toThrow(/Two operators/)
    expect(() => evaluateAmount('5/0', 'INR')).toThrow(/divide by zero/)
    expect(() => evaluateAmount('abc', 'INR')).toThrow(/Unexpected/)
    expect(() => evaluateAmount('1.2.3', 'INR')).toThrow(/Missing operator/)
    expect(() => evaluateAmount('99999999999999999', 'INR')).toThrow(/too large/)
  })
})

describe('isExpression', () => {
  it('detects operators between numbers', () => {
    expect(isExpression('12+3')).toBe(true)
    expect(isExpression('12 × 3')).toBe(true)
    expect(isExpression('12')).toBe(false)
    expect(isExpression('12+')).toBe(false)
  })
})
