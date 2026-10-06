import { router, useLocalSearchParams } from 'expo-router'
import { BellRing, Plus, Repeat } from 'lucide-react-native'
import { useCallback, useMemo, useState } from 'react'
import { View } from 'react-native'
import { useAppDispatch } from '@/app/hooks'
import { useGetAccountsQuery } from '@/features/accounts/api'
import { useUid } from '@/features/auth/hooks'
import { useGetCategoriesQuery } from '@/features/categories/api'
import {
  useEndRecurringMutation,
  useGetRecurringQuery,
  useSetRecurringPausedMutation,
  useSkipOccurrenceMutation,
} from '@/features/recurring/api'
import { ruleLabel } from '@/features/recurring/components/ruleLabel'
import { usePendingOccurrences } from '@/features/recurring/hooks/usePendingOccurrences'
import type { PendingOccurrence, RecurringRule } from '@/features/recurring/types'
import { ruleNextDate } from '@/features/recurring/utils'
import { useUserSettings } from '@/features/settings/hooks'
import { useToast } from '@/features/ui/hooks'
import { dialogOpened } from '@/features/ui/slice'
import { formatCalendarDate } from '@/utils/dates'
import { Screen } from '@m/components/Screen'
import { Button } from '@m/components/ui/Button'
import { Segmented } from '@m/components/ui/Controls'
import { EmptyState, ErrorState, ListSkeleton } from '@m/components/ui/ListStates'
import { PendingList } from './PendingList'
import { ConfirmOccurrenceDialog, DeleteRuleDialog } from './RecurringDialogs'
import { RuleRow } from './RuleRow'
import { SubscriptionsView } from './SubscriptionsView'

const TABS = ['rules', 'upcoming', 'subscriptions'] as const
type Tab = (typeof TABS)[number]

/** Upcoming & due shows remind-mode occurrences due now or in the next week. */
const UPCOMING_DAYS = 7

const isRemind = (rule: RecurringRule) => rule.mode === 'remind'

