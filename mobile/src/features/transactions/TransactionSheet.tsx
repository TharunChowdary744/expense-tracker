import { useMemo, useState } from 'react'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { useGetAccountsQuery } from '@/features/accounts/api'
import { useUid } from '@/features/auth/hooks'
import { useGetCategoriesQuery } from '@/features/categories/api'
import { receiptsEnabled } from '@/features/receipts/flag'
import { commitDrafts } from '@/features/receipts/queue'
import { selectUploadsFor } from '@/features/receipts/slice'
import type { ReceiptParent } from '@/features/receipts/types'
import { receiptPrefix } from '@/features/receipts/utils'
import { useCreateRecurringMutation, useUpdateRecurringMutation } from '@/features/recurring/api'
import type { RecurringRule } from '@/features/recurring/types'
import { earliestNewStart } from '@/features/recurring/utils'
import { useUserSettings } from '@/features/settings/hooks'
import {
  newTransactionId,
  useCreateTransactionMutation,
  useUpdateTransactionMutation,
} from '@/features/transactions/api'
import { loadPrefs, rememberTransaction } from '@/features/transactions/prefs'
import { TRANSACTION_TYPE_LABELS, type TransactionFormValues } from '@/features/transactions/schemas'
import type { Transaction } from '@/features/transactions/types'
import { dateInputToIso, dayKey } from '@/features/transactions/utils'
import { useToast } from '@/features/ui/hooks'
import { dialogClosed } from '@/features/ui/slice'
import { deviceTimeZone, formatCalendarDate } from '@/utils/dates'
import { ListSkeleton } from '@m/components/ui/ListStates'
import { Sheet } from '@m/components/ui/Sheet'
import { Text } from '@m/components/ui/Text'
import { AttachmentsField } from '../receipts/AttachmentsField'
import { TransactionForm } from './TransactionForm'

/**
 * The quick-add sheet ("+" button) and the edit / duplicate / edit-rule sheet, driven by the
 * global dialog in the ui slice, as in the web app.
 */
export function TransactionSheet() {
  const dialog = useAppSelector((s) => s.ui.dialog)
  const dispatch = useAppDispatch()
  const open =
    dialog?.kind === 'quick-add' || dialog?.kind === 'edit-transaction' || dialog?.kind === 'edit-recurring'
  const initial = dialog?.kind === 'edit-transaction' ? dialog.transaction : undefined
  const duplicate = dialog?.kind === 'edit-transaction' && Boolean(dialog.duplicate)
  const editing = initial !== undefined && !duplicate
  const rule = dialog?.kind === 'edit-recurring' ? dialog.rule : undefined
  const startRecurring = dialog?.kind === 'quick-add' && Boolean(dialog.recurring)

  return (
    <Sheet
      open={open}
      onClose={() => dispatch(dialogClosed())}
      title={
        rule
          ? 'Edit recurring rule'
          : editing
            ? 'Edit transaction'
            : duplicate
              ? 'Duplicate transaction'
              : 'Add transaction'
      }
      subtitle={
        rule
          ? 'Changes apply to this and future occurrences.'
          : editing
            ? 'Balances update when you save.'
            : 'An expense, income or a transfer between accounts.'
      }
    >
      {open ? (
        <SheetBody
          key={
            rule
              ? `rule-${rule.id}`
              : initial
                ? `${initial.id}-${duplicate ? 'copy' : 'edit'}`
                : `new-${startRecurring ? 'recurring' : 'once'}`
          }
          initial={initial}
          duplicate={duplicate}
          rule={rule}
          startRecurring={startRecurring}
          onDone={() => dispatch(dialogClosed())}
        />
      ) : null}
    </Sheet>
  )
}

