import { ArrowRight, History, Paperclip, Plus, Receipt, Scale } from 'lucide-react-native'
import { useMemo } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { ACTIVITY_LIMIT, useUpdateGroupSettingsMutation } from '@/features/groups/api'
import { groupDebts, netBalances, pairwiseDebts, simplifyDebts } from '@/features/groups/balances'
import { useActor } from '@/features/groups/hooks/useActor'
import { groupCategoryLabel } from '@/features/groups/schemas'
import { memberEffect } from '@/features/groups/split'
import type { Activity, Group, GroupExpense, Settlement } from '@/features/groups/types'
import { activity, memberLabel, orderedMemberIds } from '@/features/groups/utils'
import { actorName } from '@/features/groups/writes'
import { receiptsEnabled } from '@/features/receipts/flag'
import { useToast } from '@/features/ui/hooks'
import { calendarDate, formatCalendarDate } from '@/utils/dates'
import { formatMoney } from '@/utils/money'
import { PendingBadge } from '@m/components/PendingBadge'
import { Button } from '@m/components/ui/Button'
import { SwitchRow } from '@m/components/ui/Controls'
import { ListBox, SectionTitle } from '@m/components/ui/ListBox'
import { EmptyState, ErrorState, ListSkeleton } from '@m/components/ui/ListStates'
import { Text } from '@m/components/ui/Text'
import { useColors } from '@m/theme/ThemeProvider'

export interface LedgerProps {
  group: Group
  locale: string
  expenses: GroupExpense[] | undefined
  settlements: Settlement[] | undefined
  isLoading: boolean
  error: unknown
  onRetry: () => void
}

function paidByText(
  group: Group,
  expense: GroupExpense,
  uid: string,
  money: (n: number) => string,
) {
  const payers = Object.keys(expense.paidBy)
  if (payers.length === 1) {
    return `${memberLabel(group, payers[0] as string, uid)} paid ${money(expense.amount)}`
  }
  return `${payers.length} people paid ${money(expense.amount)}`
}

export function ExpensesTab({
  group,
  uid,
  locale,
  expenses,
  isLoading,
  error,
  onRetry,
  onAdd,
  onEdit,
}: {
  group: Group
  uid: string
  locale: string
  expenses: GroupExpense[] | undefined
  isLoading: boolean
  error: unknown
  onRetry: () => void
  onAdd: () => void
  onEdit: (expense: GroupExpense) => void
}) {
  const c = useColors()
  const money = (minor: number) => formatMoney(minor, group.currency, locale)
  const addButton = <Button title="Add expense" icon={Plus} onPress={onAdd} />

  if (isLoading) return <ListSkeleton label="Loading expenses" />
  if (error)
    return <ErrorState title="Could not load expenses" message={String(error)} onRetry={onRetry} />
  if (!expenses || expenses.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title="No expenses yet"
        description="Add what someone paid and how to split it."
        action={addButton}
      />
    )
  }

  return (
    <View style={styles.stack}>
      <View style={styles.end}>{addButton}</View>
      <ListBox label="Expenses">
        {expenses.map((expense) => {
          const effect = memberEffect(expense, uid)
          const involved = uid in expense.paidBy || uid in expense.shares
          const category = groupCategoryLabel(expense.categoryId)
          const date = formatCalendarDate(calendarDate(expense.date), locale, {
            day: 'numeric',
            month: 'short',
          })
          const paid = paidByText(group, expense, uid, money)
          const effectText = !involved
            ? 'not involved'
            : effect === 0
              ? 'settled'
              : `${effect > 0 ? 'you lent' : 'you owe'} ${money(Math.abs(effect))}`
          const files = receiptsEnabled ? expense.attachments.length : 0
          return (
            <Pressable
              key={expense.id}
              accessibilityRole="button"
              accessibilityLabel={`${expense.description}, ${date}, ${paid}, ${effectText}`}
              accessibilityHint="Opens the expense to edit"
              onPress={() => onEdit(expense)}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.accent }]}
            >
              <Text variant="caption" tone="muted" align="center" style={styles.date}>
                {date}
              </Text>
              <View style={styles.flex}>
                <View style={styles.inline}>
                  <Text weight="600" numberOfLines={1} style={styles.shrink}>
                    {expense.description}
                  </Text>
                  {files > 0 ? (
                    <View style={styles.inline}>
                      <Paperclip size={12} color={c.mutedForeground} />
                      <Text variant="caption" tone="muted">
                        {files}
                      </Text>
                    </View>
                  ) : null}
                  {expense.pending ? <PendingBadge /> : null}
                </View>
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {paid}
                  {category ? ` · ${category}` : ''}
                </Text>
              </View>
              {!involved || effect === 0 ? (
                <Text variant="small" tone="muted">
                  {effectText}
                </Text>
              ) : (
                <View style={styles.right}>
                  <Text variant="caption" tone="muted">
                    {effect > 0 ? 'you lent' : 'you owe'}
                  </Text>
                  <Text
                    variant="small"
                    weight="600"
                    tabular
                    tone={effect > 0 ? 'success' : 'destructive'}
                  >
                    {money(Math.abs(effect))}
                  </Text>
                </View>
              )}
            </Pressable>
          )
        })}
      </ListBox>
    </View>
  )
}

