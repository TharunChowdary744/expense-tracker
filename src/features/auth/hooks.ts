import { useAppSelector } from '@/app/hooks'
import type { AuthUser } from './types'

export function useAuth() {
  const status = useAppSelector((s) => s.auth.status)
  const user = useAppSelector((s) => s.auth.user)
  return { status, user }
}

/** Email/password accounts must confirm their address; Google accounts arrive verified. */
export function needsEmailVerification(user: AuthUser): boolean {
  return !user.emailVerified && user.providerIds.includes('password')
}

/** The signed-in user's uid. Only use under ProtectedRoute, where a user always exists. */
export function useUid(): string {
  const user = useAppSelector((s) => s.auth.user)
  if (!user) throw new Error('useUid() needs a signed-in user')
  return user.uid
}
