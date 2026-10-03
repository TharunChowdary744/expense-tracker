import { describe, expect, it } from 'vitest'
import {
  authReducer,
  authStateChanged,
  bootstrapStatusChanged,
  signOutRequested,
  userUpdated,
  type AuthState,
} from './slice'
import type { AuthUser } from './types'

const user: AuthUser = {
  uid: 'u1',
  email: 'a@example.com',
  displayName: 'Ada',
  photoURL: null,
  emailVerified: true,
  providerIds: ['password'],
}

const initial = authReducer(undefined, { type: 'init' })

describe('auth slice', () => {
  it('starts in loading with no user', () => {
    expect(initial).toEqual({
      status: 'loading',
      user: null,
      bootstrap: 'idle',
      signedOutByUser: false,
    })
  })

  it('marks authenticated when a user arrives and unauthenticated when null', () => {
    const signedIn = authReducer(initial, authStateChanged(user))
    expect(signedIn.status).toBe('authenticated')
    expect(signedIn.user).toEqual(user)
    expect(authReducer(signedIn, authStateChanged(null))).toMatchObject({
      status: 'unauthenticated',
      user: null,
    })
  })

  it('resets bootstrap when the uid changes but not on a refresh of the same user', () => {
    const done: AuthState = {
      status: 'authenticated',
      user,
      bootstrap: 'done',
      signedOutByUser: false,
    }
    expect(authReducer(done, authStateChanged({ ...user }))).toHaveProperty('bootstrap', 'done')
    expect(authReducer(done, authStateChanged({ ...user, uid: 'u2' }))).toHaveProperty(
      'bootstrap',
      'idle',
    )
  })

  it('applies userUpdated only to the current user', () => {
    const signedIn = authReducer(initial, authStateChanged(user))
    const renamed = authReducer(signedIn, userUpdated({ ...user, displayName: 'Grace' }))
    expect(renamed.user?.displayName).toBe('Grace')
    const other = authReducer(signedIn, userUpdated({ ...user, uid: 'zzz', displayName: 'X' }))
    expect(other.user?.displayName).toBe('Ada')
  })

  it('tracks bootstrap status', () => {
    expect(authReducer(initial, bootstrapStatusChanged('running')).bootstrap).toBe('running')
  })

  it('remembers an explicit sign-out until the next sign-in', () => {
    const signedIn = authReducer(initial, authStateChanged(user))
    const requested = authReducer(signedIn, signOutRequested())
    const out = authReducer(requested, authStateChanged(null))
    expect(out.signedOutByUser).toBe(true)
    expect(authReducer(out, authStateChanged(user)).signedOutByUser).toBe(false)
  })
})
