import { History } from 'lucide-react'
import { useCallback, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ErrorState, ListSkeleton } from '@/components/ListStates'
import { useGetAccountsQuery } from '@/features/accounts/api'
import { accountBalance, netWorth } from '@/features/accounts/utils'
import { useUid } from '@/features/auth/hooks'
import { useGetCategoriesQuery } from '@/features/categories/api'
import { GroupsSummaryCard } from '@/features/groups/components/GroupsSummaryCard'
import { BillsDueWidget } from '@/features/recurring/components/BillsDueWidget'
import {
  useGetRecentTransactionsQuery,
  useGetTransactionsInRangeQuery,
} from '@/features/reports/api'
import { RangePicker } from '@/features/reports/components/RangePicker'
import { StatTile } from '@/features/reports/components/StatTile'
import { TxMiniList } from '@/features/reports/components/TxMiniList'
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
import { BudgetsSummaryCard } from '../components/BudgetsSummaryCard'
import { TopCategoriesCard } from '../components/TopCategoriesCard'

const RECENT = 8

export function DashboardPage() {
  const uid = useUid()
  const { baseCurrency, locale } = useUserSettings()
  const [params, setParams] = useSearchParams()
  const key = params.toString()
  const search = useMemo(
    () => parseReportSearch(new URLSearchParams(key), DASHBOARD_PRESETS),
    [key],
  )
  const setSearch = useCallback(
    (next: Pick<ReportSearch, 'preset' | 'from' | 'to'>) =>
      setParams(reportSearchParams({ ...next, accountIds: [], parentId: null, sliceId: null }), {
        replace: true,
      }),
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

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {rangeLabel(dashboardParams.range, locale)}
          </p>
        </div>
        <RangePicker
          presets={DASHBOARD_PRESETS}
          value={search}
          onChange={setSearch}
          today={today}
        />
      </div>

      {error ? (
        <ErrorState
          title="Could not load your dashboard"
          message={String(error)}
          onRetry={() => {
            void txQuery.refetch()
            void categoriesQuery.refetch()
          }}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <TopCategoriesCard
          slices={summary?.topCategories ?? null}
          search={search}
          currency={baseCurrency}
          locale={locale}
        />
        <BudgetsSummaryCard />
        <BillsDueWidget />
        <GroupsSummaryCard />
        <section
          aria-labelledby="recent-heading"
          className="space-y-3 rounded-xl border bg-card p-4 lg:col-span-2"
        >
          <h2 id="recent-heading" className="flex items-center gap-2 font-semibold">
            <History className="size-4" aria-hidden />
            Recent transactions
          </h2>
          {recentQuery.error ? (
            <ErrorState
              title="Could not load recent transactions"
              message={String(recentQuery.error)}
              onRetry={() => void recentQuery.refetch()}
            />
          ) : !recentQuery.data || !accountsQuery.data ? (
            <ListSkeleton rows={3} label="Loading recent transactions" />
          ) : recentQuery.data.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No transactions yet. Use the + button to add one.
            </p>
          ) : (
            <>
              <TxMiniList
                label="Recent transactions"
                transactions={recentQuery.data}
                accounts={accountsById}
                categories={categoriesById}
                locale={locale}
              />
              <Link
                to="/transactions"
                className="inline-block text-sm font-medium underline underline-offset-4"
              >
                All transactions
              </Link>
            </>
          )}
        </section>
      </div>
    </section>
  )
}
