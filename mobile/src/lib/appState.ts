import { AppState, type AppStateStatus } from 'react-native'
import { emitWindowEvent } from './polyfills'

type Listener = () => void

const foregroundListeners = new Set<Listener>()
let last: AppStateStatus = AppState.currentState
let started = false

/** Calls `listener` each time the app comes back to the foreground. */
export function onAppForeground(listener: Listener): () => void {
  foregroundListeners.add(listener)
  return () => foregroundListeners.delete(listener)
}

/** Tracks foreground/background: background emits "pagehide" for the shared modules. */
export function startAppState() {
  if (started) return
  started = true
  AppState.addEventListener('change', (next) => {
    if (next === 'background') emitWindowEvent('pagehide')
    if (next === 'active' && last !== 'active') {
      for (const listener of [...foregroundListeners]) listener()
    }
    last = next
  })
}
