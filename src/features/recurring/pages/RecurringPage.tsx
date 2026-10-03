import { BellRing, Plus, Repeat } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useAppDispatch } from '@/app/hooks'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ListStates'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useGetAccountsQuery } from '@/features/accounts/api'
import { useUid } from '@/features/auth/hooks'
import { useGetCategoriesQuery } from '@/features/categories/api'
import { useUserSettings } from '@/features/settings/hooks'
import { useToast } from '@/features/ui/hooks'
import { dialogOpened } from '@/features/ui/slice'
import { formatCalendarDate } from '@/utils/dates'
import {
  useEndRecurringMutation,
  useGetRecurringQuery,
  useSetRecurringPausedMutation,
  useSkipOccurrenceMutation,
} from '../api'
import { ConfirmOccurrenceDialog } from '../components/ConfirmOccurrenceDialog'
import { DeleteRuleDialog } from '../components/DeleteRuleDialog'
import { PendingList } from '../components/PendingList'
import { ruleLabel } from '../components/ruleLabel'
import { RuleRow } from '../components/RuleRow'
import { SubscriptionsView } from '../components/SubscriptionsView'
import { usePendingOccurrences } from '../hooks/usePendingOccurrences'
import type { PendingOccurrence, RecurringRule } from '../types'
import { ruleNextDate } from '../utils'

const TABS = ['rules', 'upcoming', 'subscriptions'] as const
type Tab = (typeof TABS)[number]

/** Upcoming & due shows remind-mode occurrences due now or in the next week. */
const UPCOMING_DAYS = 7

const isRemind = (rule: RecurringRule) => rule.mode === 'remind'

export function RecurringPage() {
  const uid = useUid()
  const dispatch = useAppDispatch()
  const toast = useToast()
  const { baseCurrency, locale } = useUserSettings()
  const { data: rules, error, isLoading, refetch } = useGetRecurringQuery(uid)
  const accounts = useGetAccountsQuery(uid)
  const categories = useGetCategoriesQuery(uid)
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab')
  const tab: Tab = TABS.includes(tabParam as Tab) ? (tabParam as Tab) : 'rules'

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

  function setTab(next: string) {
    setParams(
      (prev) => {
        const copy = new URLSearchParams(prev)
        if (next === 'rules') copy.delete('tab')
        else copy.set('tab', next)
        return copy
      },
      { replace: true },
    )
  }

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
    <Button onClick={() => dispatch(dialogOpened({ kind: 'quick-add', recurring: true }))}>
      <Plus aria-hidden />
      New recurring
    </Button>
  )

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Recurring</h1>
        {newButton}
      </div>

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
        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          <TabsList aria-label="Recurring views" className="w-full sm:w-auto">
            <TabsTrigger value="rules">Rules</TabsTrigger>
            <TabsTrigger value="upcoming">
              Upcoming &amp; due
              {dueCount > 0 && (
                <span className="ml-1.5 rounded-full bg-destructive px-1.5 text-xs text-destructive-foreground">
                  <span className="sr-only">, </span>
                  {dueCount}
                  <span className="sr-only"> due</span>
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
          </TabsList>

          <TabsContent value="rules">
            <ul aria-label="Recurring rules" className="space-y-2">
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
            </ul>
          </TabsContent>

          <TabsContent value="upcoming">
            {pending.isLoading ? (
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
            )}
          </TabsContent>

          <TabsContent value="subscriptions">
            <SubscriptionsView
              rules={rules}
              categories={categoryMap}
              baseCurrency={baseCurrency}
              locale={locale}
            />
          </TabsContent>
        </Tabs>
      )}

      <ConfirmOccurrenceDialog
        item={confirming}
        title={confirming ? title(confirming.rule) : ''}
        baseCurrency={baseCurrency}
        locale={locale}
        onOpenChange={(open) => {
          if (!open) setConfirming(null)
        }}
      />
      <DeleteRuleDialog
        rule={deleting}
        title={deleting ? title(deleting) : ''}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
      />
    </section>
  )
}
