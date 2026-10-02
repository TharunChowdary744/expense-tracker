import { describe, expect, it } from 'vitest'
import { DEFAULT_CATEGORIES, defaultCurrencyForLocale, defaultSettings } from './defaults'

describe('defaultCurrencyForLocale', () => {
  it('defaults to INR', () => {
    expect(defaultCurrencyForLocale(undefined)).toBe('INR')
    expect(defaultCurrencyForLocale('en')).toBe('INR')
    expect(defaultCurrencyForLocale('en-IN')).toBe('INR')
    expect(defaultCurrencyForLocale('not a locale!!')).toBe('INR')
  })

  it('follows an explicit region', () => {
    expect(defaultCurrencyForLocale('en-US')).toBe('USD')
    expect(defaultCurrencyForLocale('en-GB')).toBe('GBP')
    expect(defaultCurrencyForLocale('de-DE')).toBe('EUR')
  })

  it('falls back to INR for regions we do not map', () => {
    expect(defaultCurrencyForLocale('pt-BR')).toBe('INR')
  })
})

describe('defaultSettings', () => {
  it('builds settings from the locale', () => {
    const s = defaultSettings('en-US')
    expect(s).toMatchObject({
      baseCurrency: 'USD',
      locale: 'en-US',
      theme: 'system',
      weekStartsOn: 0,
    })
  })
})

describe('DEFAULT_CATEGORIES', () => {
  it('has the twelve requested categories with unique ids', () => {
    expect(DEFAULT_CATEGORIES.map((c) => c.name)).toEqual([
      'Food',
      'Transport',
      'Rent',
      'Utilities',
      'Shopping',
      'Health',
      'Entertainment',
      'Travel',
      'Education',
      'Salary',
      'Freelance',
      'Other',
    ])
    expect(new Set(DEFAULT_CATEGORIES.map((c) => c.id)).size).toBe(12)
  })

  it('marks Salary and Freelance as income', () => {
    const income = DEFAULT_CATEGORIES.filter((c) => c.kind === 'income').map((c) => c.name)
    expect(income).toEqual(['Salary', 'Freelance'])
  })
})
