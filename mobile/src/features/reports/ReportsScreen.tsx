import { ChartPie, Download, FileText, Plus } from 'lucide-react-native'
import { useCallback, useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useAppDispatch } from '@/app/hooks'
import { useGetAccountsQuery } from '@/features/accounts/api'
import { useUid } from '@/features/auth/hooks'
import { useGetCategoriesQuery } from '@/features/categories/api'
import { exportFileName, transactionsToCsv } from '@/features/data/csvExport'
import { useGetTransactionsInRangeQuery } from '@/features/reports/api'
import type { ReportParams } from '@/features/reports/compute'
import {
  parseReportSearch,
  reportSearchParams,
  transactionsLink,
  type ReportSearch,
} from '@/features/reports/params'
import {
  selectRangeTransactions,
  selectReport,
  type DrillParams,
} from '@/features/reports/selectors'
import {
  RANGE_PRESETS,
  deltaPercent,
  previousRange,
  rangeLabel,
  resolvePreset,
  spanOf,
  trailingMonths,
} from '@/features/reports/utils'
import { useUserSettings } from '@/features/settings/hooks'
import { useToast } from '@/features/ui/hooks'
import { dialogOpened } from '@/features/ui/slice'
import { addCalendarDays, calendarDate, deviceTimeZone } from '@/utils/dates'
import { formatMoney } from '@/utils/money'
import { Screen } from '@m/components/Screen'
import { Button } from '@m/components/ui/Button'
import { EmptyState, ErrorState, ListSkeleton } from '@m/components/ui/ListStates'
import { Text } from '@m/components/ui/Text'
import { downloadFile } from '@m/utils/share'
import { StatementSheet } from '../data/StatementSheet'
import { useRouteSearch } from '../shell/routeSearch'
import { LinkText, RangePicker, StatTile, TileGrid, type RangeValue } from './parts'
import {
  AccountFilter,
  CashFlowChart,
  CategoryDonut,
  ComparisonTable,
  IncomeExpenseChart,
  SpendingHeatmap,
  TagReport,
  TopPayees,
  TrendChart,
} from './ReportCharts'

const KEYS = ['range', 'from', 'to', 'acc', 'cat', 'slice'] as const