function SheetBody({
  initial,
  duplicate,
  rule,
  startRecurring,
  onDone,
}: {
  initial?: Transaction
  duplicate: boolean
  rule?: RecurringRule
  startRecurring: boolean
  onDone: () => void
}) {
  const uid = useUid()
  const toast = useToast()
  const { baseCurrency, locale } = useUserSettings()
  const accounts = useGetAccountsQuery(uid)
  const categories = useGetCategoriesQuery(uid)
  const [createTransaction] = useCreateTransactionMutation()
  const [updateTransaction] = useUpdateTransactionMutation()
  const [createRecurring] = useCreateRecurringMutation()
  const [updateRecurring] = useUpdateRecurringMutation()
  const prefs = useMemo(() => loadPrefs(uid), [uid])
  const editingTx = initial !== undefined && !duplicate
  const [txId] = useState(() => (editingTx ? initial.id : newTransactionId(uid)))
  const parent = useMemo<ReceiptParent>(() => ({ kind: 'tx', uid, id: txId }), [uid, txId])
  const prefix = receiptPrefix(parent)
  const draftUploads = useAppSelector((s) => selectUploadsFor(s, prefix))
  const [preparingFiles, setPreparingFiles] = useState(false)
  const currencies = useMemo(
    () => Object.fromEntries((accounts.data ?? []).map((a) => [a.id, a.currency])),
    [accounts.data],
  )

  if (!accounts.data || !categories.data) {
    return accounts.error || categories.error ? (
      <Text tone="destructive" accessibilityRole="alert">
        Could not load your accounts and categories. Close this and try again.
      </Text>
    ) : (
      <ListSkeleton rows={3} label="Loading the form" />
    )
  }

  async function onSubmitRecurring(
    values: TransactionFormValues & { recurrence: NonNullable<TransactionFormValues['recurrence']> },
  ): Promise<string | null> {
    const result = rule
      ? await updateRecurring({ uid, rule, values })
      : await createRecurring({ uid, values, timeZone: deviceTimeZone() })
    if ('error' in result) return String(result.error)
    rememberTransaction(uid, values, baseCurrency)
    const kind = TRANSACTION_TYPE_LABELS[values.type].toLowerCase()
    toast({
      title: rule ? 'Recurring rule saved' : `Recurring ${kind} created`,
      description:
        rule || values.recurrence.mode === 'remind' ? undefined : 'Any occurrences already due are being posted.',
      variant: 'success',
    })
    onDone()
    return null
  }

  async function onSubmit(values: TransactionFormValues): Promise<string | null> {
    if (values.recurrence) return onSubmitRecurring({ ...values, recurrence: values.recurrence })
    const editing = initial && !duplicate
    if (!editing && preparingFiles) return 'Wait for the receipts to finish compressing.'
    const keepTime = editing && dayKey(initial.date) === values.date ? initial.date : undefined
    const dateIso = dateInputToIso(values.date, keepTime)
    const result = editing
      ? await updateTransaction({ uid, before: initial, values, dateIso, currencies })
      : await createTransaction({
          uid,
          values,
          dateIso,
          currencies,
          id: txId,
          attachments: draftUploads.filter((u) => u.draft && u.status !== 'failed').map((u) => u.attachment),
        })
    if ('error' in result) return String(result.error)
    if (!editing) commitDrafts(prefix)
    rememberTransaction(uid, values, baseCurrency)
    toast({
      title: editing ? 'Transaction saved' : `${TRANSACTION_TYPE_LABELS[values.type]} added`,
      variant: 'success',
    })
    onDone()
    return null
  }

  return (
    <TransactionForm
      accounts={accounts.data}
      categories={categories.data}
      baseCurrency={baseCurrency}
      locale={locale}
      prefs={prefs}
      initial={initial}
      duplicate={duplicate}
      recurring={rule ? 'rule' : 'toggle'}
      startRecurring={startRecurring}
      rule={rule}
      dateHint={
        rule
          ? `A changed schedule can start on ${formatCalendarDate(earliestNewStart(rule), locale, { day: 'numeric', month: 'short', year: 'numeric' })} or later.`
          : undefined
      }
      attachments={
        receiptsEnabled ? (
          <AttachmentsField parent={parent} mode={editingTx ? 'saved' : 'draft'} onBusyChange={setPreparingFiles} />
        ) : undefined
      }
      onSubmit={onSubmit}
      onCancel={onDone}
    />
  )
}
