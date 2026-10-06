import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * A synchronous `localStorage` for the shared web modules (quick-add preferences, last used
 * exchange rates), backed by AsyncStorage. `hydrateLocalStorage()` loads the saved values once
 * at start-up; after that reads are from memory and writes are saved in the background.
 */
const PREFIX = 'ls:'
const memory = new Map<string, string>()

const storage: Storage = {
  get length() {
    return memory.size
  },
  key: (index) => [...memory.keys()][index] ?? null,
  getItem: (key) => memory.get(key) ?? null,
  setItem(key, value) {
    const text = String(value)
    memory.set(key, text)
    AsyncStorage.setItem(PREFIX + key, text).catch(() => undefined)
  },
  removeItem(key) {
    memory.delete(key)
    AsyncStorage.removeItem(PREFIX + key).catch(() => undefined)
  },
  clear() {
    const keys = [...memory.keys()].map((k) => PREFIX + k)
    memory.clear()
    AsyncStorage.multiRemove(keys).catch(() => undefined)
  },
}

export function installLocalStorage() {
  const g = globalThis as { localStorage?: Storage }
  if (!g.localStorage) g.localStorage = storage
}

let hydrated: Promise<void> | undefined

export function hydrateLocalStorage(): Promise<void> {
  installLocalStorage()
  hydrated ??= (async () => {
    try {
      const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX))
      const pairs = await AsyncStorage.multiGet(keys)
      for (const [key, value] of pairs) {
        if (value !== null && !memory.has(key.slice(PREFIX.length))) {
          memory.set(key.slice(PREFIX.length), value)
        }
      }
    } catch {
      // Losing saved preferences only loses convenience.
    }
  })()
  return hydrated
}
