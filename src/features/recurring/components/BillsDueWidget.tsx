import { CalendarClock } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'
import { ErrorState, ListSkeleton } from '@/components/ListStates'
import { useUid } from '@/features/auth/hooks'
import { useGetCategoriesQuery } from '@/features/categories/api'
import { useUserSettings } from '@/features/settings/hooks'
import { formatMoney } from '@/utils/money'
import { useGetRecurringQuery } from '../api'
import { usePendingOccurrences } from '../hooks/usePendingOccurrences'
import type { RecurringRule } from '../types'
import { PendingList } from './PendingList'

const DAYS = 7
const MAX_SHOWN = 6

const isExpense = (rule: RecurringRule) => rule.template.type === 'expense'

/** Dashboard card: recurring expenses due in the next 7 days, plus overdue reminders. */
export function BillsDueWidget() {
  const uid = useUid()
  const { baseCurrency, locale } = useUserSettings()
  const { data: rules, error, refetch } = useGetRecurringQuery(uid)
  const categories = useGetCategoriesQuery(uid)
  const categoryMap = useMemo(
    () => new Map((categories.data ?? []).map((c) => [c.id, c])),
    [categories.data],
  )
  const { items, isLoading } = usePendingOccurrences(rules, DAYS, isExpense)
  const total = items.reduce((sum, i) => sum + i.rule.template.baseAmount, 0)
  const headingId = 'bills-due-heading'

  return (
    <section aria-labelledby={headingId} className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={headingId} className="flex items-center gap-2 font-semibold">
          <CalendarClock className="size-4" aria-hidden />
          Bills due in the next 7 days
        </h2>
        {items.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Total{' '}
            <span className="font-semibold text-foreground tabular-nums">
              {formatMoney(total, baseCurrency, locale)}
            </span>
          </p>
        )}
      </div>
      {error ? (
        <ErrorState
          title="Could not load your recurring bills"
          message={String(error)}
          onRetry={() => void refetch()}
        />
      ) : isLoading ? (
        <ListSkeleton rows={2} label="Loading bills due" />
      ) : items.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No recurring bills due this week.{' '}
          <Link
            to="/recurring"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Manage recurring
          </Link>
        </p>
      ) : (
        <>
          <PendingList
            label="Bills due"
            items={items.slice(0, MAX_SHOWN)}
            categories={categoryMap}
            locale={locale}
          />
          <Link
            to={
              items.some((i) => i.rule.mode === 'remind') ? '/recurring?tab=upcoming' : '/recurring'
            }
            className="inline-block text-sm font-medium underline underline-offset-4"
          >
            {items.length > MAX_SHOWN ? `See all ${items.length}` : 'Open Recurring'}
          </Link>
        </>
      )}
    </section>
  )
}
