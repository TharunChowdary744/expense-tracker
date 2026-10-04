/**
 * The app can be served from a sub-path, e.g. "/expense-tracker/dev/" on GitHub Pages.
 * Vite exposes it as import.meta.env.BASE_URL (always ending in "/"; "/" by default).
 */
function trimSlash(base: string): string {
  return base.replace(/\/+$/, '')
}

/** Basename for the router: "/" at the root, otherwise the sub-path without a trailing slash. */
export function routerBasename(base: string = import.meta.env.BASE_URL): string {
  return trimSlash(base) || '/'
}

/** Prefixes an in-app path (starting with "/") with the sub-path the app is served from. */
export function appPath(path: string, base: string = import.meta.env.BASE_URL): string {
  return `${trimSlash(base)}${path}`
}
