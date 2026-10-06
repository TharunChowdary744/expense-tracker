import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useMemo } from 'react'
import { filtersToParams, parseFilters, type TxFilters } from '@/features/transactions/filters'

const KEYS = ['q', 'range', 'from', 'to', 'type', 'acc', 'cat', 'tag', 'min', 'max', 'sort']

/**
 * Transaction list filters, kept in the route params with the same keys as the web app's URL,
 * so other screens (dashboard, reports, budgets) can link to a filtered list.
 */
export function useTransactionFilters(): [TxFilters, (next: TxFilters) => void] {
  const params = useLocalSearchParams<Record<string, string | string[]>>()
  const key = KEYS.map((k) => {
    const v = params[k]
    return `${k}=${Array.isArray(v) ? v.join(',') : (v ?? '')}`
  }).join('&')
  const filters = useMemo(() => {
    const search = new URLSearchParams()
    for (const part of key.split('&')) {
      const [k = '', ...rest] = part.split('=')
      const v = rest.join('=')
      if (v) search.set(k, v)
    }
    return parseFilters(search)
  }, [key])
  const setFilters = useCallback((next: TxFilters) => {
    const out = filtersToParams(next)
    const update: Record<string, string | undefined> = {}
    for (const k of KEYS) update[k] = out.get(k) ?? undefined
    router.setParams(update)
  }, [])
  return [filters, setFilters]
}

/** Route params for a link to the transactions list with these filters. */
export function transactionsHref(filters: Partial<TxFilters>) {
  const params = Object.fromEntries(
    filtersToParams({ ...parseFilters(new URLSearchParams()), ...filters }).entries(),
  )
  return { pathname: '/transactions' as const, params }
}