export function BalancesTab({
  group,
  locale,
  expenses,
  settlements,
  isLoading,
  error,
  onRetry,
}: LedgerProps) {
  const c = useColors()
  const actor = useActor()
  const toast = useToast()
  const [updateGroup, { isLoading: saving }] = useUpdateGroupSettingsMutation()
  const money = (minor: number) => formatMoney(minor, group.currency, locale)
  const name = (uid: string) => memberLabel(group, uid, actor.uid)

  const data = useMemo(() => {
    if (!expenses || !settlements) return null
    const net = netBalances(expenses, settlements, group.memberIds)
    return {
      net,
      debts: groupDebts(expenses, settlements, group.simplifyDebts),
      pairwiseCount: pairwiseDebts(expenses, settlements).length,
      simplifiedCount: simplifyDebts(net).length,
    }
  }, [expenses, settlements, group.memberIds, group.simplifyDebts])

  async function toggleSimplify(on: boolean) {
    const result = await updateGroup({
      actor,
      groupId: group.id,
      changes: { simplifyDebts: on },
      summary: activity.simplify(actorName(actor), on),
    })
    if ('error' in result) {
      toast({
        title: 'Could not change the setting',
        description: String(result.error),
        variant: 'error',
      })
    }
  }

  if (isLoading) return <ListSkeleton label="Loading balances" />
  if (error || !data) {
    return (
      <ErrorState
        title="Could not load balances"
        message={String(error ?? 'Try again.')}
        onRetry={onRetry}
      />
    )
  }

  // Current members in order, then former members who still have a balance.
  const rows = [
    ...orderedMemberIds(group),
    ...[...data.net.keys()].filter((id) => !group.memberIds.includes(id) && data.net.get(id) !== 0),
  ]

  return (
    <View style={styles.sections}>
      <View style={styles.stack}>
        <SectionTitle>Net balances</SectionTitle>
        <ListBox label="Net balances">
          {rows.map((uid) => {
            const net = data.net.get(uid) ?? 0
            return (
              <View key={uid} style={styles.row}>
                <Text numberOfLines={1} style={styles.flex}>
                  {name(uid)}
                  {!group.memberIds.includes(uid) ? (
                    <Text variant="caption" tone="muted">
                      {'  (left)'}
                    </Text>
                  ) : null}
                </Text>
                <Text
                  variant="small"
                  tabular
                  tone={net > 0 ? 'success' : net < 0 ? 'destructive' : 'muted'}
                >
                  {net === 0
                    ? 'settled up'
                    : `${net > 0 ? 'gets back' : 'owes'} ${money(Math.abs(net))}`}
                </Text>
              </View>
            )
          })}
        </ListBox>
      </View>

      <View style={styles.stack}>
        <SectionTitle>Who owes whom</SectionTitle>
        <SwitchRow
          label="Simplify debts"
          description={`${
            group.simplifyDebts
              ? `Fewest payments: ${data.simplifiedCount} instead of ${data.pairwiseCount}. Everyone ends up square either way.`
              : `Each debt between two people. Turn on to settle in ${data.simplifiedCount} payment${data.simplifiedCount === 1 ? '' : 's'} instead of ${data.pairwiseCount}.`
          } This setting is shared with the group.`}
          value={group.simplifyDebts}
          disabled={saving}
          onChange={(on) => void toggleSimplify(on)}
        />
        {data.debts.length === 0 ? (
          <EmptyState icon={Scale} title="Everyone is settled up" />
        ) : (
          <ListBox label="Debts">
            {data.debts.map((d) => (
              <View
                key={`${d.from}-${d.to}`}
                accessible
                accessibilityLabel={`${name(d.from)} pays ${name(d.to)} ${money(d.amount)}`}
                style={styles.row}
              >
                <Text weight="600" numberOfLines={1} style={styles.shrink}>
                  {name(d.from)}
                </Text>
                <ArrowRight size={16} color={c.mutedForeground} />
                <Text weight="600" numberOfLines={1} style={styles.flex}>
                  {name(d.to)}
                </Text>
                <Text variant="small" tabular>
                  {money(d.amount)}
                </Text>
              </View>
            ))}
          </ListBox>
        )}
      </View>
    </View>
  )
}

export function ActivityTab({
  locale,
  items,
  isLoading,
  error,
  onRetry,
}: {
  locale: string
  items: Activity[] | undefined
  isLoading: boolean
  error: unknown
  onRetry: () => void
}) {
  if (isLoading) return <ListSkeleton label="Loading activity" />
  if (error)
    return <ErrorState title="Could not load activity" message={String(error)} onRetry={onRetry} />
  if (!items || items.length === 0) return <EmptyState icon={History} title="No activity yet" />
  const time = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })
  return (
    <View style={styles.stack}>
      <ListBox label="Activity">
        {items.map((item) => (
          <View key={item.id} style={styles.activity}>
            <Text variant="small">{item.summary}</Text>
            <Text variant="caption" tone="muted">
              {time.format(new Date(item.createdAt))}
            </Text>
          </View>
        ))}
      </ListBox>
      {items.length >= ACTIVITY_LIMIT ? (
        <Text variant="caption" tone="muted">
          Showing the latest {ACTIVITY_LIMIT}.
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  sections: { gap: 24 },
  stack: { gap: 8 },
  end: { flexDirection: 'row', justifyContent: 'flex-end' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  date: { width: 44 },
  flex: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  right: { alignItems: 'flex-end' },
  activity: { padding: 12, gap: 2 },
})
