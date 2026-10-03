import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatCalendarDate } from '@/utils/dates'
import { formatMoney } from '@/utils/money'
import type { DayFlow, MonthTotals } from '../types'
import { monthLabel } from '../utils'
import { ChartCard } from './ChartCard'
import {
  EXPENSE_COLOR,
  INCOME_COLOR,
  NET_COLOR,
  axisTick,
  compactTick,
  tooltipStyle,
} from './chartTheme'
import { DataTable } from './DataTable'

interface Common {
  currency: string
  locale?: string
}

const grid = <CartesianGrid vertical={false} stroke="var(--color-border)" />

function yAxis(currency: string, locale?: string) {
  return (
    <YAxis
      width={52}
      tickLine={false}
      axisLine={false}
      tickCount={4}
      tick={axisTick}
      tickFormatter={compactTick(currency, locale)}
    />
  )
}

/** Spending per month for the 12 months ending with the report's last month. */
export function TrendChart({ months, currency, locale }: Common & { months: MonthTotals[] }) {
  const money = (v: number) => formatMoney(v, currency, locale)
  const data = months.map((m) => ({ ...m, label: monthLabel(m.month, locale) }))
  const busiest = months.reduce<MonthTotals | null>(
    (best, m) => (m.expense > 0 && (!best || m.expense > best.expense) ? m : best),
    null,
  )
  return (
    <ChartCard
      title="Monthly spending trend"
      description="Last 12 months"
      empty={busiest ? null : 'No spending in these 12 months.'}
      chart={
        <div
          className="h-56"
          role="img"
          aria-label={`Monthly spending for 12 months. Highest: ${busiest ? `${money(busiest.expense)} in ${monthLabel(busiest.month, locale, true)}` : 'none'}.`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
              {grid}
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={axisTick}
                minTickGap={8}
              />
              {yAxis(currency, locale)}
              <Tooltip
                cursor={{ fill: 'var(--color-muted)' }}
                contentStyle={tooltipStyle}
                formatter={(v) => [money(Number(v)), 'Spent']}
              />
              <Bar
                dataKey="expense"
                name="Spent"
                fill={EXPENSE_COLOR}
                radius={[4, 4, 0, 0]}
                maxBarSize={32}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      }
      table={
        <DataTable
          caption="Monthly spending, last 12 months"
          rows={months}
          rowKey={(m) => m.month}
          columns={[
            { header: 'Month', cell: (m) => monthLabel(m.month, locale, true) },
            { header: 'Spent', numeric: true, cell: (m) => money(m.expense) },
          ]}
        />
      }
    />
  )
}

/** Income and spending side by side for each month in the range. */
export function IncomeExpenseChart({
  months,
  currency,
  locale,
}: Common & { months: MonthTotals[] }) {
  const money = (v: number) => formatMoney(v, currency, locale)
  const data = months.map((m) => ({ ...m, label: monthLabel(m.month, locale) }))
  const any = months.some((m) => m.income > 0 || m.expense > 0)
  return (
    <ChartCard
      title="Income vs spending"
      description="By month"
      empty={any ? null : 'No income or spending in this period.'}
      chart={
        <div
          className="h-56"
          role="img"
          aria-label={`Income and spending by month: ${months
            .map(
              (m) =>
                `${monthLabel(m.month, locale, true)} income ${money(m.income)}, spent ${money(m.expense)}`,
            )
            .join('; ')}`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
              {grid}
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTick} />
              {yAxis(currency, locale)}
              <Tooltip
                cursor={{ fill: 'var(--color-muted)' }}
                contentStyle={tooltipStyle}
                formatter={(v, name) => [money(Number(v)), name]}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar
                dataKey="income"
                name="Income"
                fill={INCOME_COLOR}
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
                isAnimationActive={false}
              />
              <Bar
                dataKey="expense"
                name="Spending"
                fill={EXPENSE_COLOR}
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      }
      table={
        <DataTable
          caption="Income and spending by month"
          rows={months}
          rowKey={(m) => m.month}
          columns={[
            { header: 'Month', cell: (m) => monthLabel(m.month, locale, true) },
            { header: 'Income', numeric: true, cell: (m) => money(m.income) },
            { header: 'Spending', numeric: true, cell: (m) => money(m.expense) },
            { header: 'Net', numeric: true, cell: (m) => money(m.net) },
          ]}
        />
      }
    />
  )
}

/** Running net (income minus spending) through the range, day by day. */
export function CashFlowChart({ days, currency, locale }: Common & { days: DayFlow[] }) {
  const money = (v: number) => formatMoney(v, currency, locale)
  const short = (d: string) => formatCalendarDate(d, locale, { day: 'numeric', month: 'short' })
  const last = days[days.length - 1]
  const any = days.some((d) => d.income > 0 || d.expense > 0)
  return (
    <ChartCard
      title="Cash flow"
      description="Running total of income minus spending"
      empty={any ? null : 'No income or spending in this period.'}
      chart={
        <div
          className="h-56"
          role="img"
          aria-label={`Cash flow. Net at the end of the period: ${money(last?.cumulative ?? 0)}.`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={days} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              {grid}
              <XAxis
                dataKey="date"
                tickFormatter={short}
                tickLine={false}
                axisLine={false}
                tick={axisTick}
                minTickGap={24}
              />
              {yAxis(currency, locale)}
              <ReferenceLine y={0} stroke="var(--color-muted-foreground)" strokeDasharray="4 4" />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(d) =>
                  formatCalendarDate(String(d), locale, { dateStyle: 'medium' })
                }
                formatter={(v) => [money(Number(v)), 'Net so far']}
              />
              <Line
                type="monotone"
                dataKey="cumulative"
                stroke={NET_COLOR}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      }
      table={
        <DataTable
          caption="Cash flow by day"
          rows={days.filter((d) => d.income > 0 || d.expense > 0)}
          rowKey={(d) => d.date}
          columns={[
            {
              header: 'Date',
              cell: (d) => formatCalendarDate(d.date, locale, { dateStyle: 'medium' }),
            },
            { header: 'Income', numeric: true, cell: (d) => money(d.income) },
            { header: 'Spending', numeric: true, cell: (d) => money(d.expense) },
            { header: 'Net so far', numeric: true, cell: (d) => money(d.cumulative) },
          ]}
        />
      }
    />
  )
}
