import { skipToken } from '@reduxjs/toolkit/query/react'
import { useAuth } from '@/features/auth/hooks'
import { defaultSettings } from '@/features/auth/defaults'
import { useGetUserDocQuery } from './api'

function browserLocale(): string | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator.language
}

/**
 * The signed-in user's base currency, locale and first day of the week, live from users/{uid}.
 * Until that doc has loaded (or while it is being seeded) it falls back to the same defaults
 * seeding would use.
 */
export function useUserSettings(): {
  baseCurrency: string
  locale: string
  weekStartsOn: 0 | 1
} {
  const { user } = useAuth()
  const { data } = useGetUserDocQuery(user?.uid ?? skipToken)
  const fallback = defaultSettings(browserLocale())
  return {
    baseCurrency: data?.settings.baseCurrency ?? fallback.baseCurrency,
    locale: data?.settings.locale ?? fallback.locale,
    weekStartsOn: data?.settings.weekStartsOn ?? fallback.weekStartsOn,
  }
}
