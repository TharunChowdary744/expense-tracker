import { useEffect, useState } from 'react'
import {
  useRefreshUserMutation,
  useResendVerificationMutation,
  useSignOutMutation,
} from '@/features/auth/api'
import { useAuth } from '@/features/auth/hooks'
import { FormMessage } from '@m/components/form/FormMessage'
import { Button } from '@m/components/ui/Button'
import { AuthLayout } from './AuthLayout'

const RESEND_COOLDOWN_SECONDS = 60

/** Shown to email/password users until they open the verification link. */
export function VerifyEmailScreen() {
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
  }

  return (
    <AuthLayout
      title="Verify your email"
      description={
        user?.email
          ? `We sent a verification link to ${user.email}. Open it, then come back here.`
          : 'We sent you a verification link. Open it, then come back here.'
      }
    >
      {message ? <FormMessage kind={message.kind}>{message.text}</FormMessage> : null}
      <Button
        title={checking ? 'Checking…' : 'I have verified my email'}
        loading={checking}
        onPress={() => void onCheck()}
      />
      <Button
        variant="outline"
        title={cooldown > 0 ? `Resend email in ${cooldown}s` : 'Resend verification email'}
        disabled={resending || cooldown > 0}
        onPress={() => void onResend()}
      />
      <Button variant="ghost" title="Sign out" onPress={() => void signOut()} />
    </AuthLayout>
  )
}
