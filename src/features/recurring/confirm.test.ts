import { describe, expect, it } from 'vitest'
import { confirmFormSchema } from './confirm'

describe('confirmFormSchema', () => {
  const inr = confirmFormSchema({ currency: 'INR', baseCurrency: 'INR', fxRateToBase: 1 })
  const usd = confirmFormSchema({ currency: 'USD', baseCurrency: 'INR', fxRateToBase: 83.5 })

  it('accepts a changed amount or a sum', () => {
    expect(inr.parse({ amount: '26000' })).toEqual({ amount: 2600000, baseAmount: 2600000 })
    expect(inr.parse({ amount: '25000+1000' })).toEqual({ amount: 2600000, baseAmount: 2600000 })
  })

  it("converts with the rule's rate", () => {
    expect(usd.parse({ amount: '12.50' })).toEqual({ amount: 1250, baseAmount: 104375 })
  })

  it('rejects empty, zero and nonsense', () => {
    expect(inr.safeParse({ amount: '' }).success).toBe(false)
    expect(inr.safeParse({ amount: '0' }).success).toBe(false)
    expect(inr.safeParse({ amount: 'abc' }).success).toBe(false)
  })
})
