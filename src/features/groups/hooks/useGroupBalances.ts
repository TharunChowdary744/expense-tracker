import { shallowEqual } from 'react-redux'
import { useEffect, useMemo } from 'react'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { groupsApi } from '../api'
import { netBalances } from '../balances'
import type { Group, GroupExpense, Settlement } from '../types'

export interface GroupBalance {
  /** Net balance per member (current and former) in the group currency. */
  net: Map<string, number>
  loading: boolean
  error: boolean
}

/**
 * Live net balances for several groups at once (the groups list and the dashboard). Subscribes
 * to each group's expenses and settlements for as long as the component is mounted.
 */
export function useGroupBalances(
  uid: string,
  groups: readonly Group[] | undefined,
): Map<string, GroupBalance> {
  const dispatch = useAppDispatch()
  const key = (groups ?? []).map((g) => g.id).join(',')
  const ids = useMemo(() => (key ? key.split(',') : []), [key])

  useEffect(() => {
    const subs = ids.flatMap((groupId) => [
      dispatch(groupsApi.endpoints.getGroupExpenses.initiate({ uid, groupId })),
      dispatch(groupsApi.endpoints.getGroupSettlements.initiate({ uid, groupId })),
    ])
    return () => subs.forEach((s) => s.unsubscribe())
  }, [dispatch, uid, ids])

  // A flat list of [expenses, settlements, failed] per group: stable references, so
  // shallowEqual keeps re-renders to real data changes.
  const results = useAppSelector(
    (state) =>
      ids.flatMap((groupId) => {
        const expenses = groupsApi.endpoints.getGroupExpenses.select({ uid, groupId })(state)
        const settlements = groupsApi.endpoints.getGroupSettlements.select({ uid, groupId })(state)
        return [expenses.data, settlements.data, expenses.isError || settlements.isError]
      }),
    shallowEqual,
  )

  return useMemo(() => {
    const out = new Map<string, GroupBalance>()
    ids.forEach((groupId, i) => {
      const expenses = results[i * 3] as GroupExpense[] | undefined
      const settlements = results[i * 3 + 1] as Settlement[] | undefined
      const error = results[i * 3 + 2] === true
      out.set(groupId, {
        net: expenses && settlements ? netBalances(expenses, settlements) : new Map(),
        loading: (!expenses || !settlements) && !error,
        error,
      })
    })
    return out
  }, [ids, results])
}
