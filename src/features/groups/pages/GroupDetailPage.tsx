import { ArrowLeft, Pencil, Users } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { EmptyState, ErrorState } from '@/components/ListStates'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useUid } from '@/features/auth/hooks'
import { useUserSettings } from '@/features/settings/hooks'
import { dialogClosed, dialogOpened } from '@/features/ui/slice'
import { cn } from '@/utils/cn'
import {
  useGetGroupActivityQuery,
  useGetGroupExpensesQuery,
  useGetGroupQuery,
  useGetGroupSettlementsQuery,
} from '../api'
import { netBalances } from '../balances'
import { ActivityTab } from '../components/ActivityTab'
import { BalancesTab } from '../components/BalancesTab'
import { ExpenseSheet } from '../components/ExpenseSheet'
import { ExpensesTab } from '../components/ExpensesTab'
import { GroupDialog } from '../components/GroupDialog'
import { MembersTab } from '../components/MembersTab'
import { SettleUpTab } from '../components/SettleUpTab'
import type { GroupExpense } from '../types'
import { balancePhrase } from '../utils'

const TABS = [
  { id: 'expenses', label: 'Expenses' },
  { id: 'balances', label: 'Balances' },
  { id: 'settle', label: 'Settle up' },
  { id: 'activity', label: 'Activity' },
  { id: 'members', label: 'Members' },
] as const
type Tab = (typeof TABS)[number]['id']

export function GroupDetailPage() {
  const { groupId = '' } = useParams()
  const uid = useUid()
  const dispatch = useAppDispatch()
  const { locale } = useUserSettings()
  const arg = { uid, groupId }
  const group = useGetGroupQuery(arg)
  const member = Boolean(group.data)
  const expenses = useGetGroupExpensesQuery(arg, { skip: !member })
  const settlements = useGetGroupSettlementsQuery(arg, { skip: !member })
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab')
  const tab: Tab = TABS.some((t) => t.id === tabParam) ? (tabParam as Tab) : 'expenses'
  const activity = useGetGroupActivityQuery(arg, { skip: !member || tab !== 'activity' })
  const [editing, setEditing] = useState<GroupExpense | null>(null)
  const [editingGroup, setEditingGroup] = useState(false)
  const dialog = useAppSelector((s) => s.ui.dialog)
  const adding = dialog?.kind === 'group-expense' && dialog.groupId === groupId

  function setTab(next: string) {
    setParams(
      (prev) => {
        const copy = new URLSearchParams(prev)
        if (next === 'expenses') copy.delete('tab')
        else copy.set('tab', next)
        return copy
      },
      { replace: true },
    )
  }

  if (group.isLoading) {
    return (
      <section className="space-y-6" aria-busy="true">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-full max-w-md" />
        <Skeleton className="h-40 w-full" />
      </section>
    )
  }
  if (group.error && !group.data) {
    return (
      <section className="space-y-4">
        <BackLink />
        <ErrorState
          title="Can't open this group"
          message={`${String(group.error)} Only members can see a group.`}
          onRetry={() => void group.refetch()}
        />
      </section>
    )
  }
  if (!group.data) {
    return (
      <section className="space-y-4">
        <BackLink />
        <EmptyState
          icon={Users}
          title="This group isn't available"
          description="It may have been removed, or you are no longer a member."
        />
      </section>
    )
  }

  const g = group.data
  const ledgerLoading = expenses.isLoading || settlements.isLoading
  const ledgerError = expenses.error ?? settlements.error
  const retryLedger = () => {
    void expenses.refetch()
    void settlements.refetch()
  }
  const myNet =
    expenses.data && settlements.data
      ? (netBalances(expenses.data, settlements.data).get(uid) ?? 0)
      : null
  const openAdd = () => dispatch(dialogOpened({ kind: 'group-expense', groupId }))
  const ledgerProps = {
    group: g,
    locale,
    expenses: expenses.data,
    settlements: settlements.data,
    isLoading: ledgerLoading,
    error: ledgerError,
    onRetry: retryLedger,
  }

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <BackLink />
        <div className="flex flex-wrap items-center gap-3">
          <span
            aria-hidden
            className="flex size-12 items-center justify-center rounded-full bg-muted text-2xl"
          >
            {g.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{g.name}</h1>
            <p className="text-sm text-muted-foreground">
              {g.memberIds.length} member{g.memberIds.length === 1 ? '' : 's'} · {g.currency}
              {myNet !== null && (
                <>
                  {' · '}
                  <span
                    className={cn(myNet < 0 && 'text-destructive', myNet > 0 && 'text-success')}
                  >
                    {balancePhrase(myNet, g.currency, locale)}
                  </span>
                </>
              )}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setEditingGroup(true)}>
            <Pencil aria-hidden />
            Edit
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <TabsList aria-label="Group sections">
            {TABS.map((t) => (
              <TabsTrigger key={t.id} value={t.id}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="expenses" className="pt-4">
          <ExpensesTab
            group={g}
            uid={uid}
            locale={locale}
            expenses={expenses.data}
            isLoading={ledgerLoading}
            error={expenses.error}
            onRetry={() => void expenses.refetch()}
            onAdd={openAdd}
            onEdit={setEditing}
          />
        </TabsContent>
        <TabsContent value="balances" className="pt-4">
          <BalancesTab {...ledgerProps} />
        </TabsContent>
        <TabsContent value="settle" className="pt-4">
          <SettleUpTab {...ledgerProps} />
        </TabsContent>
        <TabsContent value="activity" className="pt-4">
          <ActivityTab
            locale={locale}
            items={activity.data}
            isLoading={activity.isLoading || activity.isUninitialized}
            error={activity.error}
            onRetry={() => void activity.refetch()}
          />
        </TabsContent>
        <TabsContent value="members" className="pt-4">
          <MembersTab
            group={g}
            locale={locale}
            expenses={expenses.data}
            settlements={settlements.data}
          />
        </TabsContent>
      </Tabs>

      <ExpenseSheet
        group={g}
        open={adding || editing !== null}
        expense={editing ?? undefined}
        onOpenChange={(open) => {
          if (open) return
          setEditing(null)
          if (adding) dispatch(dialogClosed())
        }}
      />
      <GroupDialog open={editingGroup} onOpenChange={setEditingGroup} group={g} />
    </section>
  )
}

function BackLink() {
  return (
    <Link
      to="/groups"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" aria-hidden />
      Groups
    </Link>
  )
}
