const MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/wrong-password': 'Incorrect email or password.',
  'auth/user-not-found': 'Incorrect email or password.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/email-already-in-use': 'An account with this email already exists. Try signing in instead.',
  'auth/weak-password': 'Choose a stronger password (at least 8 characters).',
  'auth/missing-password': 'Enter your password.',
  'auth/user-disabled': 'This account has been disabled. Contact support if this is a mistake.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
  'auth/network-request-failed': 'Network error. Check your connection and try again.',
  'auth/popup-closed-by-user': 'The Google sign-in window was closed before finishing.',
  'auth/cancelled-popup-request': 'The Google sign-in window was closed before finishing.',
  'auth/popup-blocked': 'Your browser blocked the Google sign-in window. Allow pop-ups and retry.',
  'auth/account-exists-with-different-credential':
    'An account already exists with this email using a different sign-in method.',
  'auth/requires-recent-login': 'For your security, sign in again and then retry.',
  'auth/operation-not-allowed': 'This sign-in method is not enabled yet.',
  'auth/unauthorized-domain': 'This domain is not authorised for sign-in yet.',
  'auth/invalid-api-key': 'The app is not configured with Firebase keys.',
  'auth/configuration-not-found':
    'Sign-in is not set up for this app yet (Firebase Authentication is not enabled).',
  'auth/admin-restricted-operation': 'New sign-ups are turned off for this app.',
  'auth/internal-error': 'Sign-in failed because of a problem on our side. Try again shortly.',
  'permission-denied': 'You do not have permission to do that.',
  unavailable: 'Cannot reach the server. Check your connection and try again.',
  'storage/unauthorized': 'You are not allowed to upload this file.',
  'storage/canceled': 'The upload was cancelled.',
  'storage/retry-limit-exceeded': 'The upload took too long. Check your connection and retry.',
}

const FALLBACK = 'Something went wrong. Please try again.'

/** Firebase reports a rejected or restricted API key with codes that start like this. */
const API_KEY_CODE_PREFIXES = ['auth/api-key-not-valid', 'auth/requests-from-referer']

function getCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const { code } = error
    if (typeof code === 'string') return code
  }
  return undefined
}

export function getAuthErrorCode(error: unknown): string | undefined {
  return getCode(error)
}

/**
 * Maps Firebase Auth/Firestore/Storage errors to messages that are safe and useful to show.
 * Unknown Firebase errors keep their code in the message so the real cause is visible;
 * codes never reveal anything about other users' accounts.
 */
export function getAuthErrorMessage(error: unknown): string {
  const code = getCode(error)
  if (code && MESSAGES[code]) return MESSAGES[code]
  if (code && API_KEY_CODE_PREFIXES.some((prefix) => code.startsWith(prefix))) {
    return "This site is not allowed to use the app's Firebase API key."
  }
  if (error instanceof Error && error.name === 'AuthFormError') return error.message
  if (error !== undefined) console.error('Unexpected error', error)
  return code ? `${FALLBACK} (${code})` : FALLBACK
}

/** Thrown for validation problems we detect ourselves (message is already user-facing). */
export class AuthFormError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthFormError'
  }
}
