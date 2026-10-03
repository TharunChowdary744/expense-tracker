import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { filtersToParams, parseFilters, type TxFilters } from '../filters'

/** Transaction list filters, stored in the URL query string (shareable, survives reload). */
export function useTransactionFilters(): [TxFilters, (next: TxFilters) => void] {
  const [params, setParams] = useSearchParams()
  const key = params.toString()
  // Re-parse only when the query string changes, so the object stays stable between renders.
  const filters = useMemo(() => parseFilters(new URLSearchParams(key)), [key])
  const setFilters = useCallback(
    (next: TxFilters) => setParams(filtersToParams(next), { replace: true }),
    [setParams],
  )
  return [filters, setFilters]
}
