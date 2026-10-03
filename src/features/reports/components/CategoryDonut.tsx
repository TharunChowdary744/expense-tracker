import { ChevronRight } from 'lucide-react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { Account } from '@/features/accounts/types'
import type { Category } from '@/features/categories/types'
import type { Transaction } from '@/features/transactions/types'
import { cn } from '@/utils/cn'
import { formatMoney } from '@/utils/money'
import { selectDrill, type DrillParams } from '../selectors'
import type { CategorySlice } from '../types'
import { ChartCard } from './ChartCard'
import { formatShare, seriesColor, tooltipStyle } from './chartTheme'
import { DataTable } from './DataTable'
import { TxMiniList } from './TxMiniList'

interface Props {
  /** Transactions already filtered to the report's range and accounts. */
  transactions: readonly Transaction[]
  categories: readonly Category[]
  accounts: ReadonlyMap<string, Account>
  drill: DrillParams
  onDrill: (next: DrillParams) => void
  currency: string
  locale?: string
}

/**
 * Spending by category as a donut. Clicking a slice (or its legend button) drills into the
 * category's subcategories and lists its transactions; a subcategory slice lists its own.
 */
export function CategoryDonut({
  transactions,
  categories,
  accounts,
  drill,
  onDrill,
  currency,
  locale,
}: Props) {
  const { slices, slice, transactions: listed } = selectDrill(transactions, categories, drill)
  const byId = new Map(categories.map((c) => [c.id, c]))
  const parent = drill.parentId ? byId.get(drill.parentId) : undefined
  const total = slices.reduce((sum, s) => sum + s.amount, 0)
  const money = (v: number) => formatMoney(v, currency, locale)

  function choose(s: CategorySlice) {
    if (drill.parentId === null && s.hasChildren) onDrill({ parentId: s.id, sliceId: null })
    else onDrill({ parentId: drill.parentId, sliceId: s.id === drill.sliceId ? null : s.id })
  }

  const levelName = parent?.name ?? 'All categories'
  const listTitle = slice ? slice.name : parent ? parent.name : null

  const chart = (
    <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,14rem)_1fr]">
      <div
        className="relative mx-auto h-56 w-full max-w-56"
        role="img"
        aria-label={`${levelName}: ${slices
          .slice(0, 5)
          .map((s) => `${s.name} ${formatShare(s.share, locale)}`)
          .join(', ')}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices.map((s) => ({ name: s.name, value: s.amount }))}
              dataKey="value"
              nameKey="name"
              innerRadius="58%"
              outerRadius="95%"
              paddingAngle={slices.length > 1 ? 1 : 0}
              stroke="var(--color-card)"
              isAnimationActive={false}
              onClick={(_data, index) => {
                const s = slices[index]
                if (s) choose(s)
              }}
              className="cursor-pointer"
            >
              {slices.map((s, i) => (
                <Cell
                  key={s.id}
                  fill={seriesColor(i)}
                  opacity={drill.sliceId && drill.sliceId !== s.id ? 0.4 : 1}
                />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} formatter={(value) => money(Number(value))} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-xs text-muted-foreground">Total</span>
          <span className="text-sm font-semibold tabular-nums">{money(total)}</span>
        </div>
      </div>
      <ul aria-label={`${levelName} slices`} className="space-y-1">
        {slices.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => choose(s)}
              aria-current={drill.sliceId === s.id ? 'true' : undefined}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                drill.sliceId === s.id && 'bg-accent',
              )}
            >
              <span
                className="size-3 shrink-0 rounded-sm"
                style={{ background: seriesColor(i) }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              <span className="text-muted-foreground tabular-nums">
                {formatShare(s.share, locale)}
              </span>
              <span className="w-24 text-right font-medium tabular-nums">{money(s.amount)}</span>
              {s.hasChildren && (
                <ChevronRight
                  className="size-4 text-muted-foreground"
                  aria-label="has subcategories"
                />
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )

  const table = (
    <DataTable
      caption={`Spending by category: ${levelName}`}
      rows={slices}
      rowKey={(s) => s.id}
      columns={[
        {
          header: 'Category',
          cell: (s) => (
            <button
              type="button"
              className="text-left underline underline-offset-4"
              onClick={() => choose(s)}
            >
              {s.name}
            </button>
          ),
        },
        { header: 'Amount', numeric: true, cell: (s) => money(s.amount) },
        { header: 'Share', numeric: true, cell: (s) => formatShare(s.share, locale) },
        { header: 'Transactions', numeric: true, cell: (s) => s.count },
      ]}
    />
  )

  return (
    <ChartCard
      title="Spending by category"
      description="Select a category to see its subcategories and transactions."
      empty={slices.length === 0 ? 'No spending in this period.' : null}
      chart={
        <div className="space-y-4">
          <Breadcrumb
            parent={parent?.name ?? null}
            slice={slice?.name ?? null}
            onAll={() => onDrill({ parentId: null, sliceId: null })}
            onParent={() => onDrill({ parentId: drill.parentId, sliceId: null })}
          />
          {chart}
          {listTitle && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">
                {listTitle}: {listed.length} transaction{listed.length === 1 ? '' : 's'}
              </h3>
              <TxMiniList
                label={`${listTitle} transactions`}
                transactions={listed}
                accounts={accounts}
                categories={byId}
                locale={locale}
              />
            </div>
          )}
        </div>
      }
      table={table}
    />
  )
}

function Breadcrumb({
  parent,
  slice,
  onAll,
  onParent,
}: {
  parent: string | null
  slice: string | null
  onAll: () => void
  onParent: () => void
}) {
  if (!parent && !slice) return null
  const crumb = 'rounded px-1 underline underline-offset-4 hover:text-foreground'
  return (
    <nav aria-label="Category drill-down" className="text-sm text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-1">
        <li>
          <button type="button" className={crumb} onClick={onAll}>
            All categories
          </button>
        </li>
        {parent && (
          <li className="flex items-center gap-1">
            <ChevronRight className="size-3.5" aria-hidden />
            {slice ? (
              <button type="button" className={crumb} onClick={onParent}>
                {parent}
              </button>
            ) : (
              <span aria-current="page" className="font-medium text-foreground">
                {parent}
              </span>
            )}
          </li>
        )}
        {slice && (
          <li className="flex items-center gap-1">
            <ChevronRight className="size-3.5" aria-hidden />
            <span aria-current="page" className="font-medium text-foreground">
              {slice}
            </span>
          </li>
        )}
      </ol>
    </nav>
  )
}
