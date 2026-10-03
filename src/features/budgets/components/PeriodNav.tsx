import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { periodLabel, type Period } from '../period'

interface Props {
  period: Period
  locale?: string
  isCurrent: boolean
  onPrevious: () => void
  onNext: () => void
  onReset: () => void
}

export function PeriodNav({ period, locale, isCurrent, onPrevious, onNext, onReset }: Props) {
  const unit = period.kind === 'monthly' ? 'month' : 'week'
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="icon" onClick={onPrevious} aria-label={`Previous ${unit}`}>
        <ChevronLeft />
      </Button>
      <p className="min-w-40 text-center font-medium" aria-live="polite">
        {periodLabel(period, locale)}
      </p>
      <Button variant="outline" size="icon" onClick={onNext} aria-label={`Next ${unit}`}>
        <ChevronRight />
      </Button>
      {!isCurrent && (
        <Button variant="ghost" size="sm" onClick={onReset}>
          This {unit}
        </Button>
      )}
    </div>
  )
}
