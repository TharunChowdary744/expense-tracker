import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { useToast } from '@/features/ui/hooks'
import { useChangePasswordMutation } from '../api'
import { changePasswordSchema, type ChangePasswordValues } from '../schemas'
import type { AuthUser } from '../types'
import { FormMessage } from './FormMessage'
import { TextField } from './TextField'

export function ChangePasswordForm({ user }: { user: AuthUser }) {
  const toast = useToast()
  const [changePassword, { isLoading }] = useChangePasswordMutation()
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ChangePasswordValues>({ resolver: zodResolver(changePasswordSchema) })

  const hasPassword = user.providerIds.includes('password')

  async function onSubmit({ currentPassword, newPassword }: ChangePasswordValues) {
    setError(null)
    const result = await changePassword({ currentPassword, newPassword })
    if ('error' in result) return setError(result.error as string)
    reset()
    toast({ title: 'Password changed', variant: 'success' })
  }

  return (
    <section aria-labelledby="password-heading" className="space-y-4 rounded-xl border bg-card p-5">
      <h2 id="password-heading" className="text-lg font-semibold">
        Password
      </h2>
      {!hasPassword ? (
        <p className="text-sm text-muted-foreground">
          You sign in with Google, so there is no Ledgerly password to change.
        </p>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          {error && <FormMessage kind="error">{error}</FormMessage>}
          <TextField
            label="Current password"
            type="password"
            autoComplete="current-password"
            error={errors.currentPassword?.message}
            {...register('currentPassword')}
          />
          <TextField
            label="New password"
            type="password"
            autoComplete="new-password"
            hint="At least 8 characters with a letter and a number."
            error={errors.newPassword?.message}
            {...register('newPassword')}
          />
          <TextField
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />
          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Changing…' : 'Change password'}
          </Button>
        </form>
      )}
    </section>
  )
}
