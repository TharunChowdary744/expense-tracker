import { Plus, Wallet } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ListStates'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { useUid } from '@/features/auth/hooks'
import { useUserSettings } from '@/features/settings/hooks'
import { useToast } from '@/features/ui/hooks'
import { formatMoney } from '@/utils/money'
import { useGetAccountsQuery, useSetAccountArchivedMutation } from '../api'
import { AccountDialog } from '../components/AccountDialog'
import { AccountRow } from '../components/AccountRow'
import type { Account } from '../types'
import { accountBalance, netWorth } from '../utils'

type DialogState = { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; account: Account }

export function AccountsPage() {
  const uid = useUid()
  const toast = useToast()
  const switchId = useId()
  const { baseCurrency, locale } = useUserSettings()
  const { data: accounts, error, isLoading, refetch } = useGetAccountsQuery(uid)
  const [setArchived] = useSetAccountArchivedMutation()
  const [showArchived, setShowArchived] = useState(false)
  const [dialog, setDialog] = useState<DialogState>({ mode: 'closed' })

  // Transactions arrive in phase 3; until then every balance is the opening balance.
  const balances = useMemo(
    () => new Map((accounts ?? []).map((a) => [a.id, accountBalance(a)])),
    [accounts],
  )
  const worth = useMemo(
    () => netWorth(accounts ?? [], balances, baseCurrency),
    [accounts, balances, baseCurrency],
  )
  const archivedCount = accounts?.filter((a) => a.archived).length ?? 0
  const visible = accounts?.filter((a) => showArchived || !a.archived) ?? []

  async function toggleArchived(account: Account) {
    const archived = !account.archived
    const result = await setArchived({ uid, id: account.id, archived })
    if ('error' in result) {
      toast({
        title: 'Could not update the account',
        description: String(result.error),
        variant: 'error',
      })
    } else {
      toast({
        title: archived ? `${account.name} archived` : `${account.name} restored`,
        variant: 'success',
      })
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
        <Button onClick={() => setDialog({ mode: 'create' })}>
          <Plus aria-hidden />
          Add account
        </Button>
      </div>

      <div className="rounded-xl border bg-card p-5" aria-live="polite">
        <p className="text-sm text-muted-foreground">Net worth ({baseCurrency})</p>
        {isLoading || !accounts ? (
          <Skeleton className="mt-2 h-8 w-40" />
        ) : (
          <>
            <p
              className={`mt-1 text-3xl font-semibold tabular-nums ${worth.base < 0 ? 'text-destructive' : ''}`}
            >
              {formatMoney(worth.base, baseCurrency, locale)}
            </p>
            {worth.other.length > 0 && (
              <p className="mt-2 text-sm text-muted-foreground">
                Not included until exchange rates are added:{' '}
                {worth.other.map((o) => formatMoney(o.amount, o.currency, locale)).join(', ')}
              </p>
            )}
          </>
        )}
      </div>

      {archivedCount > 0 && (
        <div className="flex items-center gap-2">
          <Switch id={switchId} checked={showArchived} onCheckedChange={setShowArchived} />
          <label htmlFor={switchId} className="text-sm">
            Show archived ({archivedCount})
          </label>
        </div>
      )}

      {isLoading ? (
        <ListSkeleton label="Loading accounts" />
      ) : error ? (
        <ErrorState
          title="Could not load your accounts"
          message={String(error)}
          onRetry={() => void refetch()}
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title={archivedCount > 0 ? 'All your accounts are archived' : 'No accounts yet'}
          description="Add the bank accounts, cards and cash you want to track."
          action={
            <Button onClick={() => setDialog({ mode: 'create' })}>
              <Plus aria-hidden />
              Add account
            </Button>
          }
        />
      ) : (
        <ul aria-label="Accounts" className="space-y-2">
          {visible.map((account) => (
            <AccountRow
              key={account.id}
              account={account}
              balance={balances.get(account.id) ?? account.openingBalance}
              locale={locale}
              onEdit={() => setDialog({ mode: 'edit', account })}
              onToggleArchived={() => void toggleArchived(account)}
            />
          ))}
        </ul>
      )}

      <AccountDialog
        open={dialog.mode !== 'closed'}
        onOpenChange={(open) => {
          if (!open) setDialog({ mode: 'closed' })
        }}
        account={dialog.mode === 'edit' ? dialog.account : undefined}
      />
    </section>
  )
}
