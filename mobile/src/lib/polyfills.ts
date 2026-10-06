import { getLocales } from 'expo-localization'
import { installLocalStorage } from './localStorage'

/**
 * Browser globals the shared web modules read: `localStorage` (quick-add preferences) and
 * `navigator.language` (default currency and locale for new users). `navigator.onLine` is kept
 * up to date by ./connectivity.ts.
 */
installLocalStorage()

const nav = (globalThis as unknown as { navigator?: Record<string, unknown> }).navigator
if (nav && typeof nav.language !== 'string') {
  try {
    const tag = getLocales()[0]?.languageTag
    if (tag) Object.defineProperty(nav, 'language', { configurable: true, value: tag })
  } catch {
    // Shared code falls back to its own default locale.
  }
}
