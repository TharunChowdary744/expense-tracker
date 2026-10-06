import { CalendarClock, ChartPie, Target, Users } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { useMemo, type ReactNode } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useUid } from '@/features/auth/hooks'
import { useGetBudgetsQuery } from '@/features/budgets/api'
import { useBudgetStatuses } from '@/features/budgets/hooks/useBudgetStatuses'
import { periodContaining } from '@/features/budgets/period'
import { formatPercent } from '@/features/budgets/tone'
import type { Budget } from '@/features/budgets/types'
import { useGetCategoriesQuery } from '@/features/categories/api'
import { useGetGroupsQuery } from '@/features/groups/api'
import { owedSummary } from '@/features/groups/balances'
import { useGroupBalances } from '@/features/groups/hooks/useGroupBalances'
import { balancePhrase } from '@/features/groups/utils'
import { useGetRecurringQuery } from '@/features/recurring/api'
import { usePendingOccurrences } from '@/features/recurring/hooks/usePendingOccurrences'
import type { RecurringRule } from '@/features/recurring/types'
import { formatShare } from '@/features/reports/components/chartTheme'
import { reportSearchParams, type ReportSearch } from '@/features/reports/params'
import type { CategorySlice } from '@/features/reports/types'
import { useUserSettings } from '@/features/settings/hooks'
import { calendarDate } from '@/utils/dates'
import { formatMoney } from '@/utils/money'
import { Card } from '@m/components/ui/Card'
import { ErrorState, ListSkeleton } from '@m/components/ui/ListStates'
import { ProgressBar } from '@m/components/ui/ProgressBar'
import { Text } from '@m/components/ui/Text'
import { radius } from '@m/theme/colors'
import { useColors } from '@m/theme/ThemeProvider'
import { useToneColor } from '../budgets/BudgetParts'
import { PendingList } from '../recurring/PendingList'
import { LinkText } from '../reports/parts'
import { openLink } from '../shell/routeSearch'

/** A dashboard section: icon, title, optional right-hand text, body. */
export function DashCard({
  icon: Icon,
  title,
  right,
  children,
}: {
  icon: LucideIcon
  title: string
  right?: ReactNode
  children: ReactNode
}) {
  const c = useColors()
  return (
    <Card>
      <View style={styles.header}>
        <Icon size={16} color={c.foreground} />
        <Text variant="subheading" accessibilityRole="header" style={styles.flex}>
          {title}
        </Text>
        {right}
      </View>
      {children}
    </Card>
  )
}

function Empty({ text, link, href }: { text: string; link: string; href: string }) {
  return (
    <View style={styles.empty}>
      <Text variant="small" tone="muted" align="center">
        {text}
      </Text>
      <LinkText title={link} href={href} />
    </View>
  )
}

/** The five categories with the most spending in the period, linking to the report drill-down. */
export function TopCategoriesCard({
  slices,
  search,
  currency,
  locale,
}: {
  slices: CategorySlice[] | null
  search: Pick<ReportSearch, 'preset' | 'from' | 'to'>
  currency: string
  locale?: string
}) {
  const c = useColors()
  const max = slices?.[0]?.amount ?? 0
  const reportLink = (slice?: CategorySlice) =>
    `/reports?${reportSearchParams({
      ...search,
      accountIds: [],
      parentId: slice?.hasChildren ? slice.id : null,
      sliceId: slice && !slice.hasChildren ? slice.id : null,
    }).toString()}`

  return (
    <DashCard icon={ChartPie} title="Top categories">
      {!slices ? (
        <ListSkeleton rows={2} label="Loading top categories" />
      ) : slices.length === 0 ? (
        <Text variant="small" tone="muted" align="center" style={styles.pad}>
          No spending in this period.
        </Text>
      ) : (
        <>
          <View accessibilityLabel="Top five spending categories" style={styles.list}>
            {slices.map((s, i) => {
              const amount = formatMoney(s.amount, currency, locale)
              const share = formatShare(s.share, locale)
              return (
                <Pressable
                  key={s.id}
                  accessibilityRole="link"
                  accessibilityLabel={`${s.name}, ${amount}, ${share}. Open in reports`}
                  onPress={() => openLink(reportLink(s))}
                  style={({ pressed }) => [styles.slice, pressed && { opacity: 0.7 }]}
                >
                  <View style={styles.sliceText}>
                    <Text variant="small" numberOfLines={1} style={styles.flex}>
                      {s.name}
                    </Text>
                    <Text variant="caption" tone="muted" tabular>
                      {share}
                    </Text>
                    <Text variant="small" weight="600" tabular>
                      {amount}
                    </Text>
                  </View>
                  <ProgressBar
                    value={max > 0 ? Math.max(0.02, s.amount / max) : 0}
                    color={c.chart[i % c.chart.length]}
                  />
                </Pressable>
              )
            })}
          </View>
          <LinkText title="Open reports" href={reportLink()} />
        </>
      )}
    </DashCard>
  )
}

