import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/utils/cn'
import { formatDelta } from './chartTheme'

interface Props {
  label: string
  value: string
  loading?: boolean
  /** Change in percent (display only); null for "no comparison". */
  delta?: number | null
  /** e.g. "vs Sep 2026" */
  deltaLabel?: string
  /** Whether a rise is good (income, net) or bad (spending). */
  riseIsGood?: boolean
  tone?: 'default' | 'positive' | 'negative'
  href?: string
  hrefLabel?: string
  locale?: string
  footnote?: string
}

/** One headline number with an optional change against a previous period. */
export function StatTile({
  label,
  value,
  loading,
  delta,
  deltaLabel,
  riseIsGood = true,
  tone = 'default',
  href,
  hrefLabel,
  locale,
  footnote,
}: Props) {
  const hasDelta = delta !== undefined
  const up = (delta ?? 0) > 0
  const good = delta === null || delta === undefined || delta === 0 ? null : up === riseIsGood
  const Arrow = up ? ArrowUpRight : ArrowDownRight
  return (
    <div className="min-w-0 rounded-xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-32" />
      ) : (
        <p
          className={cn(
            'mt-1 truncate text-2xl font-semibold tabular-nums',
            tone === 'positive' && 'text-success',
            tone === 'negative' && 'text-destructive',
          )}
        >
          {value}
        </p>
      )}
      {hasDelta && !loading && (
        <p
          className={cn(
            'mt-1 flex items-center gap-1 text-xs',
            good === null ? 'text-muted-foreground' : good ? 'text-success' : 'text-destructive',
          )}
        >
          {delta !== null && delta !== 0 && <Arrow className="size-3.5" aria-hidden />}
          <span>
            {delta === null ? 'No data to compare' : formatDelta(delta, locale)} {deltaLabel}
          </span>
        </p>
      )}
      {footnote && !loading && <p className="mt-1 text-xs text-muted-foreground">{footnote}</p>}
      {href && (
        <Link
          to={href}
          className="mt-2 inline-block text-xs font-medium underline underline-offset-4"
        >
          {hrefLabel ?? 'View transactions'}
        </Link>
      )}
    </div>
  )
}
