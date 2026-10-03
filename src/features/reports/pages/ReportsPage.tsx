import { ChartPie, Download, FileText, Plus } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useAppDispatch } from '@/app/hooks'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ListStates'
import { Button } from '@/components/ui/button'
import { useGetAccountsQuery } from '@/features/accounts/api'
import { useUid } from '@/features/auth/hooks'
import { useGetCategoriesQuery } from '@/features/categories/api'
import { StatementDialog } from '@/features/data/components/StatementDialog'
import { exportFileName, transactionsToCsv } from '@/features/data/csvExport'
import { useUserSettings } from '@/features/settings/hooks'
import { useToast } from '@/features/ui/hooks'
import { dialogOpened } from '@/features/ui/slice'
import { addCalendarDays, calendarDate, deviceTimeZone } from '@/utils/dates'
import { downloadFile } from '@/utils/download'
import { formatMoney } from '@/utils/money'
import { useGetTransactionsInRangeQuery } from '../api'
import { AccountFilter } from '../components/AccountFilter'
import { CategoryDonut } from '../components/CategoryDonut'
import { ComparisonTable, TagReport, TopPayees } from '../components/ListReports'
import { RangePicker, type RangeValue } from '../components/RangePicker'
import { SpendingHeatmap } from '../components/SpendingHeatmap'
import { StatTile } from '../components/StatTile'
import { CashFlowChart, IncomeExpenseChart, TrendChart } from '../components/TimeCharts'
import type { ReportParams } from '../compute'
import { useReport } from '../hooks/useReport'
import {
  parseReportSearch,
  reportSearchParams,
  transactionsLink,
  type ReportSearch,
} from '../params'
import { selectRangeTransactions, type DrillParams } from '../selectors'
import {
  RANGE_PRESETS,
  deltaPercent,
  previousRange,
  rangeLabel,
  resolvePreset,
  spanOf,
  trailingMonths,
} from '../utils'

export function ReportsPage() {
  const uid = useUid()
  const dispatch = useAppDispatch()
  const toast = useToast()
  const { baseCurrency, locale, weekStartsOn } = useUserSettings()
  const [params, setParams] = useSearchParams()
  const key = params.toString()
  const search = useMemo(() => parseReportSearch(new URLSearchParams(key)), [key])
  const setSearch = useCallback(
    (next: ReportSearch) => setParams(reportSearchParams(next), { replace: true }),
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

  const {
    report,
    computing,
    error: computeError,
  } = useReport(txQuery.data, categoriesQuery.data, reportParams)
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

  function exportCsv() {
    const csv = transactionsToCsv(current, {
      accounts: accountsById,
      categories: categoriesQuery.data ?? [],
      baseCurrency,
    })
    downloadFile(
      `\ufeff${csv}`,
      exportFileName('transactions', range.start, addCalendarDays(range.end, -1), 'csv'),
      'text/csv;charset=utf-8',
    )
    toast({
      title: `Exported ${current.length} transaction${current.length === 1 ? '' : 's'}`,
      variant: 'success',
    })
  }

  const loading = txQuery.isLoading || categoriesQuery.isLoading || (!report && !txQuery.error)
  const error = txQuery.error ?? categoriesQuery.error ?? computeError
  const link = (type?: 'expense' | 'income') =>
    transactionsLink(reportParams.range, {
      preset: search.preset,
      accountIds: reportParams.accountIds,
      ...(type ? { type } : {}),
    })

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={exportCsv}
            disabled={!txQuery.data || !categoriesQuery.data}
          >
            <Download aria-hidden />
            Export CSV
          </Button>
          <Button variant="outline" onClick={() => setStatementOpen(true)}>
            <FileText aria-hidden />
            PDF statement
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4">
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
      </div>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {label}
        {computing && ' · Updating…'}
      </p>

      {error ? (
        <ErrorState
          title="Could not load your reports"
          message={String(error)}
          onRetry={() => {
            void txQuery.refetch()
            void categoriesQuery.refetch()
          }}
        />
      ) : loading || !report ? (
        <ListSkeleton rows={4} label="Loading reports" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
          </div>

          {current.length === 0 ? (
            <EmptyState
              icon={ChartPie}
              title="Nothing to report for this period"
              description="Pick a wider range, or add transactions."
              action={
                <Button onClick={() => dispatch(dialogOpened({ kind: 'quick-add' }))}>
                  <Plus aria-hidden />
                  Add transaction
                </Button>
              }
            />
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="lg:col-span-2">
              <CategoryDonut
                transactions={current}
                categories={categoriesQuery.data ?? []}
                accounts={accountsById}
                drill={drill}
                onDrill={(next) => setSearch({ ...search, ...next })}
                currency={baseCurrency}
                locale={locale}
              />
            </div>
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
            <div className="lg:col-span-2">
              <ComparisonTable
                comparison={report.comparison}
                currentLabel={label}
                previousLabel={previousLabel}
                currency={baseCurrency}
                locale={locale}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Amounts are in {baseCurrency}, using each transaction's rate when it was entered.
            Transfers between your accounts are left out.{' '}
            <Link to="/data" className="underline underline-offset-4">
              Import and export
            </Link>
          </p>
        </>
      )}
      <StatementDialog open={statementOpen} onOpenChange={setStatementOpen} />
    </section>
  )
}
