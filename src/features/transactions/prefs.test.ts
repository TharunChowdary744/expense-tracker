import { describe, expect, it } from 'vitest'
import { fxPair, loadPrefs, rememberTags, rememberTransaction } from './prefs'

describe('quick-add prefs', () => {
  it('starts empty and survives bad storage', () => {
    expect(loadPrefs('u1').lastAccountId).toBeNull()
    localStorage.setItem('ledgerly:quick-add:u1', '{not json')
    expect(loadPrefs('u1').recentCategoryIds).toEqual([])
  })

  it('remembers account, recent categories, payees, tags and fx rates per user', () => {
    const base = { payee: 'Swiggy', tags: ['food'], currency: 'INR', fxRateText: null }
    rememberTransaction('u1', { ...base, accountId: 'cash', categoryId: 'c1' }, 'INR')
    rememberTransaction(
      'u1',
      { ...base, accountId: 'bank', categoryId: 'c2', currency: 'USD', fxRateText: '83.5' },
      'INR',
    )
    rememberTransaction('u1', { ...base, accountId: 'bank', categoryId: 'c1' }, 'INR')
    const prefs = loadPrefs('u1')
    expect(prefs.lastAccountId).toBe('bank')
    expect(prefs.recentCategoryIds).toEqual(['c1', 'c2'])
    expect(prefs.recentPayees).toEqual(['Swiggy'])
    expect(prefs.fxRates[fxPair('USD', 'INR')]).toBe('83.5')
    expect(loadPrefs('u2').lastAccountId).toBeNull()

    rememberTags('u1', ['travel', 'food'])
    expect(loadPrefs('u1').knownTags).toEqual(['food', 'travel'])
  })
})
