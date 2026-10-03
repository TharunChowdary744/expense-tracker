import { useAppSelector } from '@/app/hooks'
import type { Actor } from '../writes'

/** The signed-in user as a group actor. Only use under ProtectedRoute. */
export function useActor(): Actor & { emailVerified: boolean } {
  const user = useAppSelector((s) => s.auth.user)
  if (!user) throw new Error('useActor() needs a signed-in user')
  return {
    uid: user.uid,
    displayName: user.displayName ?? '',
    email: user.email ?? '',
    emailVerified: user.emailVerified,
  }
}
