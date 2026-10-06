import { env } from '@m/lib/env'

/**
 * Receipts are off unless the build sets EXPO_PUBLIC_RECEIPTS_ENABLED=true, matching the web
 * app's VITE_RECEIPTS_ENABLED. When off, no receipt UI shows and nothing touches Storage.
 */
export const receiptsEnabled = env.receiptsEnabled
