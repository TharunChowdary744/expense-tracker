import { BellRing, HandCoins, Trash2 } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useDeleteSettlementMutation, useSendReminderMutation } from '@/features/groups/api'
import { groupDebts, type Debt } from '@/features/groups/balances'
import { useActor } from '@/features/groups/hooks/useActor'
import type { Settlement } from '@/features/groups/types'
import { activity, debtSentence, memberLabel, memberName } from '@/features/groups/utils'
import { actorName } from '@/features/groups/writes'
import { useToast } from '@/features/ui/hooks'
import { calendarDate, formatCalendarDate } from '@/utils/dates'
import { formatMoney } from '@/utils/money'
import { PendingBadge } from '@m/components/PendingBadge'
import { Button, IconButton } from '@m/components/ui/Button'
import { ConfirmDialog } from '@m/components/ui/Dialog'
import { ListBox, SectionTitle } from '@m/components/ui/ListBox'
import { EmptyState, ErrorState, ListSkeleton } from '@m/components/ui/ListStates'
import { Text } from '@m/components/ui/Text'
import type { LedgerProps } from './LedgerTabs'
import { SettlementSheet } from './SettlementSheet'

export function SettleUpTab({
  group,
  locale,
  expenses,
  settlements,
  isLoading,
  error,
  onRetry,
}: LedgerProps) {
  const actor = useActor()
  const toast = useToast()
  const [sendReminder] = useSendReminderMutation()
  const [deleteSettlement, { isLoading: deletingBusy }] = useDeleteSettlementMutation()
  const [recording, setRecording] = useState<Partial<Debt> | null>(null)
  const [deleting, setDeleting] = useState<Settlement | null>(null)
  const [reminding, setReminding] = useState<string | null>(null)
  const money = (minor: number) => formatMoney(minor, group.currency, locale)
  const me = actor.uid

  const debts = useMemo(
    () => (expenses && settlements ? groupDebts(expenses, settlements, group.simplifyDebts) : []),
    [expenses, settlements, group.simplifyDebts],
  )
  const mine = debts.filter((d) => d.from === me || d.to === me)
  const others = debts.filter((d) => d.from !== me && d.to !== me)

  async function remind(debt: Debt) {
    setReminding(debt.from)
    const result = await sendReminder({
      fromUid: me,
      toUid: debt.from,
      groupId: group.id,
      title: `Settle up in ${group.name}`,
      body: `${actorName(actor)} reminded you that you owe them ${money(debt.amount)}.`,
    })
    setReminding(null)
    if ('error' in result) {
      toast({ title: 'Reminder not sent', description: String(result.error), variant: 'error' })
      return
    }
    toast({ title: `Reminder sent to ${memberName(group, debt.from)}`, variant: 'success' })
  }

  async function confirmDelete() {
    if (!deleting) return
    const result = await deleteSettlement({
      actor,
      groupId: group.id,
      settlementId: deleting.id,
      summary: activity.settlementDeleted(
        actorName(actor),
        memberName(group, deleting.fromUid),
        memberName(group, deleting.toUid),
        money(deleting.amount),
      ),
    })
    setDeleting(null)
    if ('error' in result) {
      toast({
        title: 'Could not delete the payment',
        description: String(result.error),
        variant: 'error',
      })
      return
    }
    toast({ title: 'Payment deleted', variant: 'success' })
  }

  if (isLoading) return <ListSkeleton label="Loading payments" />
  if (error || !settlements) {
    return (
      <ErrorState
        title="Could not load payments"
        message={String(error ?? 'Try again.')}
        onRetry={onRetry}
      />
    )
  }

  const debtRow = (d: Debt) => (
    <View key={`${d.from}-${d.to}`} style={styles.debtRow}>
      <Text variant="small" style={styles.sentence}>
        {debtSentence(group, d, me, group.currency, locale)}
      </Text>
      <View style={styles.buttons}>
        {d.to === me && group.memberIds.includes(d.from) ? (
          <Button
            title="Remind"
            icon={BellRing}
            size="sm"
            variant="outline"
            disabled={reminding === d.from}
            accessibilityLabel={`Remind ${memberName(group, d.from)}`}
            onPress={() => void remind(d)}
          />
        ) : null}
        <Button
          title={d.from === me ? 'Settle up' : 'Record payment'}
          size="sm"
          onPress={() => setRecording(d)}
        />
      </View>
    </View>
  )

  return (
    <View style={styles.sections}>
      <View style={styles.end}>
        <Button
          title="Record a payment"
          icon={HandCoins}
          variant="outline"
          onPress={() => setRecording({})}
        />
      </View>

      <View style={styles.stack}>
        <SectionTitle>Your balances</SectionTitle>
        {mine.length === 0 ? (
          <EmptyState icon={HandCoins} title="You're settled up" />
        ) : (
          <ListBox label="Your balances">{mine.map(debtRow)}</ListBox>
        )}
      </View>

      {others.length > 0 ? (
        <View style={styles.stack}>
          <SectionTitle>Between others</SectionTitle>
          <ListBox label="Between others">{others.map(debtRow)}</ListBox>
        </View>
      ) : null}

      <View style={styles.stack}>
        <SectionTitle>Payments</SectionTitle>
        {settlements.length === 0 ? (
          <Text variant="small" tone="muted">
            No payments recorded yet.
          </Text>
        ) : (
          <ListBox label="Payments">
            {settlements.map((s) => (
              <View key={s.id} style={styles.row}>
                <Text variant="caption" tone="muted" align="center" style={styles.date}>
                  {formatCalendarDate(calendarDate(s.date), locale, {
                    day: 'numeric',
                    month: 'short',
                  })}
                </Text>
                <View style={styles.flex}>
                  <View style={styles.inline}>
                    <Text variant="small" numberOfLines={1} style={styles.shrink}>
                      {memberLabel(group, s.fromUid, me)} paid {memberLabel(group, s.toUid, me)}
                    </Text>
                    {s.pending ? <PendingBadge /> : null}
                  </View>
                  {s.note ? (
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {s.note}
                    </Text>
                  ) : null}
                </View>
                <Text variant="small" weight="600" tabular>
                  {money(s.amount)}
                </Text>
                <IconButton
                  icon={Trash2}
                  label={`Delete payment of ${money(s.amount)} from ${memberName(group, s.fromUid)}`}
                  onPress={() => setDeleting(s)}
                />
              </View>
            ))}
          </ListBox>
        )}
      </View>

      <SettlementSheet
        group={group}
        initial={recording}
        debts={debts}
        onClose={() => setRecording(null)}
      />
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete this payment?"
        description="Balances go back to what they were before it was recorded."
        confirmLabel={deletingBusy ? 'Deleting…' : 'Delete payment'}
        loading={deletingBusy}
        destructive
        onConfirm={() => void confirmDelete()}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  sections: { gap: 24 },
  stack: { gap: 8 },
  end: { flexDirection: 'row', justifyContent: 'flex-end' },
  debtRow: { padding: 12, gap: 8 },
  sentence: { flexShrink: 1 },
  buttons: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 12, paddingVertical: 6 },
  date: { width: 44 },
  flex: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
})
