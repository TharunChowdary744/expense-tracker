import { router, useLocalSearchParams } from 'expo-router'
import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react-native'
import { useCallback } from 'react'
import { StyleSheet, View } from 'react-native'
import {
  periodContaining,
  periodLabel,
  shiftPeriod,
  type Period,
  type WeekStart,
} from '@/features/budgets/period'
import type { BudgetPeriodKind } from '@/features/budgets/schemas'
import { formatPercent, TONE_LABEL } from '@/features/budgets/tone'
import type { BudgetStatus, BudgetTone, DaySpend } from '@/features/budgets/utils'
import type { Transaction } from '@/features/transactions/types'
import { addCalendarDays, calendarDate, formatCalendarDate, isCalendarDate } from '@/utils/dates'
import { currencyDigits, formatMoney } from '@/utils/money'
import { BarChart } from '@m/components/charts/BarChart'
import { Button, IconButton } from '@m/components/ui/Button'
import { ProgressBar } from '@m/components/ui/ProgressBar'
import { Text } from '@m/components/ui/Text'
import { radius } from '@m/theme/colors'
import { useColors } from '@m/theme/ThemeProvider'

/**
 * The viewed period, kept in the route params (`at=yyyy-MM-dd`) like the web app's URL.
 * Without `at` it is the period containing today.
 */
export function usePeriodParams(kind: BudgetPeriodKind, weekStartsOn: WeekStart) {
  const params = useLocalSearchParams<{ at?: string }>()
  const today = calendarDate(new Date())
  const at = params.at && isCalendarDate(params.at) ? params.at : today
  const period = periodContaining(at, kind, weekStartsOn)
  const current = periodContaining(today, kind, weekStartsOn)
  const goTo = useCallback((next: Period | null) => {
    router.setParams({ at: next ? next.start : undefined })
  }, [])
  return {
    today,
    period,
    isCurrent: period.key === current.key,
    previous: () => goTo(shiftPeriod(period, -1)),
    next: () => goTo(shiftPeriod(period, 1)),
    reset: () => goTo(null),
  }
}

export function PeriodNav({
  period,
  locale,
  isCurrent,
  onPrevious,
  onNext,
  onReset,
}: {
  period: Period
  locale?: string
  isCurrent: boolean
  onPrevious: () => void
  onNext: () => void
  onReset: () => void
}) {
  const unit = period.kind === 'monthly' ? 'month' : 'week'
  return (
    <View style={styles.nav}>
      <IconButton
        icon={ChevronLeft}
        variant="secondary"
        label={`Previous ${unit}`}
        onPress={onPrevious}
      />
      <Text weight="600" align="center" style={styles.navLabel} accessibilityLiveRegion="polite">
        {periodLabel(period, locale)}
      </Text>
      <IconButton icon={ChevronRight} variant="secondary" label={`Next ${unit}`} onPress={onNext} />
      {!isCurrent ? (
        <Button title={`This ${unit}`} size="sm" variant="ghost" onPress={onReset} />
      ) : null}
    </View>
  )
}

const TONE_ICON: Record<BudgetTone, LucideIcon> = {
  ok: CircleCheck,
  warning: TriangleAlert,
  over: CircleAlert,
}

export function useToneColor() {
  const c = useColors()
  return (tone: BudgetTone) =>
    tone === 'ok' ? c.success : tone === 'warning' ? c.warning : c.destructive
}

