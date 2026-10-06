import { ChevronRight } from 'lucide-react-native'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import type { Account } from '@/features/accounts/types'
import type { Category } from '@/features/categories/types'
import { compactTick, formatDelta, formatShare } from '@/features/reports/components/chartTheme'
import { selectDrill, type DrillParams } from '@/features/reports/selectors'
import type {
  CategorySlice,
  Comparison,
  ComparisonRow,
  DateRange,
  DayFlow,
  MonthTotals,
  PayeeTotal,
  TagTotal,
} from '@/features/reports/types'
import { calendarWeeks, heatLevel, monthLabel } from '@/features/reports/utils'
import type { Transaction } from '@/features/transactions/types'
import { formatCalendarDate } from '@/utils/dates'
import { formatMoney } from '@/utils/money'
import { BarChart } from '@m/components/charts/BarChart'
import { ChartCard } from '@m/components/charts/ChartCard'
import { DataTable } from '@m/components/charts/DataTable'
import { Donut } from '@m/components/charts/Donut'
import { LineChart } from '@m/components/charts/LineChart'
import { Meter } from '@m/components/charts/Meter'
import { Card } from '@m/components/ui/Card'
import { Chip } from '@m/components/ui/Controls'
import { Text } from '@m/components/ui/Text'
import { radius } from '@m/theme/colors'
import { useColors } from '@m/theme/ThemeProvider'
import { TxMiniList } from './parts'

interface Common {
  currency: string
  locale?: string
}

/** Toggle chips to limit a report to some accounts ("All accounts" clears the filter). */
export function AccountFilter({
  accounts,
  selected,
  onChange,
}: {
  accounts: readonly Account[]
  selected: readonly string[]
  onChange: (ids: string[]) => void
}) {
  const visible = accounts.filter((a) => !a.archived || selected.includes(a.id))
  if (visible.length < 2) return null
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id])
  return (
    <View style={styles.filter}>
      <Text variant="small" weight="600" tone="muted">
        Accounts
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        <Chip label="All accounts" selected={selected.length === 0} onPress={() => onChange([])} />
        {visible.map((a) => (
          <Chip
            key={a.id}
            label={a.name}
            selected={selected.includes(a.id)}
            onPress={() => toggle(a.id)}
          />
        ))}
      </ScrollView>
    </View>
  )
}

/**
 * Spending by category as a donut. Tapping a legend row drills into the category's
 * subcategories and lists its transactions; a subcategory row lists its own.
 */
