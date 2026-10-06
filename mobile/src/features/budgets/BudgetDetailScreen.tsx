import { Stack, router, useLocalSearchParams } from 'expo-router'
import { Pencil, Receipt, Trash2 } from 'lucide-react-native'
import { useCallback, useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { useGetAccountsQuery } from '@/features/accounts/api'
import { useUid } from '@/features/auth/hooks'
import { useGetBudgetsQuery } from '@/features/budgets/api'
import { useBudgetStatuses } from '@/features/budgets/hooks/useBudgetStatuses'
import { BUDGET_PERIOD_LABELS } from '@/features/budgets/schemas'
import { budgetScopeLabel } from '@/features/budgets/utils'
import { useUserSettings } from '@/features/settings/hooks'
import { scheduleDelete } from '@/features/transactions/deleteFlow'
import type { Transaction } from '@/features/transactions/types'
import { dialogOpened } from '@/features/ui/slice'
import { Screen } from '@m/components/Screen'
import { Button } from '@m/components/ui/Button'
import { Card } from '@m/components/ui/Card'
import { EmptyState, ErrorState, ListSkeleton } from '@m/components/ui/ListStates'
import { Text } from '@m/components/ui/Text'
import { TransactionRow } from '@m/features/transactions/TransactionRow'
import { BudgetSummary, PeriodNav, SpendChart, usePeriodParams } from './BudgetParts'
import { BudgetDeleteHost, type DialogState } from './BudgetsScreenDialogs'

const NO_BUDGETS: never[] = []

export function BudgetDetailScreen() {
  const { budgetId } = useLocalSearchParams<{ budgetId: string }>()
  const uid = useUid()
  const dispatch = useAppDispatch()
  const { baseCurrency, locale, weekStartsOn } = useUserSettings()
  const { data: budgets, error, isLoading, refetch } = useGetBudgetsQuery(uid)
  const { data: accounts } = useGetAccountsQuery(uid)
  const pendingDeletes = useAppSelector((s) => s.transactions.pendingDeletes)
  const budget = budgets?.find((b) => b.id === budgetId)
  const nav = usePeriodParams(budget?.period ?? 'monthly', weekStartsOn)
  const list = useMemo(() => (budget ? [budget] : NO_BUDGETS), [budget])
  const status = useBudgetStatuses(list, nav.period, nav.today)
  const current = budget ? status.statuses.get(budget.id) : undefined
  const [dialog, setDialog] = useState<DialogState>({ mode: 'closed' })
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

  const header = <Stack.Screen options={{ title: budget?.name ?? 'Budget' }} />

  if (isLoading) {
    return (
      <Screen>
        {header}
        <ListSkeleton label="Loading budget" />
      </Screen>
    )
  }
  if (error) {
    return (
      <Screen>
        {header}
        <ErrorState
          title="Could not load this budget"
          message={String(error)}
          onRetry={() => void refetch()}
        />
      </Screen>
    )
  }
  if (!budget) {
    return (
      <Screen>
        {header}
        <EmptyState
          icon={Receipt}
          title="Budget not found"
          description="It may have been deleted."
          action={
            <Button
              title="Back to budgets"
              variant="outline"
              onPress={() => router.navigate('/budgets')}
            />
          }
        />
      </Screen>
    )
  }

  const counted = current?.transactions.filter((t) => !hidden.has(t.id)) ?? []

  return (
    <Screen>
      {header}
      <View style={styles.head}>
        <Text variant="small" tone="muted" style={styles.flex}>
          {BUDGET_PERIOD_LABELS[budget.period]} ·{' '}
          {budgetScopeLabel(budget.categoryIds, status.categories)}
          {budget.rollover ? ' · Rollover' : ''}
        </Text>
        <Button
          title="Edit"
          icon={Pencil}
          variant="outline"
          size="sm"
          onPress={() => setDialog({ mode: 'edit', budget })}
        />
        <Button
          icon={Trash2}
          variant="outline"
          size="sm"
          accessibilityLabel="Delete budget"
          onPress={() => setDeleting(true)}
        />
      </View>
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
        <ListSkeleton rows={3} label="Loading spending" />
      ) : (
        <>
          <Card>
            <BudgetSummary
              name={budget.name}
              status={current}
              currency={baseCurrency}
              locale={locale}
            />
          </Card>
          <Card>
            <SpendChart
              byDay={current.byDay}
              dailyTarget={Math.max(0, Math.floor(current.limit / current.totalDays))}
              currency={baseCurrency}
              locale={locale}
            />
          </Card>
          <Text variant="subheading" accessibilityRole="header">
            Transactions counted ({counted.length})
          </Text>
          {counted.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="Nothing counted yet"
              description="Expenses in this budget's categories for this period show here."
            />
          ) : (
            <View accessibilityLabel="Transactions counted" style={styles.list}>
              {counted.map((tx) => (
                <TransactionRow
                  key={tx.id}
                  tx={tx}
                  accounts={accountMap}
                  categories={categoryMap}
                  baseCurrency={baseCurrency}
                  locale={locale}
                  onEdit={onEdit}
                  onDuplicate={onDuplicate}
                  onDelete={onDelete}
                />
              ))}
            </View>
          )}
        </>
      )}
      <BudgetDeleteHost
        dialog={dialog}
        onCloseDialog={() => setDialog({ mode: 'closed' })}
        deleting={deleting ? budget : null}
        onCloseDelete={() => setDeleting(false)}
        onDeleted={() => router.navigate('/budgets')}
        categories={status.categories}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 },
  list: { gap: 8 },
})
