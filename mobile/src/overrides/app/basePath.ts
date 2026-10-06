import { env } from '@m/lib/env'

/** Mobile has no router basename. */
export function routerBasename(): string {
  return '/'
}

/**
 * A web app URL for an in-app path, e.g. invite links that people without the mobile app can
 * open. Falls back to the bare path when EXPO_PUBLIC_WEB_APP_URL isn't set.
 */
export function appPath(path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`
  return `${env.webAppUrl}${clean}`
}
