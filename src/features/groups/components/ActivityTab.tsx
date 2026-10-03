import { History } from 'lucide-react'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ListStates'
import { ACTIVITY_LIMIT } from '../api'
import type { Activity } from '../types'

interface Props {
  locale: string
  items: Activity[] | undefined
  isLoading: boolean
  error: unknown
  onRetry: () => void
}

export function ActivityTab({ locale, items, isLoading, error, onRetry }: Props) {
  if (isLoading) return <ListSkeleton label="Loading activity" />
  if (error) {
    return <ErrorState title="Could not load activity" message={String(error)} onRetry={onRetry} />
  }
  if (!items || items.length === 0) {
    return <EmptyState icon={History} title="No activity yet" />
  }
  const time = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })
  return (
    <div className="space-y-2">
      <ul aria-label="Activity" className="divide-y rounded-lg border bg-card">
        {items.map((item) => (
          <li key={item.id} className="space-y-0.5 p-3">
            <p className="text-sm">{item.summary}</p>
            <p className="text-xs text-muted-foreground">
              <time dateTime={item.createdAt}>{time.format(new Date(item.createdAt))}</time>
            </p>
          </li>
        ))}
      </ul>
      {items.length >= ACTIVITY_LIMIT && (
        <p className="text-xs text-muted-foreground">Showing the latest {ACTIVITY_LIMIT}.</p>
      )}
    </div>
  )
}