export function CategoryDonut({
  transactions,
  categories,
  accounts,
  drill,
  onDrill,
  currency,
  locale,
}: Common & {
  transactions: readonly Transaction[]
  categories: readonly Category[]
  accounts: ReadonlyMap<string, Account>
  drill: DrillParams
  onDrill: (next: DrillParams) => void
}) {
  const c = useColors()
  const { slices, slice, transactions: listed } = selectDrill(transactions, categories, drill)
  const byId = new Map(categories.map((cat) => [cat.id, cat]))
  const parent = drill.parentId ? byId.get(drill.parentId) : undefined
  const total = slices.reduce((sum, s) => sum + s.amount, 0)
  const money = (v: number) => formatMoney(v, currency, locale)
  const color = (i: number) => c.chart[i % c.chart.length] as string

  function choose(s: CategorySlice) {
    if (drill.parentId === null && s.hasChildren) onDrill({ parentId: s.id, sliceId: null })
    else onDrill({ parentId: drill.parentId, sliceId: s.id === drill.sliceId ? null : s.id })
  }

  const levelName = parent?.name ?? 'All categories'
  const listTitle = slice ? slice.name : parent ? parent.name : null

  const chart = (
    <View style={styles.stack}>
      {parent || slice ? (
        <View accessibilityLabel="Category drill-down" style={styles.crumbs}>
          <Pressable
            accessibilityRole="link"
            onPress={() => onDrill({ parentId: null, sliceId: null })}
            hitSlop={6}
          >
            <Text variant="small" style={styles.underline}>
              All categories
            </Text>
          </Pressable>
          {parent ? (
            <>
              <ChevronRight size={14} color={c.mutedForeground} />
              {slice ? (
                <Pressable
                  accessibilityRole="link"
                  onPress={() => onDrill({ parentId: drill.parentId, sliceId: null })}
                  hitSlop={6}
                >
                  <Text variant="small" style={styles.underline}>
                    {parent.name}
                  </Text>
                </Pressable>
              ) : (
                <Text variant="small" weight="600">
                  {parent.name}
                </Text>
              )}
            </>
          ) : null}
          {slice ? (
            <>
              <ChevronRight size={14} color={c.mutedForeground} />
              <Text variant="small" weight="600">
                {slice.name}
              </Text>
            </>
          ) : null}
        </View>
      ) : null}
      <View style={styles.center}>
        <Donut
          slices={slices.map((s, i) => ({ id: s.id, value: s.amount, color: color(i) }))}
          selectedId={drill.sliceId}
          centerLabel="Total"
          centerValue={money(total)}
          accessibilityLabel={`${levelName}: ${slices
            .slice(0, 5)
            .map((s) => `${s.name} ${formatShare(s.share, locale)}`)
            .join(', ')}`}
        />
      </View>
      <View accessibilityLabel={`${levelName} slices`}>
        {slices.map((s, i) => {
          const on = drill.sliceId === s.id
          return (
            <Pressable
              key={s.id}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${s.name}, ${money(s.amount)}, ${formatShare(s.share, locale)}${s.hasChildren ? ', has subcategories' : ''}`}
              onPress={() => choose(s)}
              style={({ pressed }) => [
                styles.legend,
                (on || pressed) && { backgroundColor: c.accent },
              ]}
            >
              <View style={[styles.swatch, { backgroundColor: color(i) }]} />
              <Text variant="small" numberOfLines={1} style={styles.flex}>
                {s.name}
              </Text>
              <Text variant="caption" tone="muted" tabular>
                {formatShare(s.share, locale)}
              </Text>
              <Text variant="small" weight="600" tabular align="right" style={styles.amount}>
                {money(s.amount)}
              </Text>
              {s.hasChildren ? (
                <ChevronRight size={16} color={c.mutedForeground} />
              ) : (
                <View style={styles.chev} />
              )}
            </Pressable>
          )
        })}
      </View>
      {listTitle ? (
        <View style={styles.stack}>
          <Text variant="small" weight="600" accessibilityRole="header">
            {listTitle}: {listed.length} transaction{listed.length === 1 ? '' : 's'}
          </Text>
          <TxMiniList
            label={`${listTitle} transactions`}
            transactions={listed}
            accounts={accounts}
            categories={byId}
            locale={locale}
          />
        </View>
      ) : null}
    </View>
  )

  return (
    <ChartCard
      title="Spending by category"
      description="Tap a category to see its subcategories and transactions."
      empty={slices.length === 0 ? 'No spending in this period.' : null}
      chart={chart}
      table={
        <DataTable
          caption={`Spending by category: ${levelName}`}
          rows={slices}
          rowKey={(s) => s.id}
          columns={[
            {
              header: 'Category',
              cell: (s) => (
                <Pressable accessibilityRole="button" onPress={() => choose(s)}>
                  <Text variant="small" style={styles.underline}>
                    {s.name}
                  </Text>
                </Pressable>
              ),
            },
            { header: 'Amount', numeric: true, cell: (s) => money(s.amount) },
            {
              header: 'Share',
              numeric: true,
              flex: 0.7,
              cell: (s) => formatShare(s.share, locale),
            },
            { header: 'Count', numeric: true, flex: 0.6, cell: (s) => s.count },
          ]}
        />
      }
    />
  )
}

/** Spending per month for the 12 months ending with the report's last month. */
export function TrendChart({ months, currency, locale }: Common & { months: MonthTotals[] }) {
  const c = useColors()
  const money = (v: number) => formatMoney(v, currency, locale)
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
        <BarChart
          data={months.map((m) => ({
            key: m.month,
            label: monthLabel(m.month, locale),
            longLabel: monthLabel(m.month, locale, true),
            values: [m.expense],
          }))}
          series={[{ name: 'Spent', color: c.chartExpense }]}
          formatTick={compactTick(currency, locale)}
          formatValue={money}
          maxLabels={6}
          accessibilityLabel={`Monthly spending for 12 months. Highest: ${busiest ? `${money(busiest.expense)} in ${monthLabel(busiest.month, locale, true)}` : 'none'}.`}
        />
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
  const c = useColors()
  const money = (v: number) => formatMoney(v, currency, locale)
  const any = months.some((m) => m.income > 0 || m.expense > 0)
  return (
    <ChartCard
      title="Income vs spending"
      description="By month"
      empty={any ? null : 'No income or spending in this period.'}
      chart={
        <BarChart
          data={months.map((m) => ({
            key: m.month,
            label: monthLabel(m.month, locale),
            longLabel: monthLabel(m.month, locale, true),
            values: [m.income, m.expense],
          }))}
          series={[
            { name: 'Income', color: c.chartIncome },
            { name: 'Spending', color: c.chartExpense },
          ]}
          formatTick={compactTick(currency, locale)}
          formatValue={money}
          accessibilityLabel={`Income and spending by month: ${months
            .map(
              (m) =>
                `${monthLabel(m.month, locale, true)} income ${money(m.income)}, spent ${money(m.expense)}`,
            )
            .join('; ')}`}
        />
      }
      table={
        <DataTable
          caption="Income and spending by month"
          rows={months}
          rowKey={(m) => m.month}
          minWidth={420}
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
  const c = useColors()
  const money = (v: number) => formatMoney(v, currency, locale)
  const short = (d: string) => formatCalendarDate(d, locale, { day: 'numeric', month: 'short' })
  const medium = (d: string) => formatCalendarDate(d, locale, { dateStyle: 'medium' })
  const last = days[days.length - 1]
  const any = days.some((d) => d.income > 0 || d.expense > 0)
  return (
    <ChartCard
      title="Cash flow"
      description="Running total of income minus spending"
      empty={any ? null : 'No income or spending in this period.'}
      chart={
        <LineChart
          points={days.map((d) => ({
            key: d.date,
            label: short(d.date),
            longLabel: medium(d.date),
            value: d.cumulative,
          }))}
          color={c.chartNet}
          formatTick={compactTick(currency, locale)}
          formatValue={money}
          valueName="Net so far"
          accessibilityLabel={`Cash flow. Net at the end of the period: ${money(last?.cumulative ?? 0)}.`}
        />
      }
      table={
        <DataTable
          caption="Cash flow by day"
          rows={days.filter((d) => d.income > 0 || d.expense > 0)}
          rowKey={(d) => d.date}
          minWidth={420}
          columns={[
            { header: 'Date', cell: (d) => medium(d.date) },
            { header: 'Income', numeric: true, cell: (d) => money(d.income) },
            { header: 'Spending', numeric: true, cell: (d) => money(d.expense) },
            { header: 'Net so far', numeric: true, cell: (d) => money(d.cumulative) },
          ]}
        />
      }
    />
  )
}

const CELL = 14
const CELL_GAP = 3

/** Daily spending as a calendar: one column per week, darker means more spent. */
export function SpendingHeatmap({
  days,
  range,
  weekStartsOn,
  currency,
  locale,
}: Common & { days: DayFlow[]; range: DateRange; weekStartsOn: 0 | 1 }) {
  const c = useColors()
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
  const cell = (color: string, key: string) => (
    <View key={key} style={[styles.heatCell, { backgroundColor: color }]} />
  )

  return (
    <ChartCard
      title="Daily spending"
      description="Darker days had more spending"
      empty={spentDays.length === 0 ? 'No spending in this period.' : null}
      chart={
        <View style={styles.stack}>
          <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={`Daily spending calendar. ${spentDays.length} days with spending; highest ${busiest ? `${money(busiest.expense)} on ${long(busiest.date)}` : 'none'}.`}
          >
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.heat}>
                <View style={styles.heatCol}>
                  {weekdayNames.map((name, i) => (
                    <Text key={name} variant="caption" tone="muted" style={styles.heatLabel}>
                      {i % 2 === 0 ? name : ''}
                    </Text>
                  ))}
                </View>
                {weeks.map((week, w) => (
                  <View key={w} style={styles.heatCol}>
                    {week.map((date, d) =>
                      cell(
                        date
                          ? (c.heat[heatLevel(byDate.get(date) ?? 0, max)] as string)
                          : 'transparent',
                        `${w}-${d}`,
                      ),
                    )}
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
          <View
            style={styles.heatKey}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Text variant="caption" tone="muted">
              Less
            </Text>
            {c.heat.map((color) => cell(color, color))}
            <Text variant="caption" tone="muted">
              More
            </Text>
          </View>
        </View>
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

export function TopPayees({ payees, currency, locale }: Common & { payees: PayeeTotal[] }) {
  const c = useColors()
  const money = (v: number) => formatMoney(v, currency, locale)
  const max = payees[0]?.amount ?? 0
  return (
    <ChartCard
      title="Top payees"
      description="Where most of the money went"
      empty={payees.length === 0 ? 'No spending with a payee in this period.' : null}
      chart={
        <View accessibilityLabel="Top payees by spending" style={styles.bars}>
          {payees.map((p) => (
            <View
              key={p.payee}
              style={styles.barRow}
              accessible
              accessibilityLabel={`${p.payee}, ${money(p.amount)}, ${p.count} transactions`}
            >
              <View style={styles.barText}>
                <Text variant="small" numberOfLines={1} style={styles.flex}>
                  {p.payee}
                </Text>
                <Text variant="small" weight="600" tabular>
                  {money(p.amount)}
                </Text>
                <Text variant="caption" tone="muted">
                  ×{p.count}
                </Text>
              </View>
              <Meter value={p.amount} max={max} color={c.chartExpense} />
            </View>
          ))}
        </View>
      }
      table={
        <DataTable
          caption="Top payees"
          rows={payees}
          rowKey={(p) => p.payee}
          columns={[
            { header: 'Payee', cell: (p) => p.payee },
            { header: 'Spent', numeric: true, cell: (p) => money(p.amount) },
            { header: 'Count', numeric: true, flex: 0.6, cell: (p) => p.count },
          ]}
        />
      }
    />
  )
}

export function TagReport({ tags, currency, locale }: Common & { tags: TagTotal[] }) {
  const c = useColors()
  const money = (v: number) => formatMoney(v, currency, locale)
  const max = Math.max(0, ...tags.map((t) => Math.max(t.expense, t.income)))
  return (
    <ChartCard
      title="Tags"
      description="A transaction with several tags counts under each"
      empty={tags.length === 0 ? 'No tagged transactions in this period.' : null}
      chart={
        <View accessibilityLabel="Spending and income by tag" style={styles.bars}>
          {tags.map((t) => {
            const parts = [
              t.expense > 0 ? `Spent ${money(t.expense)}` : null,
              t.income > 0 ? `Income ${money(t.income)}` : null,
            ].filter(Boolean)
            return (
              <View
                key={t.tag}
                style={styles.barRow}
                accessible
                accessibilityLabel={`#${t.tag}: ${parts.join(', ')}`}
              >
                <View style={styles.barText}>
                  <Text variant="small" numberOfLines={1} style={styles.flex}>
                    #{t.tag}
                  </Text>
                  <Text variant="caption" tone="muted" tabular>
                    {parts.join(' · ')}
                  </Text>
                </View>
                {t.expense > 0 ? (
                  <Meter value={t.expense} max={max} color={c.chartExpense} />
                ) : null}
                {t.income > 0 ? <Meter value={t.income} max={max} color={c.chartIncome} /> : null}
              </View>
            )
          })}
        </View>
      }
      table={
        <DataTable
          caption="Tags"
          rows={tags}
          rowKey={(t) => t.tag}
          minWidth={400}
          columns={[
            { header: 'Tag', cell: (t) => `#${t.tag}` },
            { header: 'Spent', numeric: true, cell: (t) => money(t.expense) },
            { header: 'Income', numeric: true, cell: (t) => money(t.income) },
            { header: 'Count', numeric: true, flex: 0.6, cell: (t) => t.count },
          ]}
        />
      }
    />
  )
}

