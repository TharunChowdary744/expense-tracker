import { ArrowLeft, Pencil, Receipt, Trash2 } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ListStates'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useGetAccountsQuery } from '@/features/accounts/api'
import { useUid } from '@/features/auth/hooks'
import { useUserSettings } from '@/features/settings/hooks'
import { scheduleDelete } from '@/features/transactions/deleteFlow'
import { TransactionRow } from '@/features/transactions/components/TransactionRow'
import type { Transaction } from '@/features/transactions/types'
import { dialogOpened } from '@/features/ui/slice'
import { useGetBudgetsQuery } from '../api'
import { BudgetDialog } from '../components/BudgetDialog'
import { BudgetSummary } from '../components/BudgetSummary'
import { DeleteBudgetDialog } from '../components/DeleteBudgetDialog'
import { PeriodNav } from '../components/PeriodNav'
import { SpendChart } from '../components/SpendChart'
import { useBudgetStatuses } from '../hooks/useBudgetStatuses'
import { usePeriodParams } from '../hooks/usePeriodParams'
import { BUDGET_PERIOD_LABELS } from '../schemas'
import { budgetScopeLabel } from '../utils'

const NO_BUDGETS: never[] = []

export function BudgetDetailPage() {
  const { budgetId } = useParams()
  const uid = useUid()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { baseCurrency, locale, weekStartsOn } = useUserSettings()
  const { data: budgets, error, isLoading, refetch } = useGetBudgetsQuery(uid)
  const { data: accounts } = useGetAccountsQuery(uid)
  const pendingDeletes = useAppSelector((s) => s.transactions.pendingDeletes)
  const budget = budgets?.find((b) => b.id === budgetId)
  const nav = usePeriodParams(budget?.period ?? 'monthly', weekStartsOn)
  const list = useMemo(() => (budget ? [budget] : NO_BUDGETS), [budget])
  const status = useBudgetStatuses(list, nav.period, nav.today)
  const current = budget ? status.statuses.get(budget.id) : undefined
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const accountMap = useMemo(() => new Map((accounts ?? []).map((a) => [a.id, a])), [accounts])
  const categoryMap = useMemo(
    () => new Map(status.categories.map((c) => [c.id, c])),
    [status.categories],
  )
  const hidden = useMemo(() => new Set(Object.values(pendingDeletes).flat()), [pendingDeletes])
  const currencies = useMemo(
    () => Object.fromEntries((accounts ?? []).map((a) => [a.id, a.currency])),
    [accounts],
  )

  const onEdit = useCallback(
    (tx: Transaction) => dispatch(dialogOpened({ kind: 'edit-transaction', transaction: tx })),
    [dispatch],
  )
  const onDuplicate = useCallback(
    (tx: Transaction) =>
      dispatch(dialogOpened({ kind: 'edit-transaction', transaction: tx, duplicate: true })),
    [dispatch],
  )
  const onDelete = useCallback(
    (tx: Transaction) => dispatch(scheduleDelete({ uid, transactions: [tx], currencies })),
    [dispatch, uid, currencies],
  )

  if (isLoading) return <ListSkeleton label="Loading budget" />
  if (error) {
    return (
      <ErrorState
        title="Could not load this budget"
        message={String(error)}
        onRetry={() => void refetch()}
      />
    )
  }
  if (!budget) {
    return (
      <EmptyState
        icon={Receipt}
        title="Budget not found"
        description="It may have been deleted."
        action={
          <Button asChild variant="outline">
            <Link to="/budgets">Back to budgets</Link>
          </Button>
        }
      />
    )
  }

  const counted = current?.transactions.filter((t) => !hidden.has(t.id)) ?? []

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            to={`/budgets?view=${budget.period}&at=${nav.period.start}`}
            className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Budgets
          </Link>
          <h1 className="truncate text-2xl font-semibold tracking-tight">{budget.name}</h1>
          <p className="text-sm text-muted-foreground">
            {BUDGET_PERIOD_LABELS[budget.period]} ·{' '}
            {budgetScopeLabel(budget.categoryIds, status.categories)}
            {budget.rollover && ' · Rollover'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Pencil aria-hidden />
            Edit
          </Button>
          <Button variant="outline" onClick={() => setDeleting(true)} aria-label="Delete budget">
            <Trash2 aria-hidden />
          </Button>
        </div>
      </div>

      <PeriodNav
        period={nav.period}
        locale={locale}
        isCurrent={nav.isCurrent}
        onPrevious={nav.previous}
        onNext={nav.next}
        onReset={nav.reset}
      />

      {status.error ? (
        <ErrorState
          title="Could not load your spending"
          message={String(status.error)}
          onRetry={status.refetch}
        />
      ) : !current ? (
        <div className="space-y-3 rounded-xl border bg-card p-4" role="status" aria-label="Loading">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-2.5 w-full" />
          <Skeleton className="h-44 w-full" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border bg-card p-4">
              <BudgetSummary
                name={budget.name}
                status={current}
                currency={baseCurrency}
                locale={locale}
              />
            </div>
            <div className="rounded-xl border bg-card p-4">
              <SpendChart
                byDay={current.byDay}
                dailyTarget={Math.max(0, Math.floor(current.limit / current.totalDays))}
                currency={baseCurrency}
                locale={locale}
              />
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="text-lg font-semibold">
              Transactions counted{' '}
              <span className="text-sm font-normal text-muted-foreground">({counted.length})</span>
            </h2>
            {counted.length === 0 ? (
              <EmptyState
                icon={Receipt}
                title="Nothing counted yet"
                description="Expenses in this budget's categories for this period show here."
              />
            ) : (
              <ul aria-label="Transactions counted" className="space-y-2">
                {counted.map((tx) => (
                  <TransactionRow
                    key={tx.id}
                    tx={tx}
                    accounts={accountMap}
                    categories={categoryMap}
                    baseCurrency={baseCurrency}
                    locale={locale}
                    selected={false}
                    onEdit={onEdit}
                    onDuplicate={onDuplicate}
                    onDelete={onDelete}
                  />
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      <BudgetDialog
        open={editing}
        onOpenChange={setEditing}
        budget={budget}
        categories={status.categories}
      />
      <DeleteBudgetDialog
        budget={deleting ? budget : null}
        onOpenChange={setDeleting}
        onDeleted={() => void navigate('/budgets')}
      />
    </section>
  )
}
