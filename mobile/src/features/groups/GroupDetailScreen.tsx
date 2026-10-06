import { Stack, router, useLocalSearchParams } from 'expo-router'
import { Pencil, Users } from 'lucide-react-native'
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { useUid } from '@/features/auth/hooks'
import {
  useGetGroupActivityQuery,
  useGetGroupExpensesQuery,
  useGetGroupQuery,
  useGetGroupSettlementsQuery,
} from '@/features/groups/api'
import { netBalances } from '@/features/groups/balances'
import type { GroupExpense } from '@/features/groups/types'
import { balancePhrase } from '@/features/groups/utils'
import { useUserSettings } from '@/features/settings/hooks'
import { dialogClosed, dialogOpened } from '@/features/ui/slice'
import { Screen } from '@m/components/Screen'
import { Button } from '@m/components/ui/Button'
import { Segmented } from '@m/components/ui/Controls'
import { EmptyState, ErrorState, ListSkeleton } from '@m/components/ui/ListStates'
import { Text } from '@m/components/ui/Text'
import { useColors } from '@m/theme/ThemeProvider'
import { ExpenseSheet } from './ExpenseSheet'
import { GroupSheet } from './GroupForm'
import { ActivityTab, BalancesTab, ExpensesTab } from './LedgerTabs'
import { MembersTab } from './MembersTab'
import { SettleUpTab } from './SettleUpTab'

export const GROUP_TABS = [
  { value: 'expenses', label: 'Expenses' },
  { value: 'balances', label: 'Balances' },
  { value: 'settle', label: 'Settle up' },
  { value: 'activity', label: 'Activity' },
  { value: 'members', label: 'Members' },
] as const
export type GroupTab = (typeof GROUP_TABS)[number]['value']

export function groupTab(param: string | undefined): GroupTab {
  return GROUP_TABS.find((t) => t.value === param)?.value ?? 'expenses'
}

export function GroupDetailScreen() {
  const params = useLocalSearchParams<{ groupId: string; tab?: string }>()
  const groupId = params.groupId ?? ''
  const c = useColors()
  const uid = useUid()
  const dispatch = useAppDispatch()
  const { locale } = useUserSettings()
  const arg = { uid, groupId }
  const group = useGetGroupQuery(arg)
  const member = Boolean(group.data)
  const expenses = useGetGroupExpensesQuery(arg, { skip: !member })
  const settlements = useGetGroupSettlementsQuery(arg, { skip: !member })
  const tab = groupTab(params.tab)
  const activity = useGetGroupActivityQuery(arg, { skip: !member || tab !== 'activity' })
  const [editing, setEditing] = useState<GroupExpense | null>(null)
  const [editingGroup, setEditingGroup] = useState(false)
  const dialog = useAppSelector((s) => s.ui.dialog)
  const adding = dialog?.kind === 'group-expense' && dialog.groupId === groupId

  const header = (
    <Stack.Screen
      options={{
        title: group.data?.name ?? 'Group',
        headerRight: group.data
          ? () => (
              <Button
                title="Edit"
                icon={Pencil}
                size="sm"
                variant="ghost"
                accessibilityLabel="Edit group"
                onPress={() => setEditingGroup(true)}
              />
            )
          : undefined,
      }}
    />
  )

  if (group.isLoading) {
    return (
      <Screen>
        {header}
        <ListSkeleton rows={3} label="Loading group" />
      </Screen>
    )
  }
  if (group.error && !group.data) {
    return (
      <Screen>
        {header}
        <ErrorState
          title="Can't open this group"
          message={`${String(group.error)} Only members can see a group.`}
          onRetry={() => void group.refetch()}
        />
      </Screen>
    )
  }
  if (!group.data) {
    return (
      <Screen>
        {header}
        <EmptyState
          icon={Users}
          title="This group isn't available"
          description="It may have been removed, or you are no longer a member."
          action={
            <Button
              title="Go to your groups"
              variant="outline"
              onPress={() => router.navigate('/groups')}
            />
          }
        />
      </Screen>
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
    <Screen
      refreshing={expenses.isFetching && !expenses.isLoading}
      onRefresh={() => {
        void group.refetch()
        retryLedger()
        if (tab === 'activity') void activity.refetch()
      }}
    >
      {header}
      <View style={styles.head}>
        <View style={[styles.cover, { backgroundColor: c.muted }]}>
          <Text style={styles.emoji}>{g.emoji}</Text>
        </View>
        <View style={styles.flex}>
          <Text variant="small" tone="muted">
            {g.memberIds.length} member{g.memberIds.length === 1 ? '' : 's'} · {g.currency}
          </Text>
          {myNet !== null ? (
            <Text
              variant="small"
              weight="600"
              tone={myNet < 0 ? 'destructive' : myNet > 0 ? 'success' : 'muted'}
            >
              {balancePhrase(myNet, g.currency, locale)}
            </Text>
          ) : null}
        </View>
      </View>

      <Segmented
        label="Group sections"
        scrollable
        value={tab}
        options={GROUP_TABS.map((t) => ({ value: t.value, label: t.label }))}
        onChange={(next) => router.setParams({ tab: next === 'expenses' ? undefined : next })}
      />

      {tab === 'expenses' ? (
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
      ) : tab === 'balances' ? (
        <BalancesTab {...ledgerProps} />
      ) : tab === 'settle' ? (
        <SettleUpTab {...ledgerProps} />
      ) : tab === 'activity' ? (
        <ActivityTab
          locale={locale}
          items={activity.data}
          isLoading={activity.isLoading || activity.isUninitialized}
          error={activity.error}
          onRetry={() => void activity.refetch()}
        />
      ) : (
        <MembersTab
          group={g}
          locale={locale}
          expenses={expenses.data}
          settlements={settlements.data}
        />
      )}

      <ExpenseSheet
        group={g}
        open={adding || editing !== null}
        expense={editing ?? undefined}
        onClose={() => {
          setEditing(null)
          if (adding) dispatch(dialogClosed())
        }}
      />
      <GroupSheet open={editingGroup} onClose={() => setEditingGroup(false)} group={g} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cover: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 26, lineHeight: 32 },
  flex: { flex: 1, minWidth: 0 },
})
