import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useLocation } from 'react-router'
import { Button } from '@/components/ui/button'
import { useSignInWithGoogleMutation, useSignUpMutation } from '../api'
import { AuthLayout } from '../components/AuthLayout'
import { Divider } from '../components/Divider'
import { FormMessage } from '../components/FormMessage'
import { GoogleButton } from '../components/GoogleButton'
import { TextField } from '../components/TextField'
import { saveReturnTo } from '../returnTo'
import { signUpSchema, type SignUpValues } from '../schemas'

export function SignUpPage() {
  const location = useLocation()
  const [signUp, { isLoading }] = useSignUpMutation()
  const [signInWithGoogle, { isLoading: googleLoading }] = useSignInWithGoogleMutation()
  const [serverError, setServerError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignUpValues>({ resolver: zodResolver(signUpSchema) })

  useEffect(() => {
    const from = (location.state as { from?: string } | null)?.from
    if (from) saveReturnTo(from)
  }, [location.state])

  const busy = isLoading || googleLoading

  async function onSubmit({ displayName, email, password }: SignUpValues) {
    setServerError(null)
    const result = await signUp({ displayName, email, password })
    if ('error' in result) setServerError(result.error as string)
  }

  async function onGoogle() {
    setServerError(null)
    const result = await signInWithGoogle()
    if ('error' in result) setServerError(result.error as string)
  }

  return (
    <AuthLayout
      title="Create your account"
      description="Track expenses on your own or with a group."
      footer={
        <>
          Already have an account?{' '}
          <Link
            to="/sign-in"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {serverError && <FormMessage kind="error">{serverError}</FormMessage>}
        <TextField
          label="Name"
          autoComplete="name"
          error={errors.displayName?.message}
          {...register('displayName')}
        />
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
          autoComplete="new-password"
          hint="At least 8 characters with a letter and a number."
          error={errors.password?.message}
          {...register('password')}
        />
        <TextField
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />
        <Button type="submit" className="w-full" disabled={busy}>
          {isLoading ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
      <Divider>or</Divider>
      <GoogleButton onClick={onGoogle} disabled={busy} label="Sign up with Google" />
    </AuthLayout>
  )
}
