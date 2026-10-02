import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { useSendPasswordResetMutation } from '../api'
import { AuthLayout } from '../components/AuthLayout'
import { FormMessage } from '../components/FormMessage'
import { TextField } from '../components/TextField'
import { forgotPasswordSchema, type ForgotPasswordValues } from '../schemas'

export function ForgotPasswordPage() {
  const [sendReset, { isLoading }] = useSendPasswordResetMutation()
  const [serverError, setServerError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordValues>({ resolver: zodResolver(forgotPasswordSchema) })

  async function onSubmit({ email }: ForgotPasswordValues) {
    setServerError(null)
    const result = await sendReset({ email })
    if ('error' in result) setServerError(result.error as string)
    else setSentTo(email)
  }

  return (
    <AuthLayout
      title="Reset your password"
      description="We will email you a link to choose a new one."
      footer={
        <Link to="/sign-in" className="font-medium text-primary underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {serverError && <FormMessage kind="error">{serverError}</FormMessage>}
        {sentTo && (
          <FormMessage kind="success">
            If an account exists for {sentTo}, a reset link is on its way. Check your spam folder
            too.
          </FormMessage>
        )}
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? 'Sending…' : sentTo ? 'Send again' : 'Send reset link'}
        </Button>
      </form>
    </AuthLayout>
  )
}
