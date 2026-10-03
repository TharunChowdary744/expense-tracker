import { Plus, Target } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ListStates'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useUid } from '@/features/auth/hooks'
import { useUserSettings } from '@/features/settings/hooks'
import { useGetBudgetsQuery } from '../api'
import { BudgetCard } from '../components/BudgetCard'
import { BudgetDialog } from '../components/BudgetDialog'
import { DeleteBudgetDialog } from '../components/DeleteBudgetDialog'
import { PeriodNav } from '../components/PeriodNav'
import { useBudgetStatuses } from '../hooks/useBudgetStatuses'
import { usePeriodParams } from '../hooks/usePeriodParams'
import { BUDGET_PERIOD_LABELS, BUDGET_PERIODS, type BudgetPeriodKind } from '../schemas'
import type { Budget } from '../types'
import { budgetScopeLabel } from '../utils'

type DialogState = { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; budget: Budget }

export function BudgetsPage() {
  const uid = useUid()
  const { baseCurrency, locale, weekStartsOn } = useUserSettings()
  const { data: budgets, error, isLoading, refetch } = useGetBudgetsQuery(uid)
  const [params, setParams] = useSearchParams()
  const [dialog, setDialog] = useState<DialogState>({ mode: 'closed' })
  const [deleting, setDeleting] = useState<Budget | null>(null)

  const kinds = BUDGET_PERIODS.filter((k) => budgets?.some((b) => b.period === k))
  const viewParam = params.get('view')
  const view: BudgetPeriodKind =
    viewParam === 'weekly' || viewParam === 'monthly'
      ? viewParam
      : kinds.length === 1 && kinds[0]
        ? kinds[0]
        : 'monthly'
  const visible = useMemo(() => (budgets ?? []).filter((b) => b.period === view), [budgets, view])
  const nav = usePeriodParams(view, weekStartsOn)
  const status = useBudgetStatuses(visible, nav.period, nav.today)

  function setView(next: string) {
    setParams(
      (prev) => {
        const copy = new URLSearchParams(prev)
        copy.set('view', next)
        copy.delete('at')
        return copy
      },
      { replace: true },
    )
  }

  const addButton = (
    <Button onClick={() => setDialog({ mode: 'create' })}>
      <Plus aria-hidden />
      Add budget
    </Button>
  )

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Budgets</h1>
        {addButton}
      </div>

      {isLoading ? (
        <ListSkeleton label="Loading budgets" />
      ) : error ? (
        <ErrorState
          title="Could not load your budgets"
          message={String(error)}
          onRetry={() => void refetch()}
        />
      ) : !budgets || budgets.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No budgets yet"
          description="Set a monthly or weekly limit for all your spending or for chosen categories."
          action={addButton}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <PeriodNav
              period={nav.period}
              locale={locale}
              isCurrent={nav.isCurrent}
              onPrevious={nav.previous}
              onNext={nav.next}
              onReset={nav.reset}
            />
            {kinds.length > 1 && (
              <Tabs value={view} onValueChange={setView}>
                <TabsList aria-label="Budget period">
                  {BUDGET_PERIODS.map((k) => (
                    <TabsTrigger key={k} value={k}>
                      {BUDGET_PERIOD_LABELS[k]}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            )}
          </div>

          {visible.length === 0 ? (
            <EmptyState
              icon={Target}
              title={`No ${view} budgets`}
              description={`Your budgets are ${view === 'monthly' ? 'weekly' : 'monthly'}.`}
              action={addButton}
            />
          ) : status.error ? (
            <ErrorState
              title="Could not load your spending"
              message={String(status.error)}
              onRetry={status.refetch}
            />
          ) : (
            <ul aria-label="Budgets" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visible.map((budget) => (
                <BudgetCard
                  key={budget.id}
                  budget={budget}
                  scope={budgetScopeLabel(budget.categoryIds, status.categories)}
                  status={status.statuses.get(budget.id)}
                  currency={baseCurrency}
                  locale={locale}
                  onEdit={() => setDialog({ mode: 'edit', budget })}
                  onDelete={() => setDeleting(budget)}
                />
              ))}
            </ul>
          )}
        </>
      )}

      <BudgetDialog
        open={dialog.mode !== 'closed'}
        onOpenChange={(open) => {
          if (!open) setDialog({ mode: 'closed' })
        }}
        budget={dialog.mode === 'edit' ? dialog.budget : undefined}
        categories={status.categories}
      />
      <DeleteBudgetDialog
        budget={deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
      />
    </section>
  )
}
