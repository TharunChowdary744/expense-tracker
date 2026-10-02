import { useEffect, useState } from 'react'
import { Navigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { useRefreshUserMutation, useResendVerificationMutation, useSignOutMutation } from '../api'
import { AuthLayout } from '../components/AuthLayout'
import { FormMessage } from '../components/FormMessage'
import { needsEmailVerification, useAuth } from '../hooks'
import { clearReturnTo, resolveReturnTo } from '../returnTo'

const RESEND_COOLDOWN_SECONDS = 60

export function VerifyEmailPage() {
  const { user } = useAuth()
  const [resend, { isLoading: resending }] = useResendVerificationMutation()
  const [refresh, { isLoading: checking }] = useRefreshUserMutation()
  const [signOut] = useSignOutMutation()
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  const verified = user ? !needsEmailVerification(user) : false
  useEffect(() => {
    if (verified) clearReturnTo()
  }, [verified])

  if (verified) return <Navigate to={resolveReturnTo(undefined)} replace />

  async function onResend() {
    setMessage(null)
    const result = await resend()
    if ('error' in result) {
      setMessage({ kind: 'error', text: result.error as string })
    } else {
      setMessage({ kind: 'success', text: 'Verification email sent.' })
      setCooldown(RESEND_COOLDOWN_SECONDS)
    }
  }

  async function onCheck() {
    setMessage(null)
    const result = await refresh()
    if ('error' in result) {
      setMessage({ kind: 'error', text: result.error as string })
    } else if (!result.data.emailVerified) {
      setMessage({
        kind: 'error',
        text: 'Not verified yet. Open the link in the email, then try again.',
      })
    }
    // When verified, the route guard moves the user on.
  }

  return (
    <AuthLayout
      title="Verify your email"
      description={
        user?.email
          ? `We sent a verification link to ${user.email}. Open it, then come back here.`
          : 'We sent you a verification link. Open it, then come back here.'
      }
      footer={
        <button
          type="button"
          onClick={() => signOut()}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Sign out
        </button>
      }
    >
      <div className="space-y-3">
        {message && <FormMessage kind={message.kind}>{message.text}</FormMessage>}
        <Button className="w-full" onClick={onCheck} disabled={checking}>
          {checking ? 'Checking…' : 'I have verified my email'}
        </Button>
        <Button
          variant="outline"
          className="w-full"
          onClick={onResend}
          disabled={resending || cooldown > 0}
        >
          {cooldown > 0 ? `Resend email in ${cooldown}s` : 'Resend verification email'}
        </Button>
      </div>
    </AuthLayout>
  )
}
