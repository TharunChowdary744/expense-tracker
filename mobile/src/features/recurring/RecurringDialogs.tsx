import { zodResolver } from '@hookform/resolvers/zod'
import { skipToken } from '@reduxjs/toolkit/query/react'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { View } from 'react-native'
import { useGetAccountsQuery } from '@/features/accounts/api'
import { useUid } from '@/features/auth/hooks'
import {
  useConfirmOccurrenceMutation,
  useDeleteRecurringMutation,
  useGetRuleTransactionsQuery,
} from '@/features/recurring/api'
import {
  confirmFormSchema,
  type ConfirmFormInput,
  type ConfirmFormValues,
} from '@/features/recurring/confirm'
import type { PendingOccurrence, RecurringRule } from '@/features/recurring/types'
import { useDeleteTransactionsMutation } from '@/features/transactions/api'
import { useToast } from '@/features/ui/hooks'
import { formatCalendarDate } from '@/utils/dates'
import { formatMoney, fromMinor } from '@/utils/money'
import { FormTextField } from '@m/components/form/Controlled'
import { FormMessage } from '@m/components/form/FormMessage'
import { Button } from '@m/components/ui/Button'
import { Checkbox } from '@m/components/ui/Controls'
import { Dialog } from '@m/components/ui/Dialog'

/** Confirms a remind-mode occurrence: posts it, with the amount editable. */
export function ConfirmOccurrenceDialog({
  item,
  title,
  baseCurrency,
  locale,
  onClose,
}: {
  item: PendingOccurrence | null
  title: string
  baseCurrency: string
  locale?: string
  onClose: () => void
}) {
  if (!item) return null
  return (
    <ConfirmForm
      key={item.txId}
      item={item}
      title={title}
      baseCurrency={baseCurrency}
      locale={locale}
      onDone={onClose}
    />
  )
}

function ConfirmForm({
  item,
  title,
  baseCurrency,
  locale,
  onDone,
}: {
  item: PendingOccurrence
  title: string
  baseCurrency: string
  locale?: string
  onDone: () => void
}) {
  const uid = useUid()
  const toast = useToast()
  const [confirm] = useConfirmOccurrenceMutation()
  const [error, setError] = useState<string | null>(null)
  const t = item.rule.template
  const schema = useMemo(
    () => confirmFormSchema({ currency: t.currency, baseCurrency, fxRateToBase: t.fxRateToBase }),
    [t.currency, t.fxRateToBase, baseCurrency],
  )
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<ConfirmFormInput, unknown, ConfirmFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { amount: fromMinor(t.amount, t.currency) },
  })
  const date = formatCalendarDate(item.occurrence.date, locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const submit = handleSubmit(async (values) => {
    setError(null)
    const result = await confirm({
      uid,
      ruleId: item.rule.id,
      key: item.occurrence.key,
      amount: values.amount,
      baseAmount: values.baseAmount,
    })
    if ('error' in result) {
      setError(String(result.error))
      return
    }
    toast({
      title: `${title} posted`,
      description: `${formatMoney(values.amount, t.currency, locale)} on ${date}.`,
      variant: 'success',
    })
    onDone()
  })

  return (
    <Dialog
      open
      onClose={onDone}
      title={`Confirm ${title}`}
      description={`Posts this occurrence dated ${date}. Change the amount if this one is different.`}
      actions={
        <>
          <Button title="Cancel" variant="secondary" onPress={onDone} />
          <Button
            title={isSubmitting ? 'Posting…' : 'Confirm and post'}
            loading={isSubmitting}
            onPress={() => void submit()}
          />
        </>
      }
    >
      {error ? <FormMessage kind="error">{error}</FormMessage> : null}
      <FormTextField
        control={control}
        name="amount"
        label={`Amount (${t.currency})`}
        keyboardType="decimal-pad"
        autoFocus
        onSubmitEditing={() => void submit()}
      />
    </Dialog>
  )
}

/** Deletes a rule and asks whether its posted transactions go too. */
export function DeleteRuleDialog({
  rule,
  title,
  onClose,
}: {
  rule: RecurringRule | null
  title: string
  onClose: () => void
}) {
  const uid = useUid()
  const toast = useToast()
  const posted = useGetRuleTransactionsQuery(rule ? { uid, ruleId: rule.id } : skipToken, {
    refetchOnMountOrArgChange: true,
  })
  const accounts = useGetAccountsQuery(uid)
  const [deleteRule] = useDeleteRecurringMutation()
  const [deleteTransactions] = useDeleteTransactionsMutation()
  const [alsoTransactions, setAlsoTransactions] = useState(false)
  const [busy, setBusy] = useState(false)
  const count = posted.data?.length ?? 0

  function close() {
    setAlsoTransactions(false)
    onClose()
  }

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
    if (alsoTransactions && posted.data && posted.data.length > 0) {
      const currencies = Object.fromEntries((accounts.data ?? []).map((a) => [a.id, a.currency]))
      const removed = await deleteTransactions({ uid, transactions: posted.data, currencies })
      if ('error' in removed) {
        setBusy(false)
        toast({
          title: 'The rule was deleted, but not its transactions',
          description: String(removed.error),
          variant: 'error',
        })
        close()
        return
      }
    }
    setBusy(false)
    toast({
      title: `${title} deleted`,
      description:
        alsoTransactions && count > 0
          ? `${count} posted transaction${count === 1 ? '' : 's'} deleted too.`
          : count > 0
            ? `Its ${count} posted transaction${count === 1 ? ' was' : 's were'} kept.`
            : undefined,
      variant: 'success',
    })
    close()
  }

  const ready = !posted.isFetching && !accounts.isLoading

  return (
    <Dialog
      open={rule !== null}
      onClose={close}
      title={`Delete ${title}?`}
      description={
        posted.isFetching
          ? 'Checking for transactions this rule posted…'
          : posted.error
            ? 'Could not check which transactions this rule posted. Only the rule will be deleted.'
            : count === 0
              ? 'Nothing more will be posted. It has not posted any transactions.'
              : `Nothing more will be posted. It has posted ${count} transaction${count === 1 ? '' : 's'}.`
      }
      actions={
        <>
          <Button title="Cancel" variant="secondary" onPress={close} />
          <Button
            title={busy ? 'Deleting…' : 'Delete rule'}
            variant="destructive"
            loading={busy}
            disabled={!ready}
            onPress={() => void confirm()}
          />
        </>
      }
    >
      {count > 0 && !posted.isFetching ? (
        <View>
          <Checkbox
            checked={alsoTransactions}
            onChange={setAlsoTransactions}
            label={`Delete the ${count} posted transaction${count === 1 ? '' : 's'} too`}
            description={
              alsoTransactions
                ? 'Account balances are adjusted.'
                : 'Left unticked, they stay in your history and balances.'
            }
          />
        </View>
      ) : null}
    </Dialog>
  )
}
