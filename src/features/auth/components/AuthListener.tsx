import { useAuthStateQuery } from '../api'

/** Keeps the auth slice in sync with Firebase for the lifetime of the app. */
export function AuthListener() {
  useAuthStateQuery()
  return null
}