const BUDGETS_SHOWN = 5
const NO_BUDGETS: Budget[] = []

/** This month's and this week's budgets, most used first. */
export function BudgetsSummaryCard() {
  const uid = useUid()
  const toneColor = useToneColor()
  const { baseCurrency, locale, weekStartsOn } = useUserSettings()
  const { data: budgets, error, isLoading, refetch } = useGetBudgetsQuery(uid)
  const today = calendarDate(new Date())
  const monthly = useMemo(
    () => (budgets ?? NO_BUDGETS).filter((b) => b.period === 'monthly'),
    [budgets],
  )
  const weekly = useMemo(
    () => (budgets ?? NO_BUDGETS).filter((b) => b.period === 'weekly'),
    [budgets],
  )
  const month = useMemo(
    () => periodContaining(today, 'monthly', weekStartsOn),
    [today, weekStartsOn],
  )
  const week = useMemo(() => periodContaining(today, 'weekly', weekStartsOn), [today, weekStartsOn])
  const m = useBudgetStatuses(monthly, month, today)
  const w = useBudgetStatuses(weekly, week, today)

  const rows = useMemo(
    () =>
      [...monthly, ...weekly]
        .flatMap((budget) => {
          const status = (budget.period === 'monthly' ? m : w).statuses.get(budget.id)
          return status ? [{ budget, status }] : []
        })
        .sort((a, b) => b.status.percent - a.status.percent),
    [monthly, weekly, m, w],
  )
  const loading = isLoading || m.isLoading || w.isLoading
  const failed = error ?? m.error ?? w.error
  const money = (v: number) => formatMoney(v, baseCurrency, locale)

  return (
    <DashCard icon={Target} title="Budgets">
      {failed ? (
        <ErrorState
          title="Could not load your budgets"
          message={String(failed)}
          onRetry={() => {
            void refetch()
            m.refetch()
            w.refetch()
          }}
        />
      ) : loading ? (
        <ListSkeleton rows={2} label="Loading budgets" />
      ) : rows.length === 0 ? (
        <Empty text="No budgets yet." link="Set a budget" href="/budgets" />
      ) : (
        <>
          <View accessibilityLabel="Budgets this period" style={styles.list}>
            {rows.slice(0, BUDGETS_SHOWN).map(({ budget, status }) => (
              <Pressable
                key={budget.id}
                accessibilityRole="link"
                accessibilityLabel={`${budget.name}, ${budget.period === 'monthly' ? 'this month' : 'this week'}: ${money(status.spent)} of ${money(status.limit)}, ${formatPercent(status.percent)}`}
                onPress={() => openLink(`/budgets/${budget.id}`)}
                style={({ pressed }) => [styles.slice, pressed && { opacity: 0.7 }]}
              >
                <View style={styles.sliceText}>
                  <Text variant="small" weight="600" numberOfLines={1} style={styles.flex}>
                    {budget.name}{' '}
                    <Text variant="caption" tone="muted">
                      {budget.period === 'monthly' ? 'this month' : 'this week'}
                    </Text>
                  </Text>
                  <Text variant="caption" weight="700" style={{ color: toneColor(status.tone) }}>
                    {formatPercent(status.percent)}
                  </Text>
                </View>
                <Text variant="caption" tone="muted" tabular>
                  {money(status.spent)} of {money(status.limit)}
                </Text>
                <ProgressBar value={status.percent / 100} color={toneColor(status.tone)} />
              </Pressable>
            ))}
          </View>
          <LinkText
            title={rows.length > BUDGETS_SHOWN ? `See all ${rows.length}` : 'All budgets'}
            href="/budgets"
          />
        </>
      )}
    </DashCard>
  )
}

const BILL_DAYS = 7
const BILLS_SHOWN = 6
const isExpense = (rule: RecurringRule) => rule.template.type === 'expense'

/** Recurring expenses due in the next 7 days, plus overdue reminders. */
export function BillsDueCard() {
  const uid = useUid()
  const { baseCurrency, locale } = useUserSettings()
  const { data: rules, error, refetch } = useGetRecurringQuery(uid)
  const categories = useGetCategoriesQuery(uid)
  const categoryMap = useMemo(
    () => new Map((categories.data ?? []).map((c) => [c.id, c])),
    [categories.data],
  )
  const { items, isLoading } = usePendingOccurrences(rules, BILL_DAYS, isExpense)
  const total = items.reduce((sum, i) => sum + i.rule.template.baseAmount, 0)

  return (
    <DashCard
      icon={CalendarClock}
      title="Bills due in the next 7 days"
      right={
        items.length > 0 ? (
          <Text
            variant="small"
            weight="600"
            tabular
            accessibilityLabel={`Total ${formatMoney(total, baseCurrency, locale)}`}
          >
            {formatMoney(total, baseCurrency, locale)}
          </Text>
        ) : undefined
      }
    >
      {error ? (
        <ErrorState
          title="Could not load your recurring bills"
          message={String(error)}
          onRetry={() => void refetch()}
        />
      ) : isLoading ? (
        <ListSkeleton rows={2} label="Loading bills due" />
      ) : items.length === 0 ? (
        <Empty text="No recurring bills due this week." link="Manage recurring" href="/recurring" />
      ) : (
        <>
          <PendingList
            label="Bills due"
            items={items.slice(0, BILLS_SHOWN)}
            categories={categoryMap}
            locale={locale}
          />
          <LinkText
            title={items.length > BILLS_SHOWN ? `See all ${items.length}` : 'Open Recurring'}
            href={
              items.some((i) => i.rule.mode === 'remind') ? '/recurring?tab=upcoming' : '/recurring'
            }
          />
        </>
      )}
    </DashCard>
  )
}

