import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from 'expo-router'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useSendPasswordResetMutation } from '@/features/auth/api'
import { forgotPasswordSchema, type ForgotPasswordValues } from '@/features/auth/schemas'
import { FormTextField } from '@m/components/form/Controlled'
import { FormMessage } from '@m/components/form/FormMessage'
import { Button } from '@m/components/ui/Button'
import { Text } from '@m/components/ui/Text'
import { AuthLayout } from './AuthLayout'

export function ForgotPasswordScreen() {
  const [send, { isLoading }] = useSendPasswordResetMutation()
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)
  const { control, handleSubmit } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  })

  const submit = handleSubmit(async ({ email }) => {
    setMessage(null)
    const result = await send({ email })
    setMessage(
      'error' in result
        ? { kind: 'error', text: result.error as string }
        : {
            kind: 'success',
            text: `If an account exists for ${email}, a reset link is on its way.`,
          },
    )
  })

  return (
    <AuthLayout
      title="Reset your password"
      description="Enter your email and we will send you a link to choose a new password."
      footer={
        <Link href="/sign-in" accessibilityRole="link">
          <Text tone="primary" weight="600">
            Back to sign in
          </Text>
        </Link>
      }
    >
      {message ? <FormMessage kind={message.kind}>{message.text}</FormMessage> : null}
      <FormTextField
        control={control}
        name="email"
        label="Email"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        onSubmitEditing={() => void submit()}
      />
      <Button
        title={isLoading ? 'Sending…' : 'Send reset link'}
        loading={isLoading}
        onPress={() => void submit()}
      />
    </AuthLayout>
  )
}
