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
  'storage/unauthorized': 'You are not allowed to upload this file.',
  'storage/canceled': 'The upload was cancelled.',
  'storage/retry-limit-exceeded': 'The upload took too long. Check your connection and retry.',
}

const FALLBACK = 'Something went wrong. Please try again.'

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

/** Maps Firebase Auth/Storage errors to messages that are safe and useful to show. */
export function getAuthErrorMessage(error: unknown): string {
  const code = getCode(error)
  if (code && MESSAGES[code]) return MESSAGES[code]
  if (error instanceof Error && error.name === 'AuthFormError') return error.message
  return FALLBACK
}

/** Thrown for validation problems we detect ourselves (message is already user-facing). */
export class AuthFormError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthFormError'
  }
}
