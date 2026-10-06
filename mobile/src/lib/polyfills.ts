import { getRandomValues } from 'expo-crypto'
import { getLocales } from 'expo-localization'
import { installLocalStorage } from './localStorage'

/**
 * Browser globals the shared web modules read: `localStorage` (quick-add preferences) and
 * `navigator.language` (default currency and locale for new users). `navigator.onLine` is kept
 * up to date by ./connectivity.ts.
 */
installLocalStorage()

// `crypto.getRandomValues` for invite tokens (Hermes has no Web Crypto).
const g = globalThis as unknown as { crypto?: { getRandomValues?: unknown } }
if (typeof g.crypto?.getRandomValues !== 'function') {
  g.crypto = { ...(g.crypto ?? {}), getRandomValues }
}

const nav = (globalThis as unknown as { navigator?: Record<string, unknown> }).navigator
if (nav && typeof nav.language !== 'string') {
  try {
    const tag = getLocales()[0]?.languageTag
    if (tag) Object.defineProperty(nav, 'language', { configurable: true, value: tag })
  } catch {
    // Shared code falls back to its own default locale.
  }
}

/**
 * `window.addEventListener` for the shared modules that listen for page events. React Native
 * has no such events, so the only one emitted is "pagehide", when the app goes to the
 * background (see emitWindowEvent): the transaction delete flow then writes deletes that are
 * still waiting for Undo, as the web app does when a tab closes.
 */
type Listener = () => void
const listeners = new Map<string, Set<Listener>>()
const win = globalThis as unknown as {
  addEventListener?: (type: string, listener: Listener) => void
  removeEventListener?: (type: string, listener: Listener) => void
}
if (typeof win.addEventListener !== 'function') {
  win.addEventListener = (type, listener) => {
    const set = listeners.get(type) ?? new Set<Listener>()
    set.add(listener)
    listeners.set(type, set)
  }
  win.removeEventListener = (type, listener) => {
    listeners.get(type)?.delete(listener)
  }
}

export function emitWindowEvent(type: string) {
  for (const listener of [...(listeners.get(type) ?? [])]) listener()
}
