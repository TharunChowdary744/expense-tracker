import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { useAppSelector } from '@/app/hooks'
import { PageSkeleton } from '@/app/PageSkeleton'
import { needsEmailVerification, useAuth } from '../hooks'
import { clearReturnTo, resolveReturnTo, toReturnPath } from '../returnTo'

function AuthLoading() {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <PageSkeleton />
    </div>
  )
}

interface ProtectedProps {
  /** The verify-email screen itself must be reachable while the email is unverified. */
  allowUnverified?: boolean
}

/** Signed-in users only. Remembers the requested URL so sign-in can send the user back to it. */
export function ProtectedRoute({ allowUnverified = false }: ProtectedProps) {
  const { status, user } = useAuth()
  const signedOutByUser = useAppSelector((s) => s.auth.signedOutByUser)
  const location = useLocation()

  if (status === 'loading') return <AuthLoading />
  if (!user) {
    // After an explicit sign-out the next sign-in starts at the dashboard, not the old page.
    const state = signedOutByUser ? undefined : { from: toReturnPath(location) }
    return <Navigate to="/sign-in" replace state={state} />
  }
  if (!allowUnverified && needsEmailVerification(user))
    return <Navigate to="/verify-email" replace />
  return <Outlet />
}

/** Route element for the verify-email screen. */
export function UnverifiedAllowedRoute() {
  return <ProtectedRoute allowUnverified />
}

/** Sign-in, sign-up and password reset: signed-in users are sent on to the app. */
export function PublicOnlyRoute() {
  const { status, user } = useAuth()
  const location = useLocation()
  // Keep the target while the email is still unverified; the verify screen uses and clears it.
  const arrived = user ? !needsEmailVerification(user) : false

  useEffect(() => {
    if (arrived) clearReturnTo()
  }, [arrived])

  if (status === 'loading') return <AuthLoading />
  if (user) {
    if (needsEmailVerification(user)) return <Navigate to="/verify-email" replace />
    const from = (location.state as { from?: unknown } | null)?.from
    return <Navigate to={resolveReturnTo(from)} replace />
  }
  return <Outlet />
}
