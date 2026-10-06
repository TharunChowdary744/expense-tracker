import { History } from 'lucide-react-native'
import { useCallback, useMemo } from 'react'
import { useGetAccountsQuery } from '@/features/accounts/api'
import { accountBalance, netWorth } from '@/features/accounts/utils'
import { useUid } from '@/features/auth/hooks'
import { useGetCategoriesQuery } from '@/features/categories/api'
import {
  useGetRecentTransactionsQuery,
  useGetTransactionsInRangeQuery,
} from '@/features/reports/api'
import type { DashboardParams } from '@/features/reports/compute'
import {
  parseReportSearch,
  reportSearchParams,
  transactionsLink,
  type ReportSearch,
} from '@/features/reports/params'
import { selectDashboard } from '@/features/reports/selectors'
import {
  DASHBOARD_PRESETS,
  deltaPercent,
  previousRange,
  rangeLabel,
  resolvePreset,
  spanOf,
} from '@/features/reports/utils'
import { useUserSettings } from '@/features/settings/hooks'
import { calendarDate, deviceTimeZone } from '@/utils/dates'
import { formatMoney } from '@/utils/money'
import { Screen } from '@m/components/Screen'
import { ErrorState, ListSkeleton } from '@m/components/ui/ListStates'
import { Text } from '@m/components/ui/Text'
import { LinkText, RangePicker, StatTile, TileGrid, TxMiniList } from '../reports/parts'
import { useRouteSearch } from '../shell/routeSearch'
import {
  BillsDueCard,
  BudgetsSummaryCard,
  DashCard,
  GroupsSummaryCard,
  TopCategoriesCard,
} from './DashboardCards'

const RECENT = 8
const KEYS = ['range', 'from', 'to'] as const

export function DashboardScreen() {
  const uid = useUid()
  const { baseCurrency, locale } = useUserSettings()
  const [params, setParams] = useRouteSearch(KEYS)
  const search = useMemo(() => parseReportSearch(params, DASHBOARD_PRESETS), [params])
  const setSearch = useCallback(
    (next: Pick<ReportSearch, 'preset' | 'from' | 'to'>) =>
      setParams(reportSearchParams({ ...next, accountIds: [], parentId: null, sliceId: null })),
    [setParams],
  )

  const today = calendarDate(new Date())
  const timeZone = deviceTimeZone()
  const range = resolvePreset(search.preset, today, search)
  const dashboardParams = useMemo<DashboardParams>(() => {
    const r = { start: range.start, end: range.end }
    return { range: r, previous: previousRange(r), timeZone }
  }, [range.start, range.end, timeZone])
  const load = spanOf([dashboardParams.range, dashboardParams.previous])

  const txQuery = useGetTransactionsInRangeQuery({ uid, ...load })
  const categoriesQuery = useGetCategoriesQuery(uid)
  const accountsQuery = useGetAccountsQuery(uid)
  const recentQuery = useGetRecentTransactionsQuery({ uid, count: RECENT })

  const summary =
    txQuery.data && categoriesQuery.data
      ? selectDashboard(txQuery.data, categoriesQuery.data, dashboardParams)
      : null
  const worth = useMemo(() => {
    const accounts = accountsQuery.data
    if (!accounts) return null
    return netWorth(accounts, new Map(accounts.map((a) => [a.id, accountBalance(a)])), baseCurrency)
  }, [accountsQuery.data, baseCurrency])
  const accountsById = useMemo(
    () => new Map((accountsQuery.data ?? []).map((a) => [a.id, a])),
    [accountsQuery.data],
  )
  const categoriesById = useMemo(
    () => new Map((categoriesQuery.data ?? []).map((c) => [c.id, c])),
    [categoriesQuery.data],
  )

  const money = (v: number) => formatMoney(v, baseCurrency, locale)
  const previousLabel = `vs ${rangeLabel(dashboardParams.previous, locale)}`
  const loading = !summary
  const error = txQuery.error ?? categoriesQuery.error
  const link = (type?: 'expense' | 'income') =>
    transactionsLink(dashboardParams.range, { preset: search.preset, ...(type ? { type } : {}) })
  const refresh = () => {
    void txQuery.refetch()
    void categoriesQuery.refetch()
    void accountsQuery.refetch()
    void recentQuery.refetch()
  }

  return (
    <Screen refreshing={txQuery.isFetching && !txQuery.isLoading} onRefresh={refresh}>
      <Text tone="muted">{rangeLabel(dashboardParams.range, locale)}</Text>
      <RangePicker presets={DASHBOARD_PRESETS} value={search} onChange={setSearch} today={today} />

      {error ? (
        <ErrorState
          title="Could not load your dashboard"
          message={String(error)}
          onRetry={refresh}
        />
      ) : (
        <TileGrid>
          <StatTile
            label="Spending"
            loading={loading}
            value={money(summary?.totals.expense ?? 0)}
            delta={
              summary ? deltaPercent(summary.totals.expense, summary.previousTotals.expense) : null
            }
            deltaLabel={previousLabel}
            riseIsGood={false}
            locale={locale}
            href={link('expense')}
          />
          <StatTile
            label="Income"
            loading={loading}
            value={money(summary?.totals.income ?? 0)}
            delta={
              summary ? deltaPercent(summary.totals.income, summary.previousTotals.income) : null
            }
            deltaLabel={previousLabel}
            locale={locale}
            href={link('income')}
          />
          <StatTile
            label="Net"
            loading={loading}
            value={money(summary?.totals.net ?? 0)}
            tone={(summary?.totals.net ?? 0) < 0 ? 'negative' : 'default'}
            footnote="Income minus spending"
            href={link()}
          />
          <StatTile
            label="Net worth"
            loading={!worth}
            value={money(worth?.base ?? 0)}
            tone={(worth?.base ?? 0) < 0 ? 'negative' : 'default'}
            footnote={
              worth && worth.other.length > 0
                ? `Plus ${worth.other.map((o) => formatMoney(o.amount, o.currency, locale)).join(', ')}`
                : 'All active accounts, today'
            }
            href="/accounts"
            hrefLabel="Accounts"
          />
        </TileGrid>
      )}

      <TopCategoriesCard
        slices={summary?.topCategories ?? null}
        search={search}
        currency={baseCurrency}
        locale={locale}
      />
      <BudgetsSummaryCard />
      <BillsDueCard />
      <GroupsSummaryCard />
      <DashCard icon={History} title="Recent transactions">
        {recentQuery.error ? (
          <ErrorState
            title="Could not load recent transactions"
            message={String(recentQuery.error)}
            onRetry={() => void recentQuery.refetch()}
          />
        ) : !recentQuery.data || !accountsQuery.data ? (
          <ListSkeleton rows={3} label="Loading recent transactions" />
        ) : recentQuery.data.length === 0 ? (
          <Text variant="small" tone="muted" align="center">
            No transactions yet. Use the + button to add one.
          </Text>
        ) : (
          <>
            <TxMiniList
              label="Recent transactions"
              transactions={recentQuery.data}
              accounts={accountsById}
              categories={categoriesById}
              locale={locale}
            />
            <LinkText title="All transactions" href="/transactions" />
          </>
        )}
      </DashCard>
    </Screen>
  )
}
