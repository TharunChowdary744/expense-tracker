import * as Google from 'expo-auth-session/providers/google'
import * as WebBrowser from 'expo-web-browser'
import { useEffect } from 'react'
import { Platform } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { useSignInWithGoogleMutation } from '@/features/auth/api'
import { env } from '@m/lib/env'
import { Button } from '@m/components/ui/Button'

WebBrowser.maybeCompleteAuthSession()

/** Google sign-in needs the OAuth client for this platform (see mobile/README.md). */
export function googleConfigured(): boolean {
  const { webClientId, iosClientId, androidClientId } = env.google
  if (Platform.OS === 'ios') return Boolean(iosClientId)
  if (Platform.OS === 'android') return Boolean(androidClientId)
  return Boolean(webClientId)
}

function GoogleMark() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z" />
      <Path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.1-4 1.1-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24Z" />
      <Path fill="#FBBC05" d="M5.4 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.4a12 12 0 0 0 0 10.8l4-3.1Z" />
      <Path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8Z" />
    </Svg>
  )
}

/**
 * "Continue with Google": expo-auth-session gets a Google ID token, then Firebase signs in with
 * it (signInWithCredential). Rendered only when googleConfigured() is true.
 */
export function GoogleSignInButton({
  disabled,
  onError,
}: {
  disabled?: boolean
  onError: (message: string | null) => void
}) {
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: env.google.webClientId,
    iosClientId: env.google.iosClientId,
    androidClientId: env.google.androidClientId,
    selectAccount: true,
  })
  const [signInWithGoogle, { isLoading }] = useSignInWithGoogleMutation()

  useEffect(() => {
    if (!response) return
    if (response.type === 'success') {
      const idToken = response.params.id_token
      if (!idToken) {
        onError('Google did not return a sign-in token. Try again.')
        return
      }
      void signInWithGoogle({ idToken }).then((result) => {
        if ('error' in result) onError(result.error as string)
      })
    } else if (response.type === 'error') {
      onError(response.error?.message ?? 'Google sign-in failed. Try again.')
    }
  }, [response, signInWithGoogle, onError])

  return (
    <Button
      variant="outline"
      title="Continue with Google"
      loading={isLoading}
      disabled={disabled || !request}
      leading={<GoogleMark />}
      onPress={() => {
        onError(null)
        void promptAsync()
      }}
    />
  )
}