const GROUPS_SHOWN = 5

/** What the user owes and is owed across their groups, per currency. */
export function GroupsSummaryCard() {
  const c = useColors()
  const uid = useUid()
  const { locale } = useUserSettings()
  const { data: groups, error, isLoading, refetch } = useGetGroupsQuery(uid)
  const balances = useGroupBalances(uid, groups)

  const summary = useMemo(() => {
    const byCurrency = new Map<string, number[]>()
    const rows: { id: string; name: string; emoji: string; currency: string; net: number }[] = []
    let loading = false
    let failed = false
    for (const group of groups ?? []) {
      const balance = balances.get(group.id)
      if (!balance || balance.loading) loading = true
      if (balance?.error) failed = true
      const net = balance?.net.get(uid) ?? 0
      byCurrency.set(group.currency, [...(byCurrency.get(group.currency) ?? []), net])
      if (net !== 0) rows.push({ ...group, net })
    }
    const totals = [...byCurrency].map(([currency, nets]) => ({ currency, ...owedSummary(nets) }))
    rows.sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
    return { totals, rows, loading, failed }
  }, [groups, balances, uid])

  const owe = summary.totals.filter((t) => t.owe > 0)
  const owed = summary.totals.filter((t) => t.owed > 0)
  const list = (items: { currency: string; amount: number }[]) =>
    items.map((t) => formatMoney(t.amount, t.currency, locale)).join(' + ')
  const zero = formatMoney(0, groups?.[0]?.currency ?? 'INR', locale)

  return (
    <DashCard icon={Users} title="Groups">
      {error ? (
        <ErrorState
          title="Could not load your groups"
          message={String(error)}
          onRetry={() => void refetch()}
        />
      ) : isLoading || (summary.loading && !summary.failed) ? (
        <ListSkeleton rows={1} label="Loading group balances" />
      ) : !groups || groups.length === 0 ? (
        <Empty text="Split bills with friends." link="Create a group" href="/groups" />
      ) : (
        <>
          <View style={styles.owe}>
            <View style={[styles.oweBox, { backgroundColor: c.muted }]}>
              <Text variant="small" tone="muted">
                You owe
              </Text>
              <Text variant="subheading" tabular tone={owe.length > 0 ? 'destructive' : 'default'}>
                {owe.length > 0
                  ? list(owe.map((t) => ({ currency: t.currency, amount: t.owe })))
                  : zero}
              </Text>
            </View>
            <View style={[styles.oweBox, { backgroundColor: c.muted }]}>
              <Text variant="small" tone="muted">
                You are owed
              </Text>
              <Text variant="subheading" tabular tone={owed.length > 0 ? 'success' : 'default'}>
                {owed.length > 0
                  ? list(owed.map((t) => ({ currency: t.currency, amount: t.owed })))
                  : zero}
              </Text>
            </View>
          </View>
          {summary.failed ? (
            <Text variant="caption" tone="muted">
              Some group balances couldn’t be loaded.
            </Text>
          ) : null}
          {summary.rows.slice(0, GROUPS_SHOWN).map((row) => {
            const phrase = balancePhrase(row.net, row.currency, locale)
            return (
              <Pressable
                key={row.id}
                accessibilityRole="link"
                accessibilityLabel={`${row.name}, ${phrase}. Settle up`}
                onPress={() => openLink(`/groups/${row.id}?tab=settle`)}
                style={({ pressed }) => [styles.groupRow, pressed && { opacity: 0.7 }]}
              >
                <Text>{row.emoji}</Text>
                <Text variant="small" numberOfLines={1} style={styles.flex}>
                  {row.name}
                </Text>
                <Text variant="small" tone={row.net < 0 ? 'destructive' : 'success'}>
                  {phrase}
                </Text>
              </Pressable>
            )
          })}
          <LinkText title="All groups" href="/groups" />
        </>
      )}
    </DashCard>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1, minWidth: 0 },
  pad: { paddingVertical: 12 },
  empty: { alignItems: 'center', gap: 6, paddingVertical: 12 },
  list: { gap: 12 },
  slice: { gap: 4 },
  sliceText: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  owe: { flexDirection: 'row', gap: 8 },
  oweBox: { flex: 1, borderRadius: radius.md, padding: 10, gap: 2 },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
})
