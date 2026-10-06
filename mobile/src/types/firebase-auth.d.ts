import type { Persistence, ReactNativeAsyncStorage } from '@firebase/auth'

// Firebase's package exports list the generic `types` before the `react-native` build, so
// TypeScript doesn't see this React Native-only export. Metro loads the React Native build.
declare module '@firebase/auth' {
  export function getReactNativePersistence(storage: ReactNativeAsyncStorage): Persistence
}
