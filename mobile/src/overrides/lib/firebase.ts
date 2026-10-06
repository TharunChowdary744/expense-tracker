import AsyncStorage from '@react-native-async-storage/async-storage'
import { getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import { getReactNativePersistence } from '@firebase/auth'
import { connectAuthEmulator, getAuth, initializeAuth, type Auth } from 'firebase/auth'
import {
  connectFirestoreEmulator,
  initializeFirestore,
  memoryLocalCache,
  type Firestore,
} from 'firebase/firestore'
import { connectStorageEmulator, getStorage, type FirebaseStorage } from 'firebase/storage'
import { env, isFirebaseConfigured } from '@m/lib/env'

/**
 * React Native replacement for the web app's src/lib/firebase.ts (same exports).
 *
 * - Auth keeps the session in AsyncStorage, so the user stays signed in between launches.
 * - Firestore uses the in-memory cache: the JS SDK has no IndexedDB on React Native. Reads and
 *   queued writes work offline while the app is running; see mobile/README.md.
 */
export const useEmulators = env.useEmulators

export interface Firebase {
  app: FirebaseApp
  auth: Auth
  db: Firestore
  storage: FirebaseStorage
}

let instance: Firebase | undefined

export function getFirebase(): Firebase {
  if (instance) return instance
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured. Set the EXPO_PUBLIC_FIREBASE_* values.')
  }

  const existing = getApps()[0]
  const app = existing ?? initializeApp(env.firebase)
  const auth = existing
    ? getAuth(app)
    : initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) })
  const db = initializeFirestore(app, {
    localCache: memoryLocalCache(),
    // Some mobile networks and proxies break WebChannel streaming; this picks long polling there.
    experimentalAutoDetectLongPolling: true,
  })
  const storage = getStorage(app)
  storage.maxUploadRetryTime = 60_000

  if (useEmulators) {
    const host = env.emulatorHost
    connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true })
    connectFirestoreEmulator(db, host, 8080)
    connectStorageEmulator(storage, host, 9199)
  }

  instance = { app, auth, db, storage }
  return instance
}

/** Web push is not used on mobile; device notifications go through expo-notifications. */
export function getMessagingIfSupported(): Promise<null> {
  return Promise.resolve(null)
}
