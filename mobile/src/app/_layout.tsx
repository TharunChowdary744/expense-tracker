import '@m/lib/polyfills'
import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavigationTheme } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useState } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { Provider } from 'react-redux'
import { useAppSelector } from '@/app/hooks'
import { store } from '@/app/store'
import { useAuthStateQuery } from '@/features/auth/api'
import { needsEmailVerification } from '@/features/auth/hooks'
import { bootstrapApp } from '@m/lib/bootstrap'
import { Toaster } from '@m/components/Toaster'
import { ThemeProvider, useTheme } from '@m/theme/ThemeProvider'

void SplashScreen.preventAutoHideAsync().catch(() => undefined)

function RootNavigator() {
  useAuthStateQuery()
  const { colors, dark } = useTheme()
  const status = useAppSelector((s) => s.auth.status)
  const user = useAppSelector((s) => s.auth.user)
  const loading = status === 'loading'
  const signedIn = status === 'authenticated' && !!user
  const verified = signedIn && !needsEmailVerification(user)

  useEffect(() => {
    if (!loading) void SplashScreen.hideAsync().catch(() => undefined)
  }, [loading])

  const base = dark ? DarkTheme : DefaultTheme
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.primary,
      background: colors.background,
      card: colors.card,
      text: colors.foreground,
      border: colors.border,
      notification: colors.destructive,
    },
  }

  if (loading) return null

  return (
    <NavigationTheme value={navTheme}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !verified}>
          <Stack.Screen name="verify-email" />
        </Stack.Protected>
        <Stack.Protected guard={verified}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
      </Stack>
      <Toaster />
    </NavigationTheme>
  )
}

export default function RootLayout() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    void bootstrapApp().finally(() => setReady(true))
  }, [])
  if (!ready) return null
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Provider store={store}>
          <ThemeProvider>
            <RootNavigator />
          </ThemeProvider>
        </Provider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
