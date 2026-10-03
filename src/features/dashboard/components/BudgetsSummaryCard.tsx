import { Target } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'
import { ErrorState, ListSkeleton } from '@/components/ListStates'
import { useUid } from '@/features/auth/hooks'
import { useGetBudgetsQuery } from '@/features/budgets/api'
import { BudgetProgress } from '@/features/budgets/components/BudgetProgress'
import { useBudgetStatuses } from '@/features/budgets/hooks/useBudgetStatuses'
import { periodContaining } from '@/features/budgets/period'
import { formatPercent, TONE_TEXT } from '@/features/budgets/tone'
import type { Budget } from '@/features/budgets/types'
import { useUserSettings } from '@/features/settings/hooks'
import { cn } from '@/utils/cn'
import { calendarDate } from '@/utils/dates'
import { formatMoney } from '@/utils/money'

const MAX_SHOWN = 5
const EMPTY: Budget[] = []

/** Dashboard card: this month's and this week's budgets, most used first. */
export function BudgetsSummaryCard() {
  const uid = useUid()
  const { baseCurrency, locale, weekStartsOn } = useUserSettings()
  const { data: budgets, error, isLoading, refetch } = useGetBudgetsQuery(uid)
  const today = calendarDate(new Date())
  const monthly = useMemo(() => (budgets ?? EMPTY).filter((b) => b.period === 'monthly'), [budgets])
  const weekly = useMemo(() => (budgets ?? EMPTY).filter((b) => b.period === 'weekly'), [budgets])
  const month = useMemo(
    () => periodContaining(today, 'monthly', weekStartsOn),
    [today, weekStartsOn],
  )
  const week = useMemo(() => periodContaining(today, 'weekly', weekStartsOn), [today, weekStartsOn])
  const m = useBudgetStatuses(monthly, month, today)
  const w = useBudgetStatuses(weekly, week, today)
  const headingId = 'budgets-summary-heading'

  const rows = useMemo(
    () =>
      [...monthly, ...weekly]
        .flatMap((budget) => {
          const status = (budget.period === 'monthly' ? m : w).statuses.get(budget.id)
          return status ? [{ budget, status }] : []
        })
        .sort((a, b) => b.status.percent - a.status.percent),
    [monthly, weekly, m, w],
  )
  const loading = isLoading || m.isLoading || w.isLoading
  const failed = error ?? m.error ?? w.error

  return (
    <section aria-labelledby={headingId} className="space-y-3 rounded-xl border bg-card p-4">
      <h2 id={headingId} className="flex items-center gap-2 font-semibold">
        <Target className="size-4" aria-hidden />
        Budgets
      </h2>
      {failed ? (
        <ErrorState
          title="Could not load your budgets"
          message={String(failed)}
          onRetry={() => {
            void refetch()
            m.refetch()
            w.refetch()
          }}
        />
      ) : loading ? (
        <ListSkeleton rows={2} label="Loading budgets" />
      ) : rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No budgets yet.{' '}
          <Link to="/budgets" className="font-medium text-foreground underline underline-offset-4">
            Set a budget
          </Link>
        </p>
      ) : (
        <>
          <ul className="space-y-3" aria-label="Budgets this period">
            {rows.slice(0, MAX_SHOWN).map(({ budget, status }) => (
              <li key={budget.id} className="space-y-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
                  <Link
                    to={`/budgets/${budget.id}`}
                    className="min-w-0 truncate font-medium hover:underline"
                  >
                    {budget.name}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      {budget.period === 'monthly' ? 'this month' : 'this week'}
                    </span>
                  </Link>
                  <span className="tabular-nums">
                    {formatMoney(status.spent, baseCurrency, locale)}{' '}
                    <span className="text-muted-foreground">
                      of {formatMoney(status.limit, baseCurrency, locale)}
                    </span>{' '}
                    <span className={cn('font-medium', TONE_TEXT[status.tone])}>
                      {formatPercent(status.percent)}
                    </span>
                  </span>
                </div>
                <BudgetProgress
                  percent={status.percent}
                  tone={status.tone}
                  label={`${budget.name} spending`}
                />
              </li>
            ))}
          </ul>
          <Link
            to="/budgets"
            className="inline-block text-sm font-medium underline underline-offset-4"
          >
            {rows.length > MAX_SHOWN ? `See all ${rows.length}` : 'All budgets'}
          </Link>
        </>
      )}
    </section>
  )
}
