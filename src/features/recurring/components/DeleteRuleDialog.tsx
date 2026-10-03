import { skipToken } from '@reduxjs/toolkit/query/react'
import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useGetAccountsQuery } from '@/features/accounts/api'
import { useUid } from '@/features/auth/hooks'
import { useDeleteTransactionsMutation } from '@/features/transactions/api'
import { useToast } from '@/features/ui/hooks'
import { useDeleteRecurringMutation, useGetRuleTransactionsQuery } from '../api'
import type { RecurringRule } from '../types'

interface Props {
  rule: RecurringRule | null
  title: string
  onOpenChange: (open: boolean) => void
}

/** Deletes a rule and asks whether its posted transactions go too. */
export function DeleteRuleDialog({ rule, title, onOpenChange }: Props) {
  const uid = useUid()
  const id = useId()
  const toast = useToast()
  const posted = useGetRuleTransactionsQuery(rule ? { uid, ruleId: rule.id } : skipToken, {
    refetchOnMountOrArgChange: true,
  })
  const accounts = useGetAccountsQuery(uid)
  const [deleteRule] = useDeleteRecurringMutation()
  const [deleteTransactions] = useDeleteTransactionsMutation()
  const [choice, setChoice] = useState<'keep' | 'delete'>('keep')
  const [busy, setBusy] = useState(false)
  const count = posted.data?.length ?? 0

  async function confirm() {
    if (!rule) return
    setBusy(true)
    // The rule goes first, so a catch-up run can't post again while its history is removed.
    const result = await deleteRule({ uid, id: rule.id })
    if ('error' in result) {
      setBusy(false)
      toast({
        title: 'Could not delete the rule',
        description: String(result.error),
        variant: 'error',
      })
      return
    }
    if (choice === 'delete' && posted.data && posted.data.length > 0) {
      const currencies = Object.fromEntries((accounts.data ?? []).map((a) => [a.id, a.currency]))
      const removed = await deleteTransactions({ uid, transactions: posted.data, currencies })
      if ('error' in removed) {
        setBusy(false)
        toast({
          title: 'The rule was deleted, but not its transactions',
          description: String(removed.error),
          variant: 'error',
        })
        onOpenChange(false)
        return
      }
    }
    setBusy(false)
    toast({
      title: `${title} deleted`,
      description:
        choice === 'delete' && count > 0
          ? `${count} posted transaction${count === 1 ? '' : 's'} deleted too.`
          : count > 0
            ? `Its ${count} posted transaction${count === 1 ? ' was' : 's were'} kept.`
            : undefined,
      variant: 'success',
    })
    onOpenChange(false)
  }

  const ready = !posted.isFetching && !accounts.isLoading

  return (
    <Dialog
      open={rule !== null}
      onOpenChange={(open) => {
        if (!open) setChoice('keep')
        onOpenChange(open)
      }}
    >
      <DialogContent>
        <DialogTitle className="text-lg font-semibold">Delete {title}?</DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          {posted.isFetching
            ? 'Checking for transactions this rule posted…'
            : posted.error
              ? 'Could not check which transactions this rule posted. Only the rule will be deleted.'
              : count === 0
                ? 'Nothing more will be posted. It has not posted any transactions.'
                : `Nothing more will be posted. It has posted ${count} transaction${count === 1 ? '' : 's'}.`}
        </DialogDescription>
        {count > 0 && !posted.isFetching && (
          <fieldset className="space-y-2">
            <legend className="sr-only">Posted transactions</legend>
            {(['keep', 'delete'] as const).map((value) => (
              <label
                key={value}
                htmlFor={`${id}-${value}`}
                className="flex cursor-pointer items-start gap-2 rounded-md border p-2.5 text-sm"
              >
                <input
                  id={`${id}-${value}`}
                  type="radio"
                  name={`${id}-choice`}
                  className="mt-0.5"
                  checked={choice === value}
                  onChange={() => setChoice(value)}
                />
                <span>
                  {value === 'keep'
                    ? `Keep the ${count} posted transaction${count === 1 ? '' : 's'}`
                    : `Delete the ${count} posted transaction${count === 1 ? '' : 's'} too`}
                  <span className="block text-xs text-muted-foreground">
                    {value === 'keep'
                      ? 'They stay in your history and balances.'
                      : 'Account balances are adjusted.'}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={busy || !ready} onClick={() => void confirm()}>
            {busy ? 'Deleting…' : 'Delete rule'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