/** This period against the previous one. It is already a table, so it has no chart toggle. */
export function ComparisonTable({
  comparison,
  currentLabel,
  previousLabel,
  currency,
  locale,
}: Common & { comparison: Comparison; currentLabel: string; previousLabel: string }) {
  const c = useColors()
  const money = (v: number) => formatMoney(v, currency, locale)
  const tone = (r: ComparisonRow, higherIsGood: boolean) =>
    r.change === 0 ? c.foreground : r.change > 0 === higherIsGood ? c.success : c.destructive
  type Row = { row: ComparisonRow; good: boolean; strong: boolean } | { heading: string }
  const changeCell = (r: Row, text: (row: ComparisonRow) => string) =>
    'heading' in r ? (
      ''
    ) : (
      <Text variant="small" tabular align="right" style={{ color: tone(r.row, r.good) }}>
        {text(r.row)}
      </Text>
    )
  const rows: Row[] = [
    { row: comparison.income, good: true, strong: true },
    { row: comparison.expense, good: false, strong: true },
    { row: comparison.net, good: true, strong: true },
    ...(comparison.rows.length > 0
      ? [
          { heading: 'SPENDING BY CATEGORY' },
          ...comparison.rows.map((row) => ({ row, good: false, strong: false })),
        ]
      : []),
  ]
  return (
    <Card>
      <Text variant="subheading" accessibilityRole="header">
        Period comparison
      </Text>
      <Text variant="small" tone="muted">
        {currentLabel} compared with {previousLabel}
      </Text>
      <DataTable
        caption={`${currentLabel} compared with ${previousLabel}`}
        rows={rows}
        rowKey={(r) => ('heading' in r ? 'heading' : r.row.id)}
        minWidth={520}
        columns={[
          {
            header: ' ',
            cell: (r) =>
              'heading' in r ? (
                <Text variant="caption" weight="700" tone="muted" style={styles.groupHead}>
                  {r.heading}
                </Text>
              ) : (
                <Text variant="small" weight={r.strong ? '600' : undefined}>
                  {r.row.name}
                </Text>
              ),
          },
          {
            header: 'This period',
            numeric: true,
            cell: (r) => ('heading' in r ? '' : money(r.row.current)),
          },
          {
            header: 'Previous',
            numeric: true,
            cell: (r) => ('heading' in r ? '' : money(r.row.previous)),
          },
          {
            header: 'Change',
            numeric: true,
            cell: (r) => changeCell(r, (row) => money(row.change)),
          },
          {
            header: '%',
            numeric: true,
            flex: 0.7,
            cell: (r) => changeCell(r, (row) => formatDelta(row.changePercent, locale)),
          },
        ]}
      />
    </Card>
  )
}

const styles = StyleSheet.create({
  filter: { gap: 6 },
  chips: { gap: 6 },
  stack: { gap: 12 },
  center: { alignItems: 'center' },
  crumbs: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  underline: { textDecorationLine: 'underline' },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  swatch: { width: 12, height: 12, borderRadius: 3 },
  flex: { flex: 1, minWidth: 0 },
  amount: { minWidth: 84 },
  chev: { width: 16 },
  heat: { flexDirection: 'row', gap: CELL_GAP },
  heatCol: { gap: CELL_GAP },
  heatLabel: { height: CELL, lineHeight: CELL, fontSize: 10, paddingRight: 4 },
  heatCell: { width: CELL, height: CELL, borderRadius: 3 },
  heatKey: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  bars: { gap: 12 },
  barRow: { gap: 4 },
  barText: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  groupHead: { paddingTop: 12 },
})
