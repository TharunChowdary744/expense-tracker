import { ChartPie } from 'lucide-react'
import { Link } from 'react-router'
import { ListSkeleton } from '@/components/ListStates'
import { formatShare, seriesColor } from '@/features/reports/components/chartTheme'
import { reportSearchParams, type ReportSearch } from '@/features/reports/params'
import type { CategorySlice } from '@/features/reports/types'
import { formatMoney } from '@/utils/money'

interface Props {
  slices: CategorySlice[] | null
  /** The dashboard's period, so the Reports links open the same range. */
  search: Pick<ReportSearch, 'preset' | 'from' | 'to'>
  currency: string
  locale?: string
}

/** The five categories with the most spending in the period, linking to the report drill-down. */
export function TopCategoriesCard({ slices, search, currency, locale }: Props) {
  const headingId = 'top-categories-heading'
  const max = slices?.[0]?.amount ?? 0
  const reportLink = (slice?: CategorySlice) =>
    `/reports?${reportSearchParams({
      ...search,
      accountIds: [],
      parentId: slice?.hasChildren ? slice.id : null,
      sliceId: slice && !slice.hasChildren ? slice.id : null,
    }).toString()}`

  return (
    <section aria-labelledby={headingId} className="space-y-3 rounded-xl border bg-card p-4">
      <h2 id={headingId} className="flex items-center gap-2 font-semibold">
        <ChartPie className="size-4" aria-hidden />
        Top categories
      </h2>
      {!slices ? (
        <ListSkeleton rows={2} label="Loading top categories" />
      ) : slices.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No spending in this period.
        </p>
      ) : (
        <>
          <ol className="space-y-2.5" aria-label="Top five spending categories">
            {slices.map((s, i) => (
              <li key={s.id}>
                <Link to={reportLink(s)} className="block space-y-1 rounded-md hover:bg-accent/50">
                  <span className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">{s.name}</span>
                    <span className="shrink-0 tabular-nums">
                      <span className="mr-2 text-xs text-muted-foreground">
                        {formatShare(s.share, locale)}
                      </span>
                      <span className="font-medium">{formatMoney(s.amount, currency, locale)}</span>
                    </span>
                  </span>
                  <span className="block h-2 rounded-full bg-muted" aria-hidden>
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${max > 0 ? Math.max(2, (s.amount / max) * 100) : 0}%`,
                        background: seriesColor(i),
                      }}
                    />
                  </span>
                </Link>
              </li>
            ))}
          </ol>
          <Link
            to={reportLink()}
            className="inline-block text-sm font-medium underline underline-offset-4"
          >
            Open reports
          </Link>
        </>
      )}
    </section>
  )
}
