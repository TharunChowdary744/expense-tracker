import { describe, expect, it } from 'vitest'
import {
  changePasswordSchema,
  forgotPasswordSchema,
  profileSchema,
  signInSchema,
  signUpSchema,
} from './schemas'

function messages(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.error?.issues.map((i) => i.message) ?? []
}

describe('signInSchema', () => {
  it('accepts valid input and trims the email', () => {
    const r = signInSchema.parse({ email: ' a@example.com ', password: 'x' })
    expect(r.email).toBe('a@example.com')
  })

  it('rejects bad email and empty password', () => {
    const r = signInSchema.safeParse({ email: 'nope', password: '' })
    expect(messages(r)).toEqual(
      expect.arrayContaining(['Enter a valid email', 'Enter your password']),
    )
  })
})

describe('signUpSchema', () => {
  const ok = {
    displayName: 'Ada',
    email: 'ada@example.com',
    password: 'abcdef12',
    confirmPassword: 'abcdef12',
  }

  it('accepts a valid sign-up', () => {
    expect(signUpSchema.safeParse(ok).success).toBe(true)
  })

  it.each([
    ['short', 'abc12', 'Use at least 8 characters'],
    ['no number', 'abcdefgh', 'Include at least one number'],
    ['no letter', '12345678', 'Include at least one letter'],
  ])('rejects a password with %s', (_, password, message) => {
    const r = signUpSchema.safeParse({ ...ok, password, confirmPassword: password })
    expect(messages(r)).toContain(message)
  })

  it('rejects mismatched confirmation', () => {
    const r = signUpSchema.safeParse({ ...ok, confirmPassword: 'different1' })
    expect(messages(r)).toContain('Passwords do not match')
  })

  it('requires a name', () => {
    expect(messages(signUpSchema.safeParse({ ...ok, displayName: '  ' }))).toContain(
      'Enter your name',
    )
  })
})

describe('forgotPasswordSchema / profileSchema', () => {
  it('validates email', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'x' }).success).toBe(false)
    expect(forgotPasswordSchema.safeParse({ email: 'x@y.co' }).success).toBe(true)
  })

  it('limits display name length', () => {
    expect(profileSchema.safeParse({ displayName: 'a'.repeat(61) }).success).toBe(false)
    expect(profileSchema.safeParse({ displayName: 'Ada' }).success).toBe(true)
  })
})

describe('changePasswordSchema', () => {
  it('requires a new password that differs from the current one', () => {
    const r = changePasswordSchema.safeParse({
      currentPassword: 'abcdef12',
      newPassword: 'abcdef12',
      confirmPassword: 'abcdef12',
    })
    expect(messages(r)).toContain('Choose a password different from the current one')
  })

  it('accepts a valid change', () => {
    expect(
      changePasswordSchema.safeParse({
        currentPassword: 'old-password1',
        newPassword: 'newpassw0rd',
        confirmPassword: 'newpassw0rd',
      }).success,
    ).toBe(true)
  })
})
