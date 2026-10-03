import { ChevronRight, Plus, Users } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ListStates'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useUid } from '@/features/auth/hooks'
import { useUserSettings } from '@/features/settings/hooks'
import { cn } from '@/utils/cn'
import { useGetGroupsQuery } from '../api'
import { GroupDialog } from '../components/GroupDialog'
import { useGroupBalances } from '../hooks/useGroupBalances'
import { balancePhrase } from '../utils'

export function GroupsPage() {
  const uid = useUid()
  const { locale } = useUserSettings()
  const { data: groups, error, isLoading, refetch } = useGetGroupsQuery(uid)
  const balances = useGroupBalances(uid, groups)
  const [creating, setCreating] = useState(false)

  const addButton = (
    <Button onClick={() => setCreating(true)}>
      <Plus aria-hidden />
      New group
    </Button>
  )

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Groups</h1>
        {addButton}
      </div>

      {isLoading ? (
        <ListSkeleton label="Loading groups" />
      ) : error ? (
        <ErrorState
          title="Could not load your groups"
          message={String(error)}
          onRetry={() => void refetch()}
        />
      ) : !groups || groups.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No groups yet"
          description="Create a group for a trip, your flat or a dinner, then invite people with a link."
          action={addButton}
        />
      ) : (
        <ul aria-label="Groups" className="space-y-2">
          {groups.map((group) => {
            const balance = balances.get(group.id)
            const net = balance?.net.get(uid) ?? 0
            return (
              <li key={group.id}>
                <Link
                  to={`/groups/${group.id}`}
                  className="flex items-center gap-3 rounded-lg border bg-card p-3 outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <span
                    aria-hidden
                    className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-xl"
                  >
                    {group.emoji}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{group.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {group.memberIds.length} member{group.memberIds.length === 1 ? '' : 's'} ·{' '}
                      {group.currency}
                    </span>
                  </span>
                  {balance?.loading ? (
                    <Skeleton className="h-4 w-24" />
                  ) : balance?.error ? (
                    <span className="text-xs text-muted-foreground">Balance unavailable</span>
                  ) : (
                    <span
                      className={cn(
                        'text-right text-sm',
                        net < 0 && 'text-destructive',
                        net > 0 && 'text-success',
                        net === 0 && 'text-muted-foreground',
                      )}
                    >
                      {balancePhrase(net, group.currency, locale)}
                    </span>
                  )}
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      <GroupDialog open={creating} onOpenChange={setCreating} />
    </section>
  )
}
