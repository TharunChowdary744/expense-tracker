import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatCalendarDate } from '@/utils/dates'
import { currencyDigits, formatMoney } from '@/utils/money'
import type { DaySpend } from '../utils'

interface Props {
  byDay: readonly DaySpend[]
  /** Even daily share of the limit, drawn as a dashed guide line. */
  dailyTarget: number
  currency: string
  locale?: string
}

/** Spend per day for one budget period: one series, so no legend; a table backs it up. */
export function SpendChart({ byDay, dailyTarget, currency, locale }: Props) {
  const money = (v: number) => formatMoney(v, currency, locale)
  const compact = new Intl.NumberFormat(locale, { notation: 'compact' })
  const data = byDay.map((d) => ({
    date: d.date,
    day: Number(d.date.slice(8)),
    amount: d.amount,
  }))
  const busiest = byDay.reduce<DaySpend | null>(
    (best, d) => (d.amount > 0 && (!best || d.amount > best.amount) ? d : best),
    null,
  )
  const longDate = (date: string) =>
    formatCalendarDate(date, locale, { weekday: 'short', day: 'numeric', month: 'short' })

  return (
    <figure className="space-y-2">
      <figcaption className="text-sm font-medium">Spend by day</figcaption>
      <div
        className="h-44 w-full"
        role="img"
        aria-label={
          busiest
            ? `Spend by day. Highest: ${money(busiest.amount)} on ${longDate(busiest.date)}.`
            : 'Spend by day. Nothing spent in this period.'
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 8, right: 4, bottom: 0, left: 4 }}
            barCategoryGap={2}
          >
            <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="0" />
            <XAxis
              dataKey="day"
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={12}
              tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
            />
            <YAxis
              width={56}
              tickLine={false}
              axisLine={false}
              tickCount={3}
              tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
              tickFormatter={(v: number) =>
                // Axis ticks are approximate labels, never stored amounts.
                compact.format(v / 10 ** currencyDigits(currency))
              }
            />
            <Tooltip
              cursor={{ fill: 'var(--color-muted)' }}
              contentStyle={{
                background: 'var(--color-popover)',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                color: 'var(--color-popover-foreground)',
                fontSize: 12,
              }}
              labelFormatter={(_label, payload) => {
                const date = (payload[0]?.payload as { date?: string } | undefined)?.date
                return date ? longDate(date) : ''
              }}
              formatter={(value) => [money(Number(value)), 'Spent']}
            />
            {dailyTarget > 0 && (
              <ReferenceLine
                y={dailyTarget}
                stroke="var(--color-muted-foreground)"
                strokeDasharray="4 4"
                ifOverflow="extendDomain"
              />
            )}
            <Bar
              dataKey="amount"
              fill="var(--color-primary)"
              radius={[4, 4, 0, 0]}
              maxBarSize={24}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {dailyTarget > 0 && (
        <p className="text-xs text-muted-foreground">
          Dashed line: an even daily share of the limit ({money(dailyTarget)}).
        </p>
      )}
    </figure>
  )
}
