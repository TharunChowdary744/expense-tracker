import { BellRing, HandCoins, Trash2 } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ListStates'
import { PendingBadge } from '@/components/PendingBadge'
import { Button } from '@/components/ui/button'
import { useToast } from '@/features/ui/hooks'
import { calendarDate, formatCalendarDate } from '@/utils/dates'
import { formatMoney } from '@/utils/money'
import { useDeleteSettlementMutation, useSendReminderMutation } from '../api'
import { groupDebts, type Debt } from '../balances'
import { useActor } from '../hooks/useActor'
import type { Group, GroupExpense, Settlement } from '../types'
import { activity, debtSentence, memberLabel, memberName } from '../utils'
import { actorName } from '../writes'
import { ConfirmDialog } from './ConfirmDialog'
import { SettlementDialog } from './SettlementDialog'

interface Props {
  group: Group
  locale: string
  expenses: GroupExpense[] | undefined
  settlements: Settlement[] | undefined
  isLoading: boolean
  error: unknown
  onRetry: () => void
}

export function SettleUpTab({
  group,
  locale,
  expenses,
  settlements,
  isLoading,
  error,
  onRetry,
}: Props) {
  const actor = useActor()
  const toast = useToast()
  const ids = useId()
  const [sendReminder] = useSendReminderMutation()
  const [deleteSettlement] = useDeleteSettlementMutation()
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

  async function confirmDelete(): Promise<string | null> {
    if (!deleting) return null
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
    if ('error' in result) return String(result.error)
    toast({ title: 'Payment deleted', variant: 'success' })
    return null
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
    <li key={`${d.from}-${d.to}`} className="flex flex-wrap items-center gap-2 p-3">
      <span className="min-w-0 flex-1 text-sm">
        {debtSentence(group, d, me, group.currency, locale)}
      </span>
      <div className="flex gap-2">
        {d.to === me && group.memberIds.includes(d.from) && (
          <Button
            size="sm"
            variant="outline"
            disabled={reminding === d.from}
            onClick={() => void remind(d)}
          >
            <BellRing aria-hidden />
            Remind
          </Button>
        )}
        <Button size="sm" onClick={() => setRecording(d)}>
          {d.from === me ? 'Settle up' : 'Record payment'}
        </Button>
      </div>
    </li>
  )

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button variant="outline" onClick={() => setRecording({})}>
          <HandCoins aria-hidden />
          Record a payment
        </Button>
      </div>

      <section aria-labelledby={`${ids}-mine`} className="space-y-2">
        <h2 id={`${ids}-mine`} className="text-sm font-medium text-muted-foreground">
          Your balances
        </h2>
        {mine.length === 0 ? (
          <EmptyState icon={HandCoins} title="You're settled up" />
        ) : (
          <ul aria-label="Your balances" className="divide-y rounded-lg border bg-card">
            {mine.map(debtRow)}
          </ul>
        )}
      </section>

      {others.length > 0 && (
        <section aria-labelledby={`${ids}-others`} className="space-y-2">
          <h2 id={`${ids}-others`} className="text-sm font-medium text-muted-foreground">
            Between others
          </h2>
          <ul aria-label="Between others" className="divide-y rounded-lg border bg-card">
            {others.map(debtRow)}
          </ul>
        </section>
      )}

      <section aria-labelledby={`${ids}-history`} className="space-y-2">
        <h2 id={`${ids}-history`} className="text-sm font-medium text-muted-foreground">
          Payments
        </h2>
        {settlements.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
        ) : (
          <ul aria-label="Payments" className="divide-y rounded-lg border bg-card">
            {settlements.map((s) => (
              <li key={s.id} className="flex items-center gap-3 p-3">
                <span className="w-12 shrink-0 text-center text-xs text-muted-foreground">
                  {formatCalendarDate(calendarDate(s.date), locale, {
                    day: 'numeric',
                    month: 'short',
                  })}
                </span>
                <span className="min-w-0 flex-1 text-sm">
                  <span className="flex items-center gap-2">
                    <span className="truncate">
                      {memberLabel(group, s.fromUid, me)} paid {memberLabel(group, s.toUid, me)}
                    </span>
                    {s.pending && <PendingBadge />}
                  </span>
                  {s.note && (
                    <span className="block truncate text-xs text-muted-foreground">{s.note}</span>
                  )}
                </span>
                <span className="text-sm font-medium tabular-nums">{money(s.amount)}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Delete payment of ${money(s.amount)} from ${memberName(group, s.fromUid)}`}
                  onClick={() => setDeleting(s)}
                >
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <SettlementDialog
        group={group}
        initial={recording}
        debts={debts}
        onOpenChange={(open) => {
          if (!open) setRecording(null)
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title="Delete this payment?"
        description="Balances go back to what they were before it was recorded."
        confirmLabel="Delete payment"
        busyLabel="Deleting…"
        destructive
        onConfirm={confirmDelete}
      />
    </div>
  )
}
