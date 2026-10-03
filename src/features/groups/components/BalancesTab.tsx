import { ArrowRight, Scale } from 'lucide-react'
import { useId, useMemo } from 'react'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ListStates'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/features/ui/hooks'
import { cn } from '@/utils/cn'
import { formatMoney } from '@/utils/money'
import { useUpdateGroupSettingsMutation } from '../api'
import { groupDebts, netBalances, pairwiseDebts, simplifyDebts } from '../balances'
import { useActor } from '../hooks/useActor'
import type { Group, GroupExpense, Settlement } from '../types'
import { activity, memberLabel, orderedMemberIds } from '../utils'
import { actorName } from '../writes'

interface Props {
  group: Group
  locale: string
  expenses: GroupExpense[] | undefined
  settlements: Settlement[] | undefined
  isLoading: boolean
  error: unknown
  onRetry: () => void
}

export function BalancesTab({
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
    <div className="space-y-6">
      <section aria-labelledby={`${ids}-net`} className="space-y-2">
        <h2 id={`${ids}-net`} className="text-sm font-medium text-muted-foreground">
          Net balances
        </h2>
        <ul className="divide-y rounded-lg border bg-card">
          {rows.map((uid) => {
            const net = data.net.get(uid) ?? 0
            return (
              <li key={uid} className="flex items-center justify-between gap-3 p-3">
                <span className="truncate">
                  {name(uid)}
                  {!group.memberIds.includes(uid) && (
                    <span className="ml-2 text-xs text-muted-foreground">(left)</span>
                  )}
                </span>
                <span
                  className={cn(
                    'text-sm tabular-nums',
                    net > 0 && 'text-success',
                    net < 0 && 'text-destructive',
                    net === 0 && 'text-muted-foreground',
                  )}
                >
                  {net === 0
                    ? 'settled up'
                    : `${net > 0 ? 'gets back' : 'owes'} ${money(Math.abs(net))}`}
                </span>
              </li>
            )
          })}
        </ul>
      </section>

      <section aria-labelledby={`${ids}-debts`} className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id={`${ids}-debts`} className="text-sm font-medium text-muted-foreground">
            Who owes whom
          </h2>
          <div className="flex items-center gap-2">
            <Switch
              id={`${ids}-simplify`}
              checked={group.simplifyDebts}
              disabled={saving}
              onCheckedChange={(on) => void toggleSimplify(on)}
              aria-describedby={`${ids}-simplify-hint`}
            />
            <label htmlFor={`${ids}-simplify`} className="text-sm font-medium">
              Simplify debts
            </label>
          </div>
        </div>
        <p id={`${ids}-simplify-hint`} className="text-xs text-muted-foreground">
          {group.simplifyDebts
            ? `Fewest payments: ${data.simplifiedCount} instead of ${data.pairwiseCount}. Everyone ends up square either way.`
            : `Each debt between two people. Turn on to settle in ${data.simplifiedCount} payment${data.simplifiedCount === 1 ? '' : 's'} instead of ${data.pairwiseCount}.`}{' '}
          This setting is shared with the group.
        </p>
        {data.debts.length === 0 ? (
          <EmptyState icon={Scale} title="Everyone is settled up" />
        ) : (
          <ul aria-label="Debts" className="divide-y rounded-lg border bg-card">
            {data.debts.map((d) => (
              <li key={`${d.from}-${d.to}`} className="flex items-center gap-2 p-3 text-sm">
                <span className="truncate font-medium">{name(d.from)}</span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-label="pays" />
                <span className="min-w-0 flex-1 truncate font-medium">{name(d.to)}</span>
                <span className="tabular-nums">{money(d.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
