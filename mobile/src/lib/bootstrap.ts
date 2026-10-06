import { store } from '@/app/store'
import { startPreferences } from '@m/features/preferences/storage'
import { startConnectivity } from './connectivity'
import { hydrateLocalStorage } from './localStorage'

let ready: Promise<void> | undefined

/** Everything that must be loaded from the device before the first screen renders. */
export function bootstrapApp(): Promise<void> {
  ready ??= (async () => {
    startConnectivity()
    await Promise.all([hydrateLocalStorage(), startPreferences(store)])
  })()
  return ready
}
