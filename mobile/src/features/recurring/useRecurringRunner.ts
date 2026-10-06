import { skipToken } from '@reduxjs/toolkit/query/react'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/features/auth/hooks'
import { useGetRecurringQuery, useRunRecurringMutation } from '@/features/recurring/api'
import { isDue } from '@/features/recurring/utils'
import { useToast } from '@/features/ui/hooks'
import { onAppForeground } from '@m/lib/appState'
import { isOnline, onConnectivityChange } from '@m/lib/connectivity'

/** Re-checks for newly due occurrences this often while the app stays open. */
const TICK_MS = 15 * 60_000

/**
 * The catch-up runner, as in the web app: whenever the rule list changes, the app starts or
 * comes back to the foreground, or the device comes back online, every auto rule with
 * nextRunAt <= now is run. A rule that fails or hit the catch-up cap waits for the next wake.
 */
export function useRecurringRunner() {
  const { user } = useAuth()
  const uid = user?.uid
  const { data: rules } = useGetRecurringQuery(uid ?? skipToken)
  const [run] = useRunRecurringMutation()
  const toast = useToast()
  const [tick, setTick] = useState(0)
  const running = useRef(new Set<string>())
  const held = useRef(new Set<string>())

  useEffect(() => {
    const wake = () => {
      held.current.clear()
      setTick((t) => t + 1)
    }
    const offForeground = onAppForeground(wake)
    const offOnline = onConnectivityChange((online) => online && wake())
    const timer = setInterval(wake, TICK_MS)
    return () => {
      offForeground()
      offOnline()
      clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    if (!uid || !rules || !isOnline()) return
    const now = new Date()
    for (const rule of rules) {
      if (!isDue(rule, now) || running.current.has(rule.id) || held.current.has(rule.id)) {
        continue
      }
      running.current.add(rule.id)
      void run({ uid, ruleId: rule.id }).then((result) => {
        running.current.delete(rule.id)
        if ('error' in result) {
          held.current.add(rule.id)
          return
        }
        const { posted, remaining, label } = result.data
        if (remaining > 0) held.current.add(rule.id)
        if (posted === 0) return
        const noun = posted === 1 ? 'transaction' : 'transactions'
        toast({
          title: `${label}: ${posted} recurring ${noun} posted`,
          description:
            remaining > 0
              ? `Catch-up stops at ${posted} at a time. ${remaining} more due will be posted the next time you open Ledgerly.`
              : undefined,
          variant: remaining > 0 ? 'default' : 'success',
        })
      })
    }
  }, [uid, rules, tick, run, toast])
}
