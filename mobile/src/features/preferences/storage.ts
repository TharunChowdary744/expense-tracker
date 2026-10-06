import AsyncStorage from '@react-native-async-storage/async-storage'
import type { AppStore } from '@/app/store'
import { initialPreferences, preferencesLoaded, type PreferencesState } from './slice'

const KEY = 'preferences'

/** Loads saved device preferences into the store, then saves every change. */
export async function startPreferences(store: AppStore): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY)
    const saved = raw ? (JSON.parse(raw) as Partial<PreferencesState>) : {}
    store.dispatch(preferencesLoaded({ ...initialPreferences, ...saved }))
  } catch {
    store.dispatch(preferencesLoaded({}))
  }
  let last = store.getState().preferences
  store.subscribe(() => {
    const next = store.getState().preferences
    if (next === last) return
    last = next
    const { loaded: _loaded, ...rest } = next
    AsyncStorage.setItem(KEY, JSON.stringify(rest)).catch(() => undefined)
  })
}
