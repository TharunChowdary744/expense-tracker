import { Users } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'
import { ErrorState, ListSkeleton } from '@/components/ListStates'
import { useUid } from '@/features/auth/hooks'
import { useUserSettings } from '@/features/settings/hooks'
import { cn } from '@/utils/cn'
import { formatMoney } from '@/utils/money'
import { useGetGroupsQuery } from '../api'
import { owedSummary } from '../balances'
import { useGroupBalances } from '../hooks/useGroupBalances'
import { balancePhrase } from '../utils'

const MAX_SHOWN = 5

/** Dashboard card: what the user owes and is owed across their groups, per currency. */
export function GroupsSummaryCard() {
  const uid = useUid()
  const { locale } = useUserSettings()
  const { data: groups, error, isLoading, refetch } = useGetGroupsQuery(uid)
  const balances = useGroupBalances(uid, groups)
  const headingId = 'groups-summary-heading'

  const summary = useMemo(() => {
    const byCurrency = new Map<string, number[]>()
    const rows: { id: string; name: string; emoji: string; currency: string; net: number }[] = []
    let loading = false
    let failed = false
    for (const group of groups ?? []) {
      const balance = balances.get(group.id)
      if (!balance || balance.loading) loading = true
      if (balance?.error) failed = true
      const net = balance?.net.get(uid) ?? 0
      byCurrency.set(group.currency, [...(byCurrency.get(group.currency) ?? []), net])
      if (net !== 0) rows.push({ ...group, net })
    }
    const totals = [...byCurrency].map(([currency, nets]) => ({ currency, ...owedSummary(nets) }))
    rows.sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
    return { totals, rows, loading, failed }
  }, [groups, balances, uid])

  const owe = summary.totals.filter((t) => t.owe > 0)
  const owed = summary.totals.filter((t) => t.owed > 0)
  const list = (items: { currency: string; amount: number }[]) =>
    items.map((t) => formatMoney(t.amount, t.currency, locale)).join(' + ')

  return (
    <section aria-labelledby={headingId} className="space-y-3 rounded-xl border bg-card p-4">
      <h2 id={headingId} className="flex items-center gap-2 font-semibold">
        <Users className="size-4" aria-hidden />
        Groups
      </h2>
      {error ? (
        <ErrorState
          title="Could not load your groups"
          message={String(error)}
          onRetry={() => void refetch()}
        />
      ) : isLoading || (summary.loading && !summary.failed) ? (
        <ListSkeleton rows={1} label="Loading group balances" />
      ) : !groups || groups.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          Split bills with friends.{' '}
          <Link to="/groups" className="font-medium text-foreground underline underline-offset-4">
            Create a group
          </Link>
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-sm text-muted-foreground">You owe</p>
              <p
                className={cn(
                  'text-xl font-semibold tabular-nums',
                  owe.length > 0 && 'text-destructive',
                )}
              >
                {owe.length > 0
                  ? list(owe.map((t) => ({ currency: t.currency, amount: t.owe })))
                  : formatMoney(0, groups[0]?.currency ?? 'INR', locale)}
              </p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-sm text-muted-foreground">You are owed</p>
              <p
                className={cn(
                  'text-xl font-semibold tabular-nums',
                  owed.length > 0 && 'text-success',
                )}
              >
                {owed.length > 0
                  ? list(owed.map((t) => ({ currency: t.currency, amount: t.owed })))
                  : formatMoney(0, groups[0]?.currency ?? 'INR', locale)}
              </p>
            </div>
          </div>
          {summary.failed && (
            <p className="text-xs text-muted-foreground">Some group balances couldn't be loaded.</p>
          )}
          {summary.rows.length > 0 && (
            <ul aria-label="Group balances" className="divide-y">
              {summary.rows.slice(0, MAX_SHOWN).map((row) => (
                <li key={row.id}>
                  <Link
                    to={`/groups/${row.id}?tab=settle`}
                    className="flex items-center gap-2 py-2 text-sm hover:underline"
                  >
                    <span aria-hidden>{row.emoji}</span>
                    <span className="min-w-0 flex-1 truncate">{row.name}</span>
                    <span className={cn(row.net < 0 ? 'text-destructive' : 'text-success')}>
                      {balancePhrase(row.net, row.currency, locale)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link
            to="/groups"
            className="inline-block text-sm font-medium underline underline-offset-4"
          >
            All groups
          </Link>
        </>
      )}
    </section>
  )
}
