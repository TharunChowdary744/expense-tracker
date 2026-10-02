import { describe, expect, it } from 'vitest'
import { AuthFormError, getAuthErrorMessage } from './errors'

describe('getAuthErrorMessage', () => {
  it('maps known Firebase codes', () => {
    expect(getAuthErrorMessage({ code: 'auth/email-already-in-use' })).toMatch(/already exists/)
    expect(getAuthErrorMessage({ code: 'auth/too-many-requests' })).toMatch(/Too many attempts/)
  })

  it('does not reveal whether an account exists on sign-in failures', () => {
    const wrong = getAuthErrorMessage({ code: 'auth/wrong-password' })
    expect(getAuthErrorMessage({ code: 'auth/user-not-found' })).toBe(wrong)
    expect(getAuthErrorMessage({ code: 'auth/invalid-credential' })).toBe(wrong)
  })

  it('passes through our own form errors', () => {
    expect(getAuthErrorMessage(new AuthFormError('Pick an image under 2 MB.'))).toBe(
      'Pick an image under 2 MB.',
    )
  })

  it('falls back for unknown or non-Firebase errors', () => {
    expect(getAuthErrorMessage({ code: 'auth/nope' })).toMatch(/Something went wrong/)
    expect(getAuthErrorMessage(new Error('boom'))).toMatch(/Something went wrong/)
    expect(getAuthErrorMessage(undefined)).toMatch(/Something went wrong/)
  })
})
