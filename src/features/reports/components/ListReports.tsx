import { cn } from '@/utils/cn'
import { formatMoney } from '@/utils/money'
import type { Comparison, ComparisonRow, PayeeTotal, TagTotal } from '../types'
import { ChartCard } from './ChartCard'
import { EXPENSE_COLOR, INCOME_COLOR, formatDelta } from './chartTheme'
import { DataTable } from './DataTable'

interface Common {
  currency: string
  locale?: string
}

/** A horizontal bar drawn with CSS; `value / max` of the track. */
function Meter({
  value,
  max,
  color,
  label,
}: {
  value: number
  max: number
  color: string
  label: string
}) {
  const width = max > 0 ? Math.max(1, Math.round((value / max) * 100)) : 0
  return (
    <div className="h-2 w-full rounded-full bg-muted" aria-hidden title={label}>
      <div className="h-full rounded-full" style={{ width: `${width}%`, background: color }} />
    </div>
  )
}

export function TopPayees({ payees, currency, locale }: Common & { payees: PayeeTotal[] }) {
  const money = (v: number) => formatMoney(v, currency, locale)
  const max = payees[0]?.amount ?? 0
  return (
    <ChartCard
      title="Top payees"
      description="Where most of the money went"
      empty={payees.length === 0 ? 'No spending with a payee in this period.' : null}
      chart={
        <ol className="space-y-2.5" aria-label="Top payees by spending">
          {payees.map((p) => (
            <li key={p.payee} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">{p.payee}</span>
                <span className="shrink-0 font-medium tabular-nums">
                  {money(p.amount)}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">×{p.count}</span>
                </span>
              </div>
              <Meter value={p.amount} max={max} color={EXPENSE_COLOR} label={money(p.amount)} />
            </li>
          ))}
        </ol>
      }
      table={
        <DataTable
          caption="Top payees"
          rows={payees}
          rowKey={(p) => p.payee}
          columns={[
            { header: 'Payee', cell: (p) => p.payee },
            { header: 'Spent', numeric: true, cell: (p) => money(p.amount) },
            { header: 'Transactions', numeric: true, cell: (p) => p.count },
          ]}
        />
      }
    />
  )
}

export function TagReport({ tags, currency, locale }: Common & { tags: TagTotal[] }) {
  const money = (v: number) => formatMoney(v, currency, locale)
  const max = Math.max(0, ...tags.map((t) => Math.max(t.expense, t.income)))
  return (
    <ChartCard
      title="Tags"
      description="A transaction with several tags counts under each"
      empty={tags.length === 0 ? 'No tagged transactions in this period.' : null}
      chart={
        <ul className="space-y-3" aria-label="Spending and income by tag">
          {tags.map((t) => (
            <li key={t.tag} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">#{t.tag}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {t.expense > 0 && <>Spent {money(t.expense)}</>}
                  {t.expense > 0 && t.income > 0 && ' · '}
                  {t.income > 0 && <>Income {money(t.income)}</>}
                </span>
              </div>
              {t.expense > 0 && (
                <Meter
                  value={t.expense}
                  max={max}
                  color={EXPENSE_COLOR}
                  label={`Spent ${money(t.expense)}`}
                />
              )}
              {t.income > 0 && (
                <Meter
                  value={t.income}
                  max={max}
                  color={INCOME_COLOR}
                  label={`Income ${money(t.income)}`}
                />
              )}
            </li>
          ))}
        </ul>
      }
      table={
        <DataTable
          caption="Tags"
          rows={tags}
          rowKey={(t) => t.tag}
          columns={[
            { header: 'Tag', cell: (t) => `#${t.tag}` },
            { header: 'Spent', numeric: true, cell: (t) => money(t.expense) },
            { header: 'Income', numeric: true, cell: (t) => money(t.income) },
            { header: 'Transactions', numeric: true, cell: (t) => t.count },
          ]}
        />
      }
    />
  )
}

/**
 * This period against the previous one. It is already a table, so it has no chart toggle.
 * For spending, a rise is shown in the destructive colour; for income and net, a fall.
 */
export function ComparisonTable({
  comparison,
  currentLabel,
  previousLabel,
  currency,
  locale,
}: Common & { comparison: Comparison; currentLabel: string; previousLabel: string }) {
  const money = (v: number) => formatMoney(v, currency, locale)
  const tone = (r: ComparisonRow, higherIsGood: boolean) =>
    r.change === 0 ? '' : r.change > 0 === higherIsGood ? 'text-success' : 'text-destructive'
  const cells = (r: ComparisonRow, higherIsGood: boolean, strong = false) => (
    <tr key={r.id} className={cn('border-b last:border-0', strong && 'font-medium')}>
      <th scope="row" className="px-2 py-1.5 text-left font-[inherit]">
        {r.name}
      </th>
      <td className="px-2 py-1.5 text-right tabular-nums">{money(r.current)}</td>
      <td className="px-2 py-1.5 text-right tabular-nums">{money(r.previous)}</td>
      <td className={cn('px-2 py-1.5 text-right tabular-nums', tone(r, higherIsGood))}>
        {money(r.change)}
      </td>
      <td className={cn('px-2 py-1.5 text-right tabular-nums', tone(r, higherIsGood))}>
        {formatDelta(r.changePercent, locale)}
      </td>
    </tr>
  )
  return (
    <section
      aria-labelledby="comparison-heading"
      className="min-w-0 space-y-3 rounded-xl border bg-card p-4"
    >
      <div>
        <h2 id="comparison-heading" className="font-semibold">
          Period comparison
        </h2>
        <p className="text-sm text-muted-foreground">
          {currentLabel} compared with {previousLabel}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] text-sm">
          <caption className="sr-only">
            {currentLabel} compared with {previousLabel}
          </caption>
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th scope="col" className="px-2 py-1.5 font-medium">
                &nbsp;
              </th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">
                This period
              </th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">
                Previous
              </th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">
                Change
              </th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">
                %
              </th>
            </tr>
          </thead>
          <tbody>
            {cells(comparison.income, true, true)}
            {cells(comparison.expense, false, true)}
            {cells(comparison.net, true, true)}
          </tbody>
          {comparison.rows.length > 0 && (
            <tbody>
              <tr>
                <th
                  colSpan={5}
                  scope="colgroup"
                  className="px-2 pt-4 pb-1 text-left text-xs font-medium text-muted-foreground uppercase"
                >
                  Spending by category
                </th>
              </tr>
              {comparison.rows.map((r) => cells(r, false))}
            </tbody>
          )}
        </table>
      </div>
    </section>
  )
}
