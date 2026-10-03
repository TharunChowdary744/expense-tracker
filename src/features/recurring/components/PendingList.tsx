import { Check, SkipForward } from 'lucide-react'
import { ColoredIcon } from '@/components/ColoredIcon'
import { Button } from '@/components/ui/button'
import type { Category } from '@/features/categories/types'
import { cn } from '@/utils/cn'
import { formatCalendarDate } from '@/utils/dates'
import { formatMoney } from '@/utils/money'
import type { PendingOccurrence } from '../types'
import { relativeDay } from '../utils'
import { ruleLabel } from './ruleLabel'

interface Props {
  items: readonly PendingOccurrence[]
  categories: ReadonlyMap<string, Category>
  locale?: string
  label: string
  /** Omit both for a read-only list (the dashboard widget). */
  onConfirm?: (item: PendingOccurrence) => void
  onSkip?: (item: PendingOccurrence) => void
  /** Occurrence ids with a confirm or skip in flight. */
  busyIds?: ReadonlySet<string>
}

export function PendingList({
  items,
  categories,
  locale,
  label,
  onConfirm,
  onSkip,
  busyIds,
}: Props) {
  return (
    <ul aria-label={label} className="space-y-2">
      {items.map((item) => {
        const { rule, occurrence, daysAway, txId } = item
        const { title, icon, color } = ruleLabel(rule, categories)
        const t = rule.template
        const when = relativeDay(daysAway)
        const date = formatCalendarDate(occurrence.date, locale, {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        })
        const busy = busyIds?.has(txId) ?? false
        return (
          <li
            key={txId}
            className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-3 py-2.5"
          >
            <ColoredIcon icon={icon} color={color} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{title}</p>
              <p className="text-xs text-muted-foreground">
                {date} ·{' '}
                <span className={cn(daysAway < 0 && 'font-medium text-destructive')}>{when}</span>
                {rule.mode === 'auto' && ' · posts automatically'}
              </p>
            </div>
            <p className="font-semibold tabular-nums">
              {formatMoney(t.type === 'expense' ? -t.amount : t.amount, t.currency, locale)}
            </p>
            {(onConfirm || onSkip) && (
              <div className="flex w-full justify-end gap-2 sm:w-auto">
                {onSkip && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => onSkip(item)}
                    aria-label={`Skip ${title} on ${date}`}
                  >
                    <SkipForward aria-hidden />
                    Skip
                  </Button>
                )}
                {onConfirm && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => onConfirm(item)}
                    aria-label={`Confirm ${title} on ${date}`}
                  >
                    <Check aria-hidden />
                    Confirm
                  </Button>
                )}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