/** Spent / limit, progress, remaining, days left, daily allowance, projection and rollover. */
export function BudgetSummary({
  name,
  status,
  currency,
  locale,
}: {
  name: string
  status: BudgetStatus<Transaction>
  currency: string
  locale?: string
}) {
  const c = useColors()
  const toneColor = useToneColor()
  const money = (v: number) => formatMoney(v, currency, locale)
  const Icon = TONE_ICON[status.tone]
  const lastDay = addCalendarDays(status.period.end, -1)
  const endLabel = formatCalendarDate(lastDay, locale, { day: 'numeric', month: 'short' })
  const previousLabel = periodLabel(shiftPeriod(status.period, -1), locale)
  const color = toneColor(status.tone)
  const width = Number.isFinite(status.percent) ? status.percent / 100 : 1

  return (
    <View style={styles.summary}>
      <View style={styles.spentRow}>
        <Text>
          <Text variant="heading" tabular>
            {money(status.spent)}
          </Text>
          <Text variant="small" tone="muted">
            {' '}
            of {money(status.limit)}
          </Text>
        </Text>
        <View style={styles.toneRow}>
          <Icon size={16} color={color} />
          <Text variant="small" weight="600" style={{ color }}>
            {formatPercent(status.percent)} · {TONE_LABEL[status.tone]}
          </Text>
        </View>
      </View>
      <ProgressBar
        value={width}
        color={color}
        height={10}
        label={`${name} spending, ${formatPercent(status.percent)} used, ${TONE_LABEL[status.tone].toLowerCase()}`}
      />
      <View style={styles.stats}>
        <Stat
          label={status.remaining < 0 ? 'Over by' : 'Remaining'}
          value={money(Math.abs(status.remaining))}
          tone={status.remaining < 0 ? 'destructive' : undefined}
        />
        <Stat
          label="Days left"
          value={status.timing === 'past' ? 'Ended' : String(status.daysLeft)}
        />
        {status.projected !== null ? (
          <Stat
            label={status.timing === 'past' ? 'Final spend' : `Projected by ${endLabel}`}
            value={money(status.projected)}
            tone={status.projected > status.limit ? 'destructive' : undefined}
          />
        ) : null}
      </View>
      {status.dailyAllowance !== null ? (
        <View style={[styles.allowance, { backgroundColor: c.muted }]}>
          <Text variant="small">
            {status.dailyAllowance > 0 ? (
              <>
                You can spend{' '}
                <Text variant="small" weight="700" tabular>
                  {money(status.dailyAllowance)}
                </Text>
                /day
              </>
            ) : (
              'Nothing left to spend this period'
            )}
          </Text>
        </View>
      ) : null}
      {status.carryOver !== 0 ? (
        <Text variant="caption" tone="muted">
          {status.carryOver > 0
            ? `Includes ${money(status.carryOver)} left over from ${previousLabel}.`
            : `Reduced by ${money(-status.carryOver)} overspent in ${previousLabel}.`}
        </Text>
      ) : null}
    </View>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'destructive' }) {
  return (
    <View style={styles.stat}>
      <Text variant="small" tone="muted">
        {label}
      </Text>
      <Text weight="600" tone={tone} tabular>
        {value}
      </Text>
    </View>
  )
}

/** Spend per day for one budget period, with an even daily share as a dashed guide. */
export function SpendChart({
  byDay,
  dailyTarget,
  currency,
  locale,
}: {
  byDay: readonly DaySpend[]
  dailyTarget: number
  currency: string
  locale?: string
}) {
  const c = useColors()
  const money = (v: number) => formatMoney(v, currency, locale)
  const compact = new Intl.NumberFormat(locale, { notation: 'compact' })
  const busiest = byDay.reduce<DaySpend | null>(
    (best, d) => (d.amount > 0 && (!best || d.amount > best.amount) ? d : best),
    null,
  )
  const longDate = (date: string) =>
    formatCalendarDate(date, locale, { weekday: 'short', day: 'numeric', month: 'short' })
  return (
    <View style={styles.summary}>
      <Text weight="600">Spend by day</Text>
      <BarChart
        height={170}
        data={byDay.map((d) => ({
          key: d.date,
          label: String(Number(d.date.slice(8))),
          longLabel: longDate(d.date),
          values: [d.amount],
        }))}
        series={[{ name: 'Spent', color: c.primary }]}
        guide={dailyTarget}
        formatTick={(v) => compact.format(v / 10 ** currencyDigits(currency))}
        formatValue={money}
        accessibilityLabel={
          busiest
            ? `Spend by day. Highest: ${money(busiest.amount)} on ${longDate(busiest.date)}.`
            : 'Spend by day. Nothing spent in this period.'
        }
      />
      {dailyTarget > 0 ? (
        <Text variant="caption" tone="muted">
          Dashed line: an even daily share of the limit ({money(dailyTarget)}).
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  nav: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  navLabel: { minWidth: 130 },
  summary: { gap: 10 },
  spentRow: { gap: 4 },
  toneRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 },
  stat: { width: '50%' },
  allowance: { borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8 },
})
