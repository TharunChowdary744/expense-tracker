import { skipToken } from '@reduxjs/toolkit/query/react'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/features/auth/hooks'
import { useToast } from '@/features/ui/hooks'
import { useGetRecurringQuery, useRunRecurringMutation } from '../api'
import { isDue } from '../utils'

/** Re-checks for newly due occurrences this often while the app stays open. */
const TICK_MS = 15 * 60_000

/**
 * The catch-up runner. Whenever the rule list changes, the app starts, the tab becomes
 * visible again or the browser comes back online, every auto rule with nextRunAt <= now is
 * run (one transaction per rule, see `runRule`). A rule that fails, or that hit the catch-up
 * cap, isn't run again until the next visibility or online event, so an offline device doesn't
 * spin and one visit never posts more than the cap per rule.
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
      if (document.visibilityState !== 'visible') return
      held.current.clear()
      setTick((t) => t + 1)
    }
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('online', wake)
    const timer = window.setInterval(wake, TICK_MS)
    return () => {
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('online', wake)
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    if (!uid || !rules) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
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
        // Capped: the rest waits for the next wake-up, so one visit posts at most the cap.
        if (remaining > 0) held.current.add(rule.id)
        if (posted === 0) return
        const noun = posted === 1 ? 'transaction' : 'transactions'
        toast({
          title: `${label}: ${posted} recurring ${noun} posted`,
          description:
            remaining > 0
              ? `Catch-up stops at ${posted} at a time. ${remaining} more due will be posted the next time you come back to Ledgerly.`
              : undefined,
          variant: remaining > 0 ? 'default' : 'success',
        })
      })
    }
  }, [uid, rules, tick, run, toast])
}
