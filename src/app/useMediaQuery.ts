import { useSyncExternalStore } from 'react'

/** Live result of a CSS media query, e.g. useMediaQuery('(max-width: 767px)'). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

/** Phones and small tablets: below Tailwind's `md` breakpoint. */
export const MOBILE_QUERY = '(max-width: 767px)'
