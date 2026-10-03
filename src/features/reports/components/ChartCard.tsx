import { BarChart3, Table2 } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/utils/cn'

interface Props {
  title: string
  description?: string
  /** The chart. Hidden (not unmounted from the tree order) when the table is shown. */
  chart: ReactNode
  /** The same data as a table: the accessible alternative. */
  table: ReactNode
  /** Extra controls next to the toggle. */
  actions?: ReactNode
  /** Shown instead of chart and table when there is nothing to plot. */
  empty?: string | null
  className?: string
}

/** A report section with a "Table" / "Chart" toggle, so every chart has a data table. */
export function ChartCard({ title, description, chart, table, actions, empty, className }: Props) {
  const headingId = useId()
  const [showTable, setShowTable] = useState(false)
  return (
    <section
      aria-labelledby={headingId}
      className={cn('min-w-0 space-y-3 rounded-xl border bg-card p-4', className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id={headingId} className="font-semibold">
            {title}
          </h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          {!empty && (
            <Button
              size="sm"
              variant="outline"
              aria-pressed={showTable}
              onClick={() => setShowTable((v) => !v)}
            >
              {showTable ? <BarChart3 aria-hidden /> : <Table2 aria-hidden />}
              {showTable ? 'Show chart' : 'Show table'}
            </Button>
          )}
        </div>
      </div>
      {empty ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{empty}</p>
      ) : showTable ? (
        <div className="max-h-96 overflow-auto">{table}</div>
      ) : (
        chart
      )}
    </section>
  )
}
