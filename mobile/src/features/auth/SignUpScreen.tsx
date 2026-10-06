import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from 'expo-router'
import { useCallback, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useSignUpMutation } from '@/features/auth/api'
import { signUpSchema, type SignUpValues } from '@/features/auth/schemas'
import { FormTextField } from '@m/components/form/Controlled'
import { FormMessage } from '@m/components/form/FormMessage'
import { Button } from '@m/components/ui/Button'
import { Text } from '@m/components/ui/Text'
import { AuthLayout, Divider } from './AuthLayout'
import { GoogleSignInButton, googleConfigured } from './GoogleSignIn'

export function SignUpScreen() {
  const [signUp, { isLoading }] = useSignUpMutation()
  const [serverError, setServerError] = useState<string | null>(null)
  const { control, handleSubmit } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { displayName: '', email: '', password: '', confirmPassword: '' },
  })
  const onGoogleError = useCallback((message: string | null) => setServerError(message), [])

  const submit = handleSubmit(async ({ displayName, email, password }) => {
    setServerError(null)
    const result = await signUp({ displayName, email, password })
    if ('error' in result) setServerError(result.error as string)
  })

  return (
    <AuthLayout
      title="Create your account"
      description="Track spending, budgets and shared bills."
      footer={
        <>
          <Text tone="muted">Already have an account?</Text>
          <Link href="/sign-in" accessibilityRole="link">
            <Text tone="primary" weight="600">
              Sign in
            </Text>
          </Link>
        </>
      }
    >
      {serverError ? <FormMessage kind="error">{serverError}</FormMessage> : null}
      <FormTextField control={control} name="displayName" label="Name" autoComplete="name" textContentType="name" />
      <FormTextField
        control={control}
        name="email"
        label="Email"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
      />
      <FormTextField
        control={control}
        name="password"
        label="Password"
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        hint="At least 8 characters, with a letter and a number."
      />
      <FormTextField
        control={control}
        name="confirmPassword"
        label="Confirm password"
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        onSubmitEditing={() => void submit()}
      />
      <Button
        title={isLoading ? 'Creating account…' : 'Create account'}
        loading={isLoading}
        onPress={() => void submit()}
      />
      {googleConfigured() ? (
        <>
          <Divider label="or" />
          <GoogleSignInButton disabled={isLoading} onError={onGoogleError} />
        </>
      ) : null}
    </AuthLayout>
  )
}
