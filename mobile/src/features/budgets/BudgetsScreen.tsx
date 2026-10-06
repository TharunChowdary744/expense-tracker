import { router, useLocalSearchParams } from 'expo-router'
import { Pencil, Plus, Target, Trash2 } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useUid } from '@/features/auth/hooks'
import { useGetBudgetsQuery } from '@/features/budgets/api'
import { useBudgetStatuses } from '@/features/budgets/hooks/useBudgetStatuses'
import {
  BUDGET_PERIODS,
  BUDGET_PERIOD_LABELS,
  type BudgetPeriodKind,
} from '@/features/budgets/schemas'
import type { Budget } from '@/features/budgets/types'
import { budgetScopeLabel, type BudgetStatus } from '@/features/budgets/utils'
import { useUserSettings } from '@/features/settings/hooks'
import type { Transaction } from '@/features/transactions/types'
import { PendingBadge } from '@m/components/PendingBadge'
import { Screen } from '@m/components/Screen'
import { Button } from '@m/components/ui/Button'
import { Card } from '@m/components/ui/Card'
import { Segmented } from '@m/components/ui/Controls'
import { EmptyState, ErrorState, ListSkeleton } from '@m/components/ui/ListStates'
import { ActionMenu } from '@m/components/ui/Menu'
import { Text } from '@m/components/ui/Text'
import { BudgetDeleteHost, type DialogState } from './BudgetsScreenDialogs'
import { BudgetSummary, PeriodNav, usePeriodParams } from './BudgetParts'

export function BudgetsScreen() {
  const uid = useUid()
  const { baseCurrency, locale, weekStartsOn } = useUserSettings()
  const { data: budgets, error, isLoading, isFetching, refetch } = useGetBudgetsQuery(uid)
  const params = useLocalSearchParams<{ view?: string }>()
  const [dialog, setDialog] = useState<DialogState>({ mode: 'closed' })
  const [deleting, setDeleting] = useState<Budget | null>(null)

  const kinds = BUDGET_PERIODS.filter((k) => budgets?.some((b) => b.period === k))
  const view: BudgetPeriodKind =
    params.view === 'weekly' || params.view === 'monthly'
      ? params.view
      : kinds.length === 1 && kinds[0]
        ? kinds[0]
        : 'monthly'
  const visible = useMemo(() => (budgets ?? []).filter((b) => b.period === view), [budgets, view])
  const nav = usePeriodParams(view, weekStartsOn)
  const status = useBudgetStatuses(visible, nav.period, nav.today)

  const addButton = (
    <Button title="Add budget" icon={Plus} onPress={() => setDialog({ mode: 'create' })} />
  )

  return (
    <Screen refreshing={isFetching && !isLoading} onRefresh={() => void refetch()}>
      <View style={styles.top}>{addButton}</View>
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
          {kinds.length > 1 ? (
            <Segmented
              label="Budget period"
              value={view}
              onChange={(next) => router.setParams({ view: next, at: undefined })}
              options={BUDGET_PERIODS.map((k) => ({ value: k, label: BUDGET_PERIOD_LABELS[k] }))}
            />
          ) : null}
          <PeriodNav
            period={nav.period}
            locale={locale}
            isCurrent={nav.isCurrent}
            onPrevious={nav.previous}
            onNext={nav.next}
            onReset={nav.reset}
          />
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
            <View accessibilityLabel="Budgets" style={styles.list}>
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
            </View>
          )}
        </>
      )}
      <BudgetDeleteHost
        dialog={dialog}
        onCloseDialog={() => setDialog({ mode: 'closed' })}
        deleting={deleting}
        onCloseDelete={() => setDeleting(null)}
        categories={status.categories}
      />
    </Screen>
  )
}

function BudgetCard({
  budget,
  scope,
  status,
  currency,
  locale,
  onEdit,
  onDelete,
}: {
  budget: Budget
  scope: string
  status: BudgetStatus<Transaction> | undefined
  currency: string
  locale?: string
  onEdit: () => void
  onDelete: () => void
}) {
  const open = () =>
    router.push({
      pathname: '/budget/[budgetId]',
      params: { budgetId: budget.id, ...(status ? { at: status.period.start } : {}) },
    })
  return (
    <Card style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.flex}>
          <View style={styles.titleRow}>
            <Text
              weight="700"
              numberOfLines={1}
              accessibilityRole="link"
              accessibilityHint="Opens the budget's details"
              onPress={open}
              style={styles.shrink}
            >
              {budget.name}
            </Text>
            {budget.pending ? <PendingBadge /> : null}
          </View>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {scope}
            {budget.rollover ? ' · Rollover' : ''}
          </Text>
        </View>
        <ActionMenu
          label={`Actions for ${budget.name}`}
          title={budget.name}
          actions={[
            { label: 'Open', icon: Target, onPress: open },
            { label: 'Edit', icon: Pencil, onPress: onEdit },
            { label: 'Delete', icon: Trash2, destructive: true, onPress: onDelete },
          ]}
        />
      </View>
      {status ? (
        <BudgetSummary name={budget.name} status={status} currency={currency} locale={locale} />
      ) : (
        <ListSkeleton rows={1} label={`Loading ${budget.name}`} />
      )}
      <Button title="View details" variant="outline" size="sm" onPress={open} />
    </Card>
  )
}

const styles = StyleSheet.create({
  top: { alignItems: 'flex-end' },
  list: { gap: 12 },
  card: { gap: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  flex: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1 },
})
