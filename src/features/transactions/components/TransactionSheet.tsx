import { useMemo } from 'react'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { ListSkeleton } from '@/components/ListStates'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { useGetAccountsQuery } from '@/features/accounts/api'
import { useUid } from '@/features/auth/hooks'
import { useGetCategoriesQuery } from '@/features/categories/api'
import { useUserSettings } from '@/features/settings/hooks'
import { useToast } from '@/features/ui/hooks'
import { dialogClosed } from '@/features/ui/slice'
import { useCreateTransactionMutation, useUpdateTransactionMutation } from '../api'
import { loadPrefs, rememberTransaction } from '../prefs'
import { TRANSACTION_TYPE_LABELS, type TransactionFormValues } from '../schemas'
import type { Transaction } from '../types'
import { dateInputToIso, dayKey } from '../utils'
import { TransactionForm } from './TransactionForm'

/**
 * The quick-add sheet (opened by the "+" button or the "n" shortcut) and the edit/duplicate
 * sheet, driven by the global dialog in the ui slice.
 */
export function TransactionSheet() {
  const dialog = useAppSelector((s) => s.ui.dialog)
  const dispatch = useAppDispatch()
  const open = dialog?.kind === 'quick-add' || dialog?.kind === 'edit-transaction'
  const initial = dialog?.kind === 'edit-transaction' ? dialog.transaction : undefined
  const duplicate = dialog?.kind === 'edit-transaction' && Boolean(dialog.duplicate)
  const editing = initial !== undefined && !duplicate

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) dispatch(dialogClosed())
      }}
    >
      <SheetContent aria-describedby="tx-sheet-description">
        <SheetTitle className="pr-8 text-lg font-semibold">
          {editing ? 'Edit transaction' : duplicate ? 'Duplicate transaction' : 'Add transaction'}
        </SheetTitle>
        <SheetDescription id="tx-sheet-description" className="mb-4 text-sm text-muted-foreground">
          {editing
            ? 'Balances update when you save.'
            : 'Record an expense, income or a transfer between your accounts.'}
        </SheetDescription>
        {open && (
          <SheetBody
            key={initial ? `${initial.id}-${duplicate ? 'copy' : 'edit'}` : 'new'}
            initial={initial}
            duplicate={duplicate}
            onDone={() => dispatch(dialogClosed())}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

function SheetBody({
  initial,
  duplicate,
  onDone,
}: {
  initial?: Transaction
  duplicate: boolean
  onDone: () => void
}) {
  const uid = useUid()
  const toast = useToast()
  const { baseCurrency, locale } = useUserSettings()
  const accounts = useGetAccountsQuery(uid)
  const categories = useGetCategoriesQuery(uid)
  const [createTransaction] = useCreateTransactionMutation()
  const [updateTransaction] = useUpdateTransactionMutation()
  // Read once per open; saving updates them for next time.
  const prefs = useMemo(() => loadPrefs(uid), [uid])
  const currencies = useMemo(
    () => Object.fromEntries((accounts.data ?? []).map((a) => [a.id, a.currency])),
    [accounts.data],
  )

  if (!accounts.data || !categories.data) {
    return accounts.error || categories.error ? (
      <p role="alert" className="text-sm text-destructive">
        Could not load your accounts and categories. Close this and try again.
      </p>
    ) : (
      <ListSkeleton rows={3} label="Loading the form" />
    )
  }

  async function onSubmit(values: TransactionFormValues): Promise<string | null> {
    const editing = initial && !duplicate
    // Keep the original time of day when the date is unchanged, so ordering stays stable.
    const keepTime = editing && dayKey(initial.date) === values.date ? initial.date : undefined
    const dateIso = dateInputToIso(values.date, keepTime)
    const result = editing
      ? await updateTransaction({ uid, before: initial, values, dateIso, currencies })
      : await createTransaction({ uid, values, dateIso, currencies })
    if ('error' in result) return String(result.error)
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
      onSubmit={onSubmit}
      onCancel={onDone}
    />
  )
}
