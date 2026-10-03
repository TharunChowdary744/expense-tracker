import { LogOut, Mail, UserMinus, UserPlus } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { useToast } from '@/features/ui/hooks'
import { cn } from '@/utils/cn'
import { formatMoney } from '@/utils/money'
import {
  useLeaveGroupMutation,
  useRemoveMemberMutation,
  useRevokeEmailInviteMutation,
} from '../api'
import { netBalances } from '../balances'
import { useActor } from '../hooks/useActor'
import type { Group, GroupExpense, Settlement } from '../types'
import { memberName, nextOwner, orderedMemberIds } from '../utils'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { InviteDialog } from './InviteDialog'

interface Props {
  group: Group
  locale: string
  expenses: GroupExpense[] | undefined
  settlements: Settlement[] | undefined
}

export function MembersTab({ group, locale, expenses, settlements }: Props) {
  const actor = useActor()
  const toast = useToast()
  const navigate = useNavigate()
  const ids = useId()
  const [inviting, setInviting] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [leaveGroup] = useLeaveGroupMutation()
  const [removeMember] = useRemoveMemberMutation()
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

  async function confirmLeave(): Promise<string | null> {
    const result = await leaveGroup({ actor, group })
    if ('error' in result) return String(result.error)
    toast({ title: `You left ${group.name}`, variant: 'success' })
    void navigate('/groups', { replace: true })
    return null
  }

  async function confirmRemove(): Promise<string | null> {
    if (!removing) return null
    const target = { uid: removing, displayName: memberName(group, removing) }
    const result = await removeMember({ actor, groupId: group.id, target })
    if ('error' in result) return String(result.error)
    toast({ title: `${target.displayName} was removed`, variant: 'success' })
    return null
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
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={() => setInviting(true)}>
          <UserPlus aria-hidden />
          Invite people
        </Button>
      </div>

      <section aria-labelledby={`${ids}-members`} className="space-y-2">
        <h2 id={`${ids}-members`} className="text-sm font-medium text-muted-foreground">
          Members ({group.memberIds.length})
        </h2>
        <ul aria-label="Members" className="divide-y rounded-lg border bg-card">
          {orderedMemberIds(group).map((uid) => {
            const m = group.members[uid]
            const balance = net.get(uid) ?? 0
            const canRemove = isOwner && uid !== me
            const removeBlocked = !loaded || balance !== 0
            return (
              <li key={uid} className="flex flex-wrap items-center gap-3 p-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {m?.displayName ?? 'Member'}
                    {uid === me && <span className="text-muted-foreground"> (you)</span>}
                    {uid === group.ownerId && (
                      <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                        Owner
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{m?.email}</span>
                </span>
                <span
                  className={cn(
                    'text-sm tabular-nums',
                    balance > 0 && 'text-success',
                    balance < 0 && 'text-destructive',
                    balance === 0 && 'text-muted-foreground',
                  )}
                >
                  {balance === 0
                    ? 'settled up'
                    : `${balance > 0 ? 'gets back' : 'owes'} ${money(Math.abs(balance))}`}
                </span>
                {canRemove && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={removeBlocked}
                    title={
                      removeBlocked ? 'Only members who are settled up can be removed' : undefined
                    }
                    aria-label={`Remove ${m?.displayName ?? 'member'}`}
                    onClick={() => setRemoving(uid)}
                  >
                    <UserMinus aria-hidden />
                    Remove
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
        {isOwner && (
          <p className="text-xs text-muted-foreground">
            You can remove members once their balance is zero.
          </p>
        )}
      </section>

      {group.invitedEmails.length > 0 && (
        <section aria-labelledby={`${ids}-pending`} className="space-y-2">
          <h2 id={`${ids}-pending`} className="text-sm font-medium text-muted-foreground">
            Pending email invites
          </h2>
          <ul aria-label="Pending email invites" className="divide-y rounded-lg border bg-card">
            {group.invitedEmails.map((email) => (
              <li key={email} className="flex items-center gap-3 p-3">
                <Mail className="size-4 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm">{email}</span>
                <Button size="sm" variant="ghost" onClick={() => void cancelInvite(email)}>
                  Cancel invite
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2 rounded-lg border p-4">
        <Button
          variant="outline"
          className="text-destructive"
          disabled={leaveBlocker !== null}
          aria-describedby={leaveBlocker ? `${ids}-leave-hint` : undefined}
          onClick={() => setLeaving(true)}
        >
          <LogOut aria-hidden />
          Leave group
        </Button>
        {leaveBlocker && (
          <p id={`${ids}-leave-hint`} className="text-xs text-muted-foreground">
            {leaveBlocker}
          </p>
        )}
      </section>

      <InviteDialog group={group} open={inviting} onOpenChange={setInviting} />
      <ConfirmDialog
        open={leaving}
        onOpenChange={setLeaving}
        title={`Leave ${group.name}?`}
        description={
          isOwner
            ? `${memberName(group, nextOwner(group) ?? '')} becomes the owner. You'll need a new invite to come back.`
            : "You'll lose access to this group. You'll need a new invite to come back."
        }
        confirmLabel="Leave group"
        busyLabel="Leaving…"
        destructive
        onConfirm={confirmLeave}
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
        title={`Remove ${removing ? memberName(group, removing) : 'member'}?`}
        description="They lose access to the group. Past expenses keep their name."
        confirmLabel="Remove"
        busyLabel="Removing…"
        destructive
        onConfirm={confirmRemove}
      />
    </div>
  )
}
