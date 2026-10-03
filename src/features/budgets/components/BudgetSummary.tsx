import { CircleAlert, CircleCheck, TriangleAlert } from 'lucide-react'
import type { Transaction } from '@/features/transactions/types'
import { addCalendarDays, formatCalendarDate } from '@/utils/dates'
import { formatMoney } from '@/utils/money'
import { periodLabel, shiftPeriod } from '../period'
import type { BudgetStatus, BudgetTone } from '../utils'
import { formatPercent, TONE_LABEL, TONE_TEXT } from '../tone'
import { BudgetProgress } from './BudgetProgress'

const TONE_ICON: Record<BudgetTone, typeof CircleCheck> = {
  ok: CircleCheck,
  warning: TriangleAlert,
  over: CircleAlert,
}

interface Props {
  name: string
  status: BudgetStatus<Transaction>
  currency: string
  locale?: string
}

/** Spent / limit, progress, remaining, days left, daily allowance, projection and rollover. */
export function BudgetSummary({ name, status, currency, locale }: Props) {
  const money = (v: number) => formatMoney(v, currency, locale)
  const Icon = TONE_ICON[status.tone]
  const lastDay = addCalendarDays(status.period.end, -1)
  const endLabel = formatCalendarDate(lastDay, locale, { day: 'numeric', month: 'short' })
  const previousLabel = periodLabel(shiftPeriod(status.period, -1), locale)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p>
          <span className="text-2xl font-semibold tabular-nums">{money(status.spent)}</span>{' '}
          <span className="text-sm text-muted-foreground">of {money(status.limit)}</span>
        </p>
        <p className={`flex items-center gap-1 text-sm font-medium ${TONE_TEXT[status.tone]}`}>
          <Icon className="size-4" aria-hidden />
          {formatPercent(status.percent)} · {TONE_LABEL[status.tone]}
        </p>
      </div>
      <BudgetProgress percent={status.percent} tone={status.tone} label={`${name} spending`} />
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <dt className="text-muted-foreground">
            {status.remaining < 0 ? 'Over by' : 'Remaining'}
          </dt>
          <dd
            className={`font-medium tabular-nums ${status.remaining < 0 ? 'text-destructive' : ''}`}
          >
            {money(Math.abs(status.remaining))}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Days left</dt>
          <dd className="font-medium tabular-nums">
            {status.timing === 'past' ? 'Ended' : status.daysLeft}
          </dd>
        </div>
        {status.projected !== null && (
          <div className="col-span-2">
            <dt className="text-muted-foreground">
              {status.timing === 'past' ? 'Final spend' : `Projected by ${endLabel}`}
            </dt>
            <dd
              className={`font-medium tabular-nums ${status.projected > status.limit ? 'text-destructive' : ''}`}
            >
              {money(status.projected)}
            </dd>
          </div>
        )}
      </dl>
      {status.dailyAllowance !== null && (
        <p className="rounded-md bg-muted px-3 py-2 text-sm">
          {status.dailyAllowance > 0 ? (
            <>
              You can spend <strong className="tabular-nums">{money(status.dailyAllowance)}</strong>
              /day
            </>
          ) : (
            'Nothing left to spend this period'
          )}
        </p>
      )}
      {status.carryOver !== 0 && (
        <p className="text-xs text-muted-foreground">
          {status.carryOver > 0
            ? `Includes ${money(status.carryOver)} left over from ${previousLabel}.`
            : `Reduced by ${money(-status.carryOver)} overspent in ${previousLabel}.`}
        </p>
      )}
    </div>
  )
}
