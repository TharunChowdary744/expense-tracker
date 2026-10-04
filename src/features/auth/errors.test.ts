import { describe, expect, it, vi } from 'vitest'
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

  it('explains setup problems in the Firebase project', () => {
    expect(getAuthErrorMessage({ code: 'auth/configuration-not-found' })).toMatch(/not enabled/)
    expect(
      getAuthErrorMessage({ code: 'auth/api-key-not-valid.-please-pass-a-valid-api-key.' }),
    ).toMatch(/API key/)
    expect(getAuthErrorMessage({ code: 'permission-denied' })).toMatch(/permission/)
  })

  it('falls back for unknown or non-Firebase errors', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(getAuthErrorMessage({ code: 'auth/nope' })).toBe(
      'Something went wrong. Please try again. (auth/nope)',
    )
    expect(getAuthErrorMessage(new Error('boom'))).toBe('Something went wrong. Please try again.')
    expect(getAuthErrorMessage(undefined)).toBe('Something went wrong. Please try again.')
  })
})
