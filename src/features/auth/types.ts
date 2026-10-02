/** Serialisable subset of the Firebase `User`; safe to keep in Redux. */
export interface AuthUser {
  uid: string
  email: string | null
  displayName: string | null
  photoURL: string | null
  emailVerified: boolean
  providerIds: string[]
}

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

export type BootstrapStatus = 'idle' | 'running' | 'done' | 'error'