export function ReportsScreen() {
  const uid = useUid()
  const dispatch = useAppDispatch()
  const toast = useToast()
  const { baseCurrency, locale, weekStartsOn } = useUserSettings()
  const [params, setParams] = useRouteSearch(KEYS)
  const search = useMemo(() => parseReportSearch(params), [params])
  const setSearch = useCallback(
    (next: ReportSearch) => setParams(reportSearchParams(next)),
    [setParams],
  )
  const [statementOpen, setStatementOpen] = useState(false)

  const accountsQuery = useGetAccountsQuery(uid)
  const categoriesQuery = useGetCategoriesQuery(uid)
  const today = calendarDate(new Date())
  const timeZone = deviceTimeZone()

  const range = resolvePreset(search.preset, today, search)
  const accountKey = search.accountIds.join(',')
  const reportParams = useMemo<ReportParams>(() => {
    const r = { start: range.start, end: range.end }
    return {
      range: r,
      previous: previousRange(r),
      trend: trailingMonths(r),
      accountIds: accountKey ? accountKey.split(',') : [],
      timeZone,
    }
  }, [range.start, range.end, accountKey, timeZone])
  const load = spanOf([reportParams.range, reportParams.previous, reportParams.trend])
  const txQuery = useGetTransactionsInRangeQuery({ uid, start: load.start, end: load.end })

  // Computed on the JS thread; the selector memoises on its inputs.
  const report =
    txQuery.data && categoriesQuery.data
      ? selectReport(txQuery.data, categoriesQuery.data, reportParams)
      : null
  const current = useMemo(
    () => (txQuery.data ? selectRangeTransactions(txQuery.data, reportParams) : []),
    [txQuery.data, reportParams],
  )

  const accounts = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data])
  const accountsById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])
  const money = (v: number) => formatMoney(v, baseCurrency, locale)
  const label = rangeLabel(reportParams.range, locale)
  const previousLabel = rangeLabel(reportParams.previous, locale)
  const drill: DrillParams = { parentId: search.parentId, sliceId: search.sliceId }

  async function exportCsv() {
    const csv = transactionsToCsv(current, {
      accounts: accountsById,
      categories: categoriesQuery.data ?? [],
      baseCurrency,
    })
    await downloadFile(
      `﻿${csv}`,
      exportFileName('transactions', range.start, addCalendarDays(range.end, -1), 'csv'),
      'text/csv',
    )
    toast({
      title: `Exported ${current.length} transaction${current.length === 1 ? '' : 's'}`,
      variant: 'success',
    })
  }

  const loading = txQuery.isLoading || categoriesQuery.isLoading || (!report && !txQuery.error)
  const error = txQuery.error ?? categoriesQuery.error
  const link = (type?: 'expense' | 'income') =>
    transactionsLink(reportParams.range, {
      preset: search.preset,
      accountIds: reportParams.accountIds,
      ...(type ? { type } : {}),
    })
  const refresh = () => {
    void txQuery.refetch()
    void categoriesQuery.refetch()
  }

  return (
    <Screen refreshing={txQuery.isFetching && !txQuery.isLoading} onRefresh={refresh}>
      <View style={styles.actions}>
        <Button
          title="Export CSV"
          icon={Download}
          variant="outline"
          size="sm"
          disabled={!txQuery.data || !categoriesQuery.data}
          onPress={() => void exportCsv()}
        />
        <Button
          title="PDF statement"
          icon={FileText}
          variant="outline"
          size="sm"
          onPress={() => setStatementOpen(true)}
        />
      </View>

      <RangePicker
        presets={RANGE_PRESETS}
        today={today}
        value={search}
        onChange={(next: RangeValue) =>
          setSearch({ ...search, ...next, parentId: null, sliceId: null })
        }
      />
      <AccountFilter
        accounts={accounts}
        selected={search.accountIds}
        onChange={(accountIds) => setSearch({ ...search, accountIds })}
      />
      <Text variant="small" tone="muted" accessibilityLiveRegion="polite">
        {label}
      </Text>

      {error ? (
        <ErrorState title="Could not load your reports" message={String(error)} onRetry={refresh} />
      ) : loading || !report ? (
        <ListSkeleton rows={4} label="Loading reports" />
      ) : (
        <>
          <TileGrid>
            <StatTile
              label="Income"
              value={money(report.totals.income)}
              delta={deltaPercent(report.totals.income, report.previousTotals.income)}
              deltaLabel={`vs ${previousLabel}`}
              locale={locale}
              href={link('income')}
            />
            <StatTile
              label="Spending"
              value={money(report.totals.expense)}
              delta={deltaPercent(report.totals.expense, report.previousTotals.expense)}
              deltaLabel={`vs ${previousLabel}`}
              riseIsGood={false}
              locale={locale}
              href={link('expense')}
            />
            <StatTile
              label="Net"
              value={money(report.totals.net)}
              tone={report.totals.net < 0 ? 'negative' : 'default'}
              delta={deltaPercent(report.totals.net, report.previousTotals.net)}
              deltaLabel={`vs ${previousLabel}`}
              locale={locale}
            />
            <StatTile
              label="Transactions"
              value={String(report.totals.count)}
              footnote="Income and spending; transfers aren't counted."
              href={link()}
            />
          </TileGrid>

          {current.length === 0 ? (
            <EmptyState
              icon={ChartPie}
              title="Nothing to report for this period"
              description="Pick a wider range, or add transactions."
              action={
                <Button
                  title="Add transaction"
                  icon={Plus}
                  onPress={() => dispatch(dialogOpened({ kind: 'quick-add' }))}
                />
              }
            />
          ) : null}

          <CategoryDonut
            transactions={current}
            categories={categoriesQuery.data ?? []}
            accounts={accountsById}
            drill={drill}
            onDrill={(next) => setSearch({ ...search, ...next })}
            currency={baseCurrency}
            locale={locale}
          />
          <TrendChart months={report.monthlyTrend} currency={baseCurrency} locale={locale} />
          <IncomeExpenseChart
            months={report.incomeVsExpense}
            currency={baseCurrency}
            locale={locale}
          />
          <CashFlowChart days={report.flow} currency={baseCurrency} locale={locale} />
          <SpendingHeatmap
            days={report.flow}
            range={reportParams.range}
            weekStartsOn={weekStartsOn}
            currency={baseCurrency}
            locale={locale}
          />
          <TopPayees payees={report.payees} currency={baseCurrency} locale={locale} />
          <TagReport tags={report.tags} currency={baseCurrency} locale={locale} />
          <ComparisonTable
            comparison={report.comparison}
            currentLabel={label}
            previousLabel={previousLabel}
            currency={baseCurrency}
            locale={locale}
          />
          <Text variant="caption" tone="muted">
            Amounts are in {baseCurrency}, using each transaction’s rate when it was entered.
            Transfers between your accounts are left out.
          </Text>
          <LinkText title="Import and export" href="/data" />
        </>
      )}
      <StatementSheet open={statementOpen} onClose={() => setStatementOpen(false)} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' },
})
