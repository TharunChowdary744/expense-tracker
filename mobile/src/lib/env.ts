/**
 * Build-time configuration. Expo inlines `process.env.EXPO_PUBLIC_*` when it bundles the app,
 * so these are fixed per build (see .env.example and docs in mobile/README.md).
 */
export const env = {
  firebase: {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  },
  useEmulators: process.env.EXPO_PUBLIC_USE_EMULATORS === 'true',
  /** Host the emulators are reached on: 10.0.2.2 from the Android emulator, LAN IP from a phone. */
  emulatorHost: process.env.EXPO_PUBLIC_EMULATOR_HOST || '127.0.0.1',
  receiptsEnabled: process.env.EXPO_PUBLIC_RECEIPTS_ENABLED === 'true',
  google: {
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  },
  /** The web app's address, used for group invite links that anyone can open. */
  webAppUrl: (process.env.EXPO_PUBLIC_WEB_APP_URL || '').replace(/\/+$/, ''),
} as const

export function isFirebaseConfigured(): boolean {
  return Boolean(env.firebase.apiKey && env.firebase.projectId && env.firebase.appId)
}
