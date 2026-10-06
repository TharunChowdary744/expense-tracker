import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from 'expo-router'
import { useCallback, useState } from 'react'
import { useForm } from 'react-hook-form'
import { View } from 'react-native'
import { useSignInMutation } from '@/features/auth/api'
import { signInSchema, type SignInValues } from '@/features/auth/schemas'
import { FormTextField } from '@m/components/form/Controlled'
import { FormMessage } from '@m/components/form/FormMessage'
import { Button } from '@m/components/ui/Button'
import { Text } from '@m/components/ui/Text'
import { AuthLayout, Divider } from './AuthLayout'
import { GoogleSignInButton, googleConfigured } from './GoogleSignIn'

export function SignInScreen() {
  const [signIn, { isLoading }] = useSignInMutation()
  const [serverError, setServerError] = useState<string | null>(null)
  const { control, handleSubmit } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  })
  const onGoogleError = useCallback((message: string | null) => setServerError(message), [])

  const submit = handleSubmit(async (values) => {
    setServerError(null)
    const result = await signIn(values)
    if ('error' in result) setServerError(result.error as string)
  })

  return (
    <AuthLayout
      title="Sign in"
      description="Welcome back to Ledgerly."
      footer={
        <>
          <Text tone="muted">New here?</Text>
          <Link href="/sign-up" accessibilityRole="link">
            <Text tone="primary" weight="600">
              Create an account
            </Text>
          </Link>
        </>
      }
    >
      {serverError ? <FormMessage kind="error">{serverError}</FormMessage> : null}
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
        autoComplete="current-password"
        textContentType="password"
        onSubmitEditing={() => void submit()}
      />
      <View style={{ alignItems: 'flex-end' }}>
        <Link href="/forgot-password" accessibilityRole="link">
          <Text tone="primary">Forgot password?</Text>
        </Link>
      </View>
      <Button
        title={isLoading ? 'Signing in…' : 'Sign in'}
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
