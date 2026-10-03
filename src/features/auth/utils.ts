import type { AuthUser } from './types'

export function userInitial(user: Pick<AuthUser, 'displayName' | 'email'>): string {
  const source = user.displayName?.trim() || user.email?.trim() || '?'
  return source.charAt(0).toUpperCase()
}
