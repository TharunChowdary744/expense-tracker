import { router } from 'expo-router'
import { LogOut, Mail, UserMinus, UserPlus } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import {
  useLeaveGroupMutation,
  useRemoveMemberMutation,
  useRevokeEmailInviteMutation,
} from '@/features/groups/api'
import { netBalances } from '@/features/groups/balances'
import { useActor } from '@/features/groups/hooks/useActor'
import type { Group, GroupExpense, Settlement } from '@/features/groups/types'
import { memberName, nextOwner, orderedMemberIds } from '@/features/groups/utils'
import { useToast } from '@/features/ui/hooks'
import { formatMoney } from '@/utils/money'
import { Badge } from '@m/components/ui/Badge'
import { Button } from '@m/components/ui/Button'
import { Card } from '@m/components/ui/Card'
import { ConfirmDialog } from '@m/components/ui/Dialog'
import { ListBox, SectionTitle } from '@m/components/ui/ListBox'
import { Text } from '@m/components/ui/Text'
import { useColors } from '@m/theme/ThemeProvider'
import { InviteSheet } from './InviteSheet'

export function MembersTab({
  group,
  locale,
  expenses,
  settlements,
}: {
  group: Group
  locale: string
  expenses: GroupExpense[] | undefined
  settlements: Settlement[] | undefined
}) {
  const c = useColors()
  const actor = useActor()
  const toast = useToast()
  const [inviting, setInviting] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [leaveGroup, { isLoading: leavingBusy }] = useLeaveGroupMutation()
  const [removeMember, { isLoading: removingBusy }] = useRemoveMemberMutation()
  const [revoke] = useRevokeEmailInviteMutation()
  const money = (minor: number) => formatMoney(minor, group.currency, locale)
  const me = actor.uid
  const isOwner = group.ownerId === me
  const loaded = Boolean(expenses && settlements)
  const net = useMemo(
    () =>
      expenses && settlements ? netBalances(expenses, settlements) : new Map<string, number>(),
    [expenses, settlements],
  )
  const myBalance = net.get(me) ?? 0
  const onlyMember = group.memberIds.length <= 1

  async function confirmLeave() {
    const result = await leaveGroup({ actor, group })
    setLeaving(false)
    if ('error' in result) {
      toast({
        title: 'Could not leave the group',
        description: String(result.error),
        variant: 'error',
      })
      return
    }
    toast({ title: `You left ${group.name}`, variant: 'success' })
    router.navigate('/groups')
  }

  async function confirmRemove() {
    if (!removing) return
    const target = { uid: removing, displayName: memberName(group, removing) }
    const result = await removeMember({ actor, groupId: group.id, target })
    setRemoving(null)
    if ('error' in result) {
      toast({
        title: 'Could not remove the member',
        description: String(result.error),
        variant: 'error',
      })
      return
    }
    toast({ title: `${target.displayName} was removed`, variant: 'success' })
  }

  async function cancelInvite(email: string) {
    const result = await revoke({ groupId: group.id, email })
    if ('error' in result) {
      toast({
        title: 'Could not cancel the invite',
        description: String(result.error),
        variant: 'error',
      })
      return
    }
    toast({ title: `Invite for ${email} cancelled`, variant: 'success' })
  }

  const leaveBlocker = onlyMember
    ? "You're the only member."
    : !loaded
      ? 'Loading balances…'
      : myBalance !== 0
        ? `Settle your balance (${myBalance < 0 ? 'you owe' : 'you are owed'} ${money(Math.abs(myBalance))}) before leaving.`
        : null

  return (
    <View style={styles.sections}>
      <View style={styles.end}>
        <Button title="Invite people" icon={UserPlus} onPress={() => setInviting(true)} />
      </View>

      <View style={styles.stack}>
        <SectionTitle>{`Members (${group.memberIds.length})`}</SectionTitle>
        <ListBox label="Members">
          {orderedMemberIds(group).map((uid) => {
            const m = group.members[uid]
            const balance = net.get(uid) ?? 0
            const canRemove = isOwner && uid !== me
            const removeBlocked = !loaded || balance !== 0
            return (
              <View key={uid} style={styles.row}>
                <View style={styles.flex}>
                  <View style={styles.inline}>
                    <Text weight="600" numberOfLines={1} style={styles.shrink}>
                      {m?.displayName ?? 'Member'}
                      {uid === me ? <Text tone="muted"> (you)</Text> : null}
                    </Text>
                    {uid === group.ownerId ? <Badge label="Owner" /> : null}
                  </View>
                  {m?.email ? (
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {m.email}
                    </Text>
                  ) : null}
                  <Text
                    variant="small"
                    tabular
                    tone={balance > 0 ? 'success' : balance < 0 ? 'destructive' : 'muted'}
                  >
                    {balance === 0
                      ? 'settled up'
                      : `${balance > 0 ? 'gets back' : 'owes'} ${money(Math.abs(balance))}`}
                  </Text>
                </View>
                {canRemove ? (
                  <Button
                    title="Remove"
                    icon={UserMinus}
                    size="sm"
                    variant="ghost"
                    disabled={removeBlocked}
                    accessibilityLabel={`Remove ${m?.displayName ?? 'member'}`}
                    accessibilityHint={
                      removeBlocked ? 'Only members who are settled up can be removed' : undefined
                    }
                    onPress={() => setRemoving(uid)}
                  />
                ) : null}
              </View>
            )
          })}
        </ListBox>
        {isOwner ? (
          <Text variant="caption" tone="muted">
            You can remove members once their balance is zero.
          </Text>
        ) : null}
      </View>

      {group.invitedEmails.length > 0 ? (
        <View style={styles.stack}>
          <SectionTitle>Pending email invites</SectionTitle>
          <ListBox label="Pending email invites">
            {group.invitedEmails.map((email) => (
              <View key={email} style={styles.row}>
                <Mail size={16} color={c.mutedForeground} />
                <Text variant="small" numberOfLines={1} style={styles.flex}>
                  {email}
                </Text>
                <Button
                  title="Cancel invite"
                  size="sm"
                  variant="ghost"
                  accessibilityLabel={`Cancel invite for ${email}`}
                  onPress={() => void cancelInvite(email)}
                />
              </View>
            ))}
          </ListBox>
        </View>
      ) : null}

      <Card>
        <Button
          title="Leave group"
          icon={LogOut}
          variant="outline"
          disabled={leaveBlocker !== null}
          accessibilityHint={leaveBlocker ?? undefined}
          onPress={() => setLeaving(true)}
          style={styles.start}
        />
        {leaveBlocker ? (
          <Text variant="caption" tone="muted">
            {leaveBlocker}
          </Text>
        ) : null}
      </Card>

      <InviteSheet group={group} open={inviting} onClose={() => setInviting(false)} />
      <ConfirmDialog
        open={leaving}
        onClose={() => setLeaving(false)}
        title={`Leave ${group.name}?`}
        description={
          isOwner
            ? `${memberName(group, nextOwner(group) ?? '')} becomes the owner. You'll need a new invite to come back.`
            : "You'll lose access to this group. You'll need a new invite to come back."
        }
        confirmLabel={leavingBusy ? 'Leaving…' : 'Leave group'}
        loading={leavingBusy}
        destructive
        onConfirm={() => void confirmLeave()}
      />
      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing ? memberName(group, removing) : 'member'}?`}
        description="They lose access to the group. Past expenses keep their name."
        confirmLabel={removingBusy ? 'Removing…' : 'Remove'}
        loading={removingBusy}
        destructive
        onConfirm={() => void confirmRemove()}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  sections: { gap: 24 },
  stack: { gap: 8 },
  end: { flexDirection: 'row', justifyContent: 'flex-end' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  shrink: { flexShrink: 1 },
  start: { alignSelf: 'flex-start' },
})
