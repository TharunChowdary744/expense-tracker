import { afterEach, describe, expect, it } from 'vitest'
import {
  clearReturnTo,
  isSafeReturnPath,
  readReturnTo,
  resolveReturnTo,
  saveReturnTo,
  toReturnPath,
} from './returnTo'

afterEach(() => sessionStorage.clear())

describe('isSafeReturnPath', () => {
  it('accepts in-app paths', () => {
    expect(isSafeReturnPath('/transactions')).toBe(true)
    expect(isSafeReturnPath('/transactions?x=1#top')).toBe(true)
  })

  it.each(['//evil.com', 'https://evil.com', '/\\evil', '', 'transactions', null, 42])(
    'rejects %s',
    (v) => expect(isSafeReturnPath(v)).toBe(false),
  )

  it('rejects auth screens to avoid redirect loops', () => {
    expect(isSafeReturnPath('/sign-in')).toBe(false)
    expect(isSafeReturnPath('/verify-email')).toBe(false)
    expect(isSafeReturnPath('/sign-in?x=1')).toBe(false)
    expect(isSafeReturnPath('/sign-instructions')).toBe(true)
  })
})

describe('return-to storage', () => {
  it('builds paths from a location', () => {
    expect(toReturnPath({ pathname: '/a', search: '?b=1', hash: '#c' })).toBe('/a?b=1#c')
  })

  it('round-trips and clears', () => {
    saveReturnTo('/budgets')
    expect(readReturnTo()).toBe('/budgets')
    clearReturnTo()
    expect(readReturnTo()).toBeNull()
  })

  it('ignores unsafe values', () => {
    saveReturnTo('//evil.com')
    expect(readReturnTo()).toBeNull()
    sessionStorage.setItem('ledgerly:returnTo', '//evil.com')
    expect(readReturnTo()).toBeNull()
  })

  it('prefers router state, then storage, then "/"', () => {
    expect(resolveReturnTo(undefined)).toBe('/')
    saveReturnTo('/budgets')
    expect(resolveReturnTo(undefined)).toBe('/budgets')
    expect(resolveReturnTo('/transactions')).toBe('/transactions')
    expect(resolveReturnTo('//evil.com')).toBe('/budgets')
  })
})
