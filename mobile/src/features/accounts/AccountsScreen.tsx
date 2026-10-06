import { Archive, ArchiveRestore, Pencil, Plus, Wallet } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useUid } from '@/features/auth/hooks'
import {
  useCreateAccountMutation,
  useGetAccountsQuery,
  useSetAccountArchivedMutation,
  useUpdateAccountMutation,
} from '@/features/accounts/api'
import { ACCOUNT_TYPE_LABELS, type AccountFormValues } from '@/features/accounts/schemas'
import type { Account } from '@/features/accounts/types'
import { accountBalance, netWorth } from '@/features/accounts/utils'
import { useUserSettings } from '@/features/settings/hooks'
import { useToast } from '@/features/ui/hooks'
import { formatMoney } from '@/utils/money'
import { ColoredIcon } from '@m/components/ColoredIcon'
import { PendingBadge } from '@m/components/PendingBadge'
import { Screen } from '@m/components/Screen'
import { Button } from '@m/components/ui/Button'
import { Card } from '@m/components/ui/Card'
import { SwitchRow } from '@m/components/ui/Controls'
import { EmptyState, QueryStates } from '@m/components/ui/ListStates'
import { ActionMenu } from '@m/components/ui/Menu'
import { Sheet } from '@m/components/ui/Sheet'
import { Text } from '@m/components/ui/Text'
import { AccountForm } from './AccountForm'

type DialogState = { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; account: Account }

export function AccountsScreen() {
  const uid = useUid()
  const toast = useToast()
  const { baseCurrency, locale } = useUserSettings()
  const { data: accounts, error, isLoading, refetch } = useGetAccountsQuery(uid)
  const [setArchived] = useSetAccountArchivedMutation()
  const [createAccount] = useCreateAccountMutation()
  const [updateAccount] = useUpdateAccountMutation()
  const [showArchived, setShowArchived] = useState(false)
  const [dialog, setDialog] = useState<DialogState>({ mode: 'closed' })

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
  const editing = dialog.mode === 'edit' ? dialog.account : undefined

  async function toggleArchived(account: Account) {
    const archived = !account.archived
    const result = await setArchived({ uid, id: account.id, archived })
    if ('error' in result) {
      toast({ title: 'Could not update the account', description: String(result.error), variant: 'error' })
    } else {
      toast({ title: archived ? `${account.name} archived` : `${account.name} restored`, variant: 'success' })
    }
  }

  async function onSubmit(values: AccountFormValues): Promise<string | null> {
    const result = editing
      ? await updateAccount({ uid, id: editing.id, values })
      : await createAccount({ uid, values })
    if ('error' in result) return String(result.error)
    toast({ title: editing ? 'Account saved' : 'Account created', variant: 'success' })
    setDialog({ mode: 'closed' })
    return null
  }

  return (
    <Screen>
      <Button title="Add account" icon={Plus} onPress={() => setDialog({ mode: 'create' })} />
      <Card>
        <Text variant="small" tone="muted">
          Net worth ({baseCurrency})
        </Text>
        <Text
          variant="title"
          tabular
          tone={worth.base < 0 ? 'destructive' : 'default'}
          accessibilityLiveRegion="polite"
        >
          {accounts ? formatMoney(worth.base, baseCurrency, locale) : '…'}
        </Text>
        {worth.other.length > 0 ? (
          <Text variant="small" tone="muted">
            Not included until exchange rates are added:{' '}
            {worth.other.map((o) => formatMoney(o.amount, o.currency, locale)).join(', ')}
          </Text>
        ) : null}
      </Card>

      {archivedCount > 0 ? (
        <SwitchRow
          label={`Show archived (${archivedCount})`}
          value={showArchived}
          onChange={setShowArchived}
        />
      ) : null}

      <QueryStates
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        isEmpty={visible.length === 0}
        empty={
          <EmptyState
            icon={Wallet}
            title={archivedCount > 0 ? 'All your accounts are archived' : 'No accounts yet'}
            description="Add the bank accounts, cards and cash you want to track."
            action={<Button title="Add account" icon={Plus} onPress={() => setDialog({ mode: 'create' })} />}
          />
        }
      >
        <View accessibilityLabel="Accounts" style={{ gap: 8 }}>
          {visible.map((account) => {
            const balance = balances.get(account.id) ?? account.openingBalance
            return (
              <Card key={account.id} style={[styles.row, account.archived && { opacity: 0.7 }]}>
                <ColoredIcon icon={account.icon} color={account.color} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text weight="600" numberOfLines={1}>
                    {account.name}
                  </Text>
                  <View style={styles.meta}>
                    <Text variant="small" tone="muted">
                      {ACCOUNT_TYPE_LABELS[account.type]} · {account.currency}
                    </Text>
                    {account.archived ? (
                      <Text variant="caption" tone="muted">
                        Archived
                      </Text>
                    ) : null}
                    {account.pending ? <PendingBadge /> : null}
                  </View>
                </View>
                <Text
                  weight="600"
                  tabular
                  tone={balance < 0 ? 'destructive' : 'default'}
                  accessibilityLabel={`Balance ${formatMoney(balance, account.currency, locale)}`}
                >
                  {formatMoney(balance, account.currency, locale)}
                </Text>
                <ActionMenu
                  label={`Actions for ${account.name}`}
                  title={account.name}
                  actions={[
                    { label: 'Edit', icon: Pencil, onPress: () => setDialog({ mode: 'edit', account }) },
                    {
                      label: account.archived ? 'Restore' : 'Archive',
                      icon: account.archived ? ArchiveRestore : Archive,
                      onPress: () => void toggleArchived(account),
                    },
                  ]}
                />
              </Card>
            )
          })}
        </View>
      </QueryStates>

      <Sheet
        open={dialog.mode !== 'closed'}
        onClose={() => setDialog({ mode: 'closed' })}
        title={editing ? 'Edit account' : 'New account'}
        subtitle={
          editing
            ? 'Changes apply everywhere this account is used.'
            : 'A bank account, card, wallet or cash you want to track.'
        }
      >
        {dialog.mode !== 'closed' ? (
          <AccountForm
            key={editing?.id ?? 'new'}
            account={editing}
            defaultCurrency={baseCurrency}
            locale={locale}
            onSubmit={onSubmit}
            onCancel={() => setDialog({ mode: 'closed' })}
          />
        ) : null}
      </Sheet>
    </Screen>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
})
