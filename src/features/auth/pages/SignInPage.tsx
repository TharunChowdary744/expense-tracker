import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useLocation } from 'react-router'
import { Button } from '@/components/ui/button'
import { useSignInMutation, useSignInWithGoogleMutation } from '../api'
import { AuthLayout } from '../components/AuthLayout'
import { Divider } from '../components/Divider'
import { FormMessage } from '../components/FormMessage'
import { GoogleButton } from '../components/GoogleButton'
import { TextField } from '../components/TextField'
import { saveReturnTo } from '../returnTo'
import { signInSchema, type SignInValues } from '../schemas'

export function SignInPage() {
  const location = useLocation()
  const [signIn, { isLoading }] = useSignInMutation()
  const [signInWithGoogle, { isLoading: googleLoading }] = useSignInWithGoogleMutation()
  const [serverError, setServerError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInValues>({ resolver: zodResolver(signInSchema) })

  // The Google redirect flow reloads the page, so keep the target somewhere that survives it.
  useEffect(() => {
    const from = (location.state as { from?: string } | null)?.from
    if (from) saveReturnTo(from)
  }, [location.state])

  const busy = isLoading || googleLoading

  async function onSubmit(values: SignInValues) {
    setServerError(null)
    const result = await signIn(values)
    if ('error' in result) setServerError(result.error as string)
  }

  async function onGoogle() {
    setServerError(null)
    const result = await signInWithGoogle()
    if ('error' in result) setServerError(result.error as string)
  }

  return (
    <AuthLayout
      title="Sign in"
      description="Welcome back to Ledgerly."
      footer={
        <>
          New here?{' '}
          <Link
            to="/sign-up"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {serverError && <FormMessage kind="error">{serverError}</FormMessage>}
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <div className="text-right text-sm">
          <Link to="/forgot-password" className="text-primary underline-offset-4 hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" className="w-full" disabled={busy}>
          {isLoading ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
      <Divider>or</Divider>
      <GoogleButton onClick={onGoogle} disabled={busy} />
    </AuthLayout>
  )
}
