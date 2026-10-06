import NetInfo from '@react-native-community/netinfo'

/**
 * The shared web modules read `navigator.onLine` (e.g. not to wait for the server while
 * offline). React Native has no such flag, so this keeps one up to date from NetInfo and lets
 * other modules subscribe to changes.
 */
type Listener = (online: boolean) => void

let online = true
const listeners = new Set<Listener>()

export function isOnline(): boolean {
  return online
}

export function onConnectivityChange(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

let started = false

export function startConnectivity() {
  if (started) return
  started = true
  const nav = (globalThis as { navigator?: object }).navigator
  if (nav) {
    try {
      Object.defineProperty(nav, 'onLine', { configurable: true, get: () => online })
    } catch {
      // Read-only on this platform: shared code then simply assumes online.
    }
  }
  NetInfo.addEventListener((state) => {
    // `isInternetReachable` is null while unknown; only a definite false counts as offline.
    const next = state.isConnected !== false && state.isInternetReachable !== false
    if (next === online) return
    online = next
    for (const listener of listeners) listener(next)
  })
}
