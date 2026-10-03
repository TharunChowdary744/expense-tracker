import { cn } from '@/utils/cn'
import { formatCalendarDate } from '@/utils/dates'
import { formatMoney } from '@/utils/money'
import type { DateRange, DayFlow } from '../types'
import { calendarWeeks, heatLevel } from '../utils'
import { ChartCard } from './ChartCard'
import { DataTable } from './DataTable'

const LEVEL_CLASS = ['bg-muted', 'bg-heat-1', 'bg-heat-2', 'bg-heat-3', 'bg-heat-4'] as const

interface Props {
  days: DayFlow[]
  range: DateRange
  weekStartsOn: 0 | 1
  currency: string
  locale?: string
}

/** Daily spending as a calendar: one column per week, darker means more spent. */
export function SpendingHeatmap({ days, range, weekStartsOn, currency, locale }: Props) {
  const money = (v: number) => formatMoney(v, currency, locale)
  const byDate = new Map(days.map((d) => [d.date, d.expense]))
  const max = Math.max(0, ...days.map((d) => d.expense))
  const weeks = calendarWeeks(range, weekStartsOn)
  const weekdayNames = Array.from({ length: 7 }, (_, i) =>
    // 2026-10-04 is a Sunday.
    formatCalendarDate(`2026-10-${String(4 + ((i + weekStartsOn) % 7)).padStart(2, '0')}`, locale, {
      weekday: 'short',
    }),
  )
  const long = (d: string) =>
    formatCalendarDate(d, locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  const busiest = days.reduce<DayFlow | null>(
    (b, d) => (d.expense > (b?.expense ?? 0) ? d : b),
    null,
  )
  const spentDays = days.filter((d) => d.expense > 0)

  return (
    <ChartCard
      title="Daily spending"
      description="Darker days had more spending"
      empty={spentDays.length === 0 ? 'No spending in this period.' : null}
      chart={
        <div className="space-y-2">
          <div
            className="overflow-x-auto pb-1"
            role="img"
            aria-label={`Daily spending calendar. ${spentDays.length} days with spending; highest ${busiest ? `${money(busiest.expense)} on ${long(busiest.date)}` : 'none'}.`}
          >
            <div className="inline-grid grid-flow-col grid-rows-7 gap-[3px]" aria-hidden>
              {weekdayNames.map((name, i) => (
                <span
                  key={name}
                  className="pr-1 text-[10px] leading-3 text-muted-foreground"
                  style={{ gridRow: i + 1, gridColumn: 1 }}
                >
                  {i % 2 === 0 ? name : ''}
                </span>
              ))}
              {weeks.map((week, w) =>
                week.map((date, d) => {
                  const amount = date ? (byDate.get(date) ?? 0) : 0
                  return (
                    <span
                      key={`${w}-${d}`}
                      title={date ? `${long(date)}: ${money(amount)}` : undefined}
                      style={{ gridRow: d + 1, gridColumn: w + 2 }}
                      className={cn(
                        'size-3 rounded-[3px]',
                        date ? LEVEL_CLASS[heatLevel(amount, max)] : 'bg-transparent',
                      )}
                    />
                  )
                }),
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground" aria-hidden>
            Less
            {LEVEL_CLASS.map((c) => (
              <span key={c} className={cn('size-3 rounded-[3px]', c)} />
            ))}
            More
          </div>
        </div>
      }
      table={
        <DataTable
          caption="Spending by day"
          rows={spentDays}
          rowKey={(d) => d.date}
          columns={[
            { header: 'Date', cell: (d) => long(d.date) },
            { header: 'Spent', numeric: true, cell: (d) => money(d.expense) },
          ]}
        />
      }
    />
  )
}
