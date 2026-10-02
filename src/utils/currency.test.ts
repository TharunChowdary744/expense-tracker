import { describe, expect, it } from 'vitest'
import { currencyName, currencyOptions } from './currency'

describe('currency', () => {
  it('names currencies in the locale', () => {
    expect(currencyName('USD', 'en')).toBe('US Dollar')
    expect(currencyName('INR', 'en')).toBe('Indian Rupee')
  })

  it('falls back to the code for unusable input', () => {
    expect(currencyName('USD', 'not a locale!')).toBe('USD')
  })

  it('keeps an unlisted current currency in the options', () => {
    const options = currencyOptions('en', 'ISK')
    expect(options[0]).toEqual({ value: 'ISK', label: expect.stringContaining('ISK') })
    expect(currencyOptions('en', 'INR').filter((o) => o.value === 'INR')).toHaveLength(1)
  })
})
