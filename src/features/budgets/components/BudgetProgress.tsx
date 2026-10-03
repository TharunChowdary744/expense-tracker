import { cn } from '@/utils/cn'
import { formatPercent, TONE_BAR, TONE_LABEL } from '../tone'
import type { BudgetTone } from '../utils'

export function BudgetProgress({
  percent,
  tone,
  label,
}: {
  percent: number
  tone: BudgetTone
  label: string
}) {
  const width = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 100
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(width)}
      aria-valuetext={`${formatPercent(percent)} used, ${TONE_LABEL[tone].toLowerCase()}`}
      className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
    >
      <div
        data-tone={tone}
        className={cn('h-full rounded-full transition-[width]', TONE_BAR[tone])}
        style={{ width: `${width}%` }}
      />
    </div>
  )
}
