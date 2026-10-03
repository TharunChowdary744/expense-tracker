import { useCallback } from 'react'
import { useSearchParams } from 'react-router'
import { calendarDate, isCalendarDate } from '@/utils/dates'
import { periodContaining, shiftPeriod, type Period, type WeekStart } from '../period'
import type { BudgetPeriodKind } from '../schemas'

/**
 * The viewed period, kept in the URL (`?at=yyyy-MM-dd`) so history views can be shared and
 * survive a reload. Without `at` it is the period containing today.
 */
export function usePeriodParams(kind: BudgetPeriodKind, weekStartsOn: WeekStart) {
  const [params, setParams] = useSearchParams()
  const today = calendarDate(new Date())
  const atParam = params.get('at')
  const at = atParam && isCalendarDate(atParam) ? atParam : today
  const period = periodContaining(at, kind, weekStartsOn)
  const current = periodContaining(today, kind, weekStartsOn)

  const goTo = useCallback(
    (next: Period | null) => {
      setParams(
        (prev) => {
          const copy = new URLSearchParams(prev)
          if (next) copy.set('at', next.start)
          else copy.delete('at')
          return copy
        },
        { replace: true },
      )
    },
    [setParams],
  )

  return {
    today,
    period,
    isCurrent: period.key === current.key,
    previous: () => goTo(shiftPeriod(period, -1)),
    next: () => goTo(shiftPeriod(period, 1)),
    reset: () => goTo(null),
  }
}
