const KEY = 'ledgerly:returnTo'
const AUTH_PATHS = ['/sign-in', '/sign-up', '/forgot-password', '/verify-email']

interface PathLike {
  pathname: string
  search?: string
  hash?: string
}

export function toReturnPath(location: PathLike): string {
  return `${location.pathname}${location.search ?? ''}${location.hash ?? ''}`
}

/** Only same-origin app paths that are not auth screens may be used as a redirect target. */
export function isSafeReturnPath(path: unknown): path is string {
  if (typeof path !== 'string') return false
  if (!path.startsWith('/') || path.startsWith('//') || path.startsWith('/\\')) return false
  return !AUTH_PATHS.some((p) => path === p || path.startsWith(`${p}?`) || path.startsWith(`${p}#`))
}

/** Survives the full-page reload of the Google redirect flow, unlike router state. */
export function saveReturnTo(path: string): void {
  if (!isSafeReturnPath(path)) return
  try {
    sessionStorage.setItem(KEY, path)
  } catch {
    // storage unavailable (private mode): router state still covers the popup flow
  }
}

export function readReturnTo(): string | null {
  try {
    const value = sessionStorage.getItem(KEY)
    return isSafeReturnPath(value) ? value : null
  } catch {
    return null
  }
}

export function clearReturnTo(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}

/** Router state wins, then the stored path, then the dashboard. */
export function resolveReturnTo(stateFrom: unknown): string {
  if (isSafeReturnPath(stateFrom)) return stateFrom
  return readReturnTo() ?? '/'
}
