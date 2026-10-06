import { router, useLocalSearchParams, type Href } from 'expo-router'
import { useCallback, useMemo } from 'react'
import { mobilePath } from './links'

/**
 * The route params named in `keys` as URLSearchParams, so web helpers that read and write a
 * query string (report and dashboard filters) work unchanged. The setter replaces those params.
 */
export function useRouteSearch(
  keys: readonly string[],
): [URLSearchParams, (next: URLSearchParams) => void] {
  const params = useLocalSearchParams<Record<string, string | string[]>>()
  const key = keys
    .map((k) => {
      const v = params[k]
      return `${k}=${encodeURIComponent(Array.isArray(v) ? v.join(',') : (v ?? ''))}`
    })
    .join('&')
  const search = useMemo(() => {
    const out = new URLSearchParams()
    for (const part of key.split('&')) {
      const [k = '', v = ''] = part.split('=')
      if (v) out.set(k, decodeURIComponent(v))
    }
    return out
  }, [key])
  const names = keys.join(',')
  const setSearch = useCallback(
    (next: URLSearchParams) => {
      const update: Record<string, string | undefined> = {}
      for (const k of names.split(',')) update[k] = next.get(k) ?? undefined
      router.setParams(update)
    },
    [names],
  )
  return [search, setSearch]
}

/** Opens an in-app link written for the web app (e.g. "/transactions?range=…"). */
export function openLink(link: string) {
  const path = mobilePath(link)
  if (path) router.push(path as Href)
}
