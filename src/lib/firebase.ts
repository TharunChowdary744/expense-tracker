import { getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth'
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore'
import { connectStorageEmulator, getStorage, type FirebaseStorage } from 'firebase/storage'
import type { Messaging } from 'firebase/messaging'

export const useEmulators = import.meta.env.VITE_USE_EMULATORS === 'true'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || undefined,
}

export interface Firebase {
  app: FirebaseApp
  auth: Auth
  db: Firestore
  storage: FirebaseStorage
}

let instance: Firebase | undefined

/**
 * Lazily initialises Firebase (so the app shell renders without config) and wires the
 * emulators when VITE_USE_EMULATORS=true. Only RTK Query endpoints should call this.
 *
 * Firestore uses the persistent local cache with multi-tab support, so reads and queued
 * writes keep working offline and are shared between tabs.
 */
export function getFirebase(): Firebase {
  if (instance) return instance

  const app = getApps()[0] ?? initializeApp(firebaseConfig)
  const auth = getAuth(app)
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  })
  const storage = getStorage(app)
  // Receipt uploads are retried by their own queue (features/receipts/queue.ts), so the SDK
  // gives up sooner than its 10-minute default and lets the queue report and retry.
  storage.maxUploadRetryTime = 60_000

  if (useEmulators) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFirestoreEmulator(db, '127.0.0.1', 8080)
    connectStorageEmulator(storage, '127.0.0.1', 9199)
  }

  instance = { app, auth, db, storage }
  return instance
}

let messagingPromise: Promise<Messaging | null> | undefined

/**
 * Cloud Messaging is browser-feature dependent (service workers, Push API), so it is loaded
 * on demand and resolves to null where unsupported. Nothing calls this until the
 * notifications phase.
 */
export function getMessagingIfSupported(): Promise<Messaging | null> {
  messagingPromise ??= (async () => {
    const { getMessaging, isSupported } = await import('firebase/messaging')
    if (!(await isSupported())) return null
    return getMessaging(getFirebase().app)
  })()
  return messagingPromise
}