export function RecurringScreen() {
  const uid = useUid()
  const dispatch = useAppDispatch()
  const toast = useToast()
  const { baseCurrency, locale } = useUserSettings()
  const { data: rules, error, isLoading, isFetching, refetch } = useGetRecurringQuery(uid)
  const accounts = useGetAccountsQuery(uid)
  const categories = useGetCategoriesQuery(uid)
  const params = useLocalSearchParams<{ tab?: string }>()
  const tab: Tab = TABS.includes(params.tab as Tab) ? (params.tab as Tab) : 'rules'

  const [setPaused] = useSetRecurringPausedMutation()
  const [endRule] = useEndRecurringMutation()
  const [skip] = useSkipOccurrenceMutation()
  const [deleting, setDeleting] = useState<RecurringRule | null>(null)
  const [confirming, setConfirming] = useState<PendingOccurrence | null>(null)
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set())

  const accountMap = useMemo(
    () => new Map((accounts.data ?? []).map((a) => [a.id, a])),
    [accounts.data],
  )
  const categoryMap = useMemo(
    () => new Map((categories.data ?? []).map((c) => [c.id, c])),
    [categories.data],
  )
  const pending = usePendingOccurrences(rules, UPCOMING_DAYS, isRemind)
  const dueCount = pending.items.filter((i) => i.daysAway <= 0).length
  const title = useCallback(
    (rule: RecurringRule) => ruleLabel(rule, categoryMap).title,
    [categoryMap],
  )
  const shortDate = (date: string) =>
    formatCalendarDate(date, locale, { day: 'numeric', month: 'short', year: 'numeric' })

  async function skipOccurrence(rule: RecurringRule, key: string, date: string) {
    setBusyIds((s) => new Set(s).add(`${rule.id}_${key}`))
    const result = await skip({ uid, ruleId: rule.id, key })
    setBusyIds((s) => {
      const copy = new Set(s)
      copy.delete(`${rule.id}_${key}`)
      return copy
    })
    if ('error' in result) {
      toast({ title: 'Could not skip it', description: String(result.error), variant: 'error' })
      return
    }
    toast({ title: `${title(rule)} on ${shortDate(date)} skipped`, variant: 'success' })
  }

  const actions = {
    onEdit: (rule: RecurringRule) => dispatch(dialogOpened({ kind: 'edit-recurring', rule })),
    onSkipNext: (rule: RecurringRule) => {
      const next = ruleNextDate(rule)
      if (next) void skipOccurrence(rule, next, next)
    },
    onTogglePaused: async (rule: RecurringRule) => {
      const result = await setPaused({ uid, id: rule.id, paused: !rule.paused })
      if ('error' in result) return
      toast({
        title: rule.paused ? `${title(rule)} resumed` : `${title(rule)} paused`,
        description: rule.paused
          ? rule.mode === 'auto'
            ? 'Anything that came due while paused is posted now.'
            : 'Anything that came due while paused is in Upcoming & due.'
          : 'Nothing is posted or reminded until you resume it.',
        variant: 'success',
      })
    },
    onEnd: async (rule: RecurringRule) => {
      const result = await endRule({ uid, rule })
      if ('error' in result) return
      toast({
        title: `${title(rule)} ended`,
        description: 'Nothing more will be posted. Posted transactions are kept.',
        variant: 'success',
      })
    },
    onDelete: (rule: RecurringRule) => setDeleting(rule),
  }

  const newButton = (
    <Button
      title="New recurring"
      icon={Plus}
      onPress={() => dispatch(dialogOpened({ kind: 'quick-add', recurring: true }))}
    />
  )

  return (
    <Screen refreshing={isFetching && !isLoading} onRefresh={() => void refetch()}>
      <View style={{ alignItems: 'flex-end' }}>{newButton}</View>
      {isLoading ? (
        <ListSkeleton label="Loading recurring rules" />
      ) : error ? (
        <ErrorState
          title="Could not load your recurring rules"
          message={String(error)}
          onRetry={() => void refetch()}
        />
      ) : !rules || rules.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="Nothing recurring yet"
          description="Rent, salary, subscriptions: set them up once and Ledgerly posts them or reminds you."
          action={newButton}
        />
      ) : (
        <>
          <Segmented
            label="Recurring views"
            value={tab}
            onChange={(next) => router.setParams({ tab: next === 'rules' ? undefined : next })}
            options={[
              { value: 'rules', label: 'Rules' },
              { value: 'upcoming', label: 'Upcoming & due', badge: dueCount || undefined },
              { value: 'subscriptions', label: 'Subscriptions' },
            ]}
          />
          {tab === 'rules' ? (
            <View accessibilityLabel="Recurring rules" style={{ gap: 8 }}>
              {rules.map((rule) => (
                <RuleRow
                  key={rule.id}
                  rule={rule}
                  accounts={accountMap}
                  categories={categoryMap}
                  baseCurrency={baseCurrency}
                  locale={locale}
                  {...actions}
                />
              ))}
            </View>
          ) : tab === 'upcoming' ? (
            pending.isLoading ? (
              <ListSkeleton rows={2} label="Loading upcoming occurrences" />
            ) : pending.items.length === 0 ? (
              <EmptyState
                icon={BellRing}
                title="Nothing to confirm"
                description={
                  rules.some(isRemind)
                    ? 'Reminders due in the next 7 days appear here.'
                    : 'Rules set to "Remind me to confirm" show their due occurrences here. Automatic ones post themselves.'
                }
              />
            ) : (
              <PendingList
                label="Upcoming and due reminders"
                items={pending.items}
                categories={categoryMap}
                locale={locale}
                busyIds={busyIds}
                onConfirm={setConfirming}
                onSkip={(item) =>
                  void skipOccurrence(item.rule, item.occurrence.key, item.occurrence.date)
                }
              />
            )
          ) : (
            <SubscriptionsView
              rules={rules}
              categories={categoryMap}
              baseCurrency={baseCurrency}
              locale={locale}
            />
          )}
        </>
      )}

      <ConfirmOccurrenceDialog
        item={confirming}
        title={confirming ? title(confirming.rule) : ''}
        baseCurrency={baseCurrency}
        locale={locale}
        onClose={() => setConfirming(null)}
      />
      <DeleteRuleDialog
        rule={deleting}
        title={deleting ? title(deleting) : ''}
        onClose={() => setDeleting(null)}
      />
    </Screen>
  )
}
