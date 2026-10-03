import { skipToken } from '@reduxjs/toolkit/query/react'
import { useMemo } from 'react'
import { useUid } from '@/features/auth/hooks'
import { useGetPostedOccurrencesQuery } from '../api'
import type { PendingOccurrence, RecurringRule } from '../types'
import { pendingOccurrences, postedLookupIds } from '../utils'

/**
 * Occurrences of active rules due now or within `days` days that are not posted or skipped.
 * Remind-mode occurrences confirmed out of order are looked up by their deterministic ids.
 */
export function usePendingOccurrences(
  rules: readonly RecurringRule[] | undefined,
  days: number,
  filter?: (rule: RecurringRule) => boolean,
): { items: PendingOccurrence[]; isLoading: boolean } {
  const uid = useUid()
  const ids = useMemo(() => (rules ? postedLookupIds(rules, days) : []), [rules, days])
  const posted = useGetPostedOccurrencesQuery(ids.length > 0 ? { uid, ids } : skipToken)
  const items = useMemo(() => {
    if (!rules) return []
    return pendingOccurrences(rules, {
      days,
      posted: new Set(posted.data ?? []),
      ...(filter ? { filter } : {}),
    })
  }, [rules, days, posted.data, filter])
  return { items, isLoading: !rules || (ids.length > 0 && posted.isLoading) }
}
