import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { MOBILE_QUERY, useMediaQuery } from '@/app/useMediaQuery'
import { FormMessage } from '@/components/form/FormMessage'
import { SelectField } from '@/components/form/SelectField'
import { TextField } from '@/components/form/TextField'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Account } from '@/features/accounts/types'
import { accountBalance } from '@/features/accounts/utils'
import type { Category } from '@/features/categories/types'
import { categoryPickerOptions } from '@/features/categories/utils'
import { evaluateAmount, isExpression } from '@/utils/calc'
import { currencyOptions } from '@/utils/currency'
import { convertMinor, formatMoney, fromMinor, isValidRate } from '@/utils/money'
import { fxPair, type QuickAddPrefs } from '../prefs'
import {
  NOTE_MAX,
  PAYEE_MAX,
  TRANSACTION_TYPES,
  TRANSACTION_TYPE_LABELS,
  transactionFormSchema,
  type TransactionFormInput,
  type TransactionFormValues,
  type TransactionType,
} from '../schemas'
import type { Transaction } from '../types'
import { applyKey, dayKey, todayInput } from '../utils'
import { AmountKeypad } from './AmountKeypad'
import { TagInput } from './TagInput'

export interface TransactionFormProps {
  accounts: readonly Account[]
  categories: readonly Category[]
  baseCurrency: string
  locale?: string
  prefs: QuickAddPrefs
  /** Prefill from this transaction (edit or duplicate). */
  initial?: Transaction
  /** Duplicate: prefilled, but saved as a new transaction dated today. */
  duplicate?: boolean
  /** Resolves to an error message, or null on success. */
  onSubmit: (values: TransactionFormValues) => Promise<string | null>
  onCancel: () => void
}

function defaultValues(p: TransactionFormProps): TransactionFormInput {
  const { initial, accounts, prefs, baseCurrency } = p
  if (initial) {
    return {
      type: initial.type,
      amount: fromMinor(initial.amount, initial.currency),
      currency: initial.currency,
      fxRate: initial.currency === baseCurrency ? '' : String(initial.fxRateToBase),
      accountId: initial.accountId,
      toAccountId: initial.toAccountId ?? '',
      categoryId: initial.categoryId ?? '',
      date: p.duplicate ? todayInput() : dayKey(initial.date),
      payee: initial.payee,
      note: initial.note,
      tags: initial.tags,
    }
  }
  const active = accounts.filter((a) => !a.archived)
  const account = active.find((a) => a.id === prefs.lastAccountId) ?? active[0]
  const currency = account?.currency ?? baseCurrency
  return {
    type: 'expense',
    amount: '',
    currency,
    fxRate: prefs.fxRates[fxPair(currency, baseCurrency)] ?? '',
    accountId: account?.id ?? '',
    toAccountId: '',
    categoryId: '',
    date: todayInput(),
    payee: '',
    note: '',
    tags: [],
  }
}

export function TransactionForm(props: TransactionFormProps) {
  const { accounts, categories, baseCurrency, locale, prefs, initial, onSubmit, onCancel } = props
  const isMobile = useMediaQuery(MOBILE_QUERY)
  const [error, setError] = useState<string | null>(null)

  const currencyById = useMemo(() => new Map(accounts.map((a) => [a.id, a.currency])), [accounts])
  const schema = useMemo(
    () => transactionFormSchema({ baseCurrency, accountCurrency: (id) => currencyById.get(id) }),
    [baseCurrency, currencyById],
  )

  const {
    register,
    control,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<TransactionFormInput, unknown, TransactionFormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues(props),
  })

  const type = useWatch({ control, name: 'type' })
  const amountText = useWatch({ control, name: 'amount' })
  const currency = useWatch({ control, name: 'currency' })
  const fxRate = useWatch({ control, name: 'fxRate' })
  const accountId = useWatch({ control, name: 'accountId' })

  // Pickers show active items, plus whatever an edited transaction already uses.
  const accountOptions = accounts.filter(
    (a) => !a.archived || a.id === initial?.accountId || a.id === initial?.toAccountId,
  )
  const categoryKind = type === 'income' ? 'income' : 'expense'
  const categoryOptions = useMemo(() => {
    const options = categoryPickerOptions(categories, categoryKind)
    const current = categories.find((c) => c.id === initial?.categoryId)
    if (current && current.kind === categoryKind && !options.some((o) => o.id === current.id)) {
      options.push({ id: current.id, label: `${current.name} (archived)`, depth: 0 })
    }
    return options
  }, [categories, categoryKind, initial?.categoryId])
  const recentOptions = prefs.recentCategoryIds
    .map((id) => categoryOptions.find((o) => o.id === id))
    .filter((o): o is NonNullable<typeof o> => o !== undefined)

  const preview = useMemo(() => {
    try {
      return evaluateAmount(amountText, currency)
    } catch {
      return null
    }
  }, [amountText, currency])
  const basePreview =
    preview !== null && preview > 0 && currency !== baseCurrency && isValidRate(fxRate)
      ? safeConvert(preview, currency, baseCurrency, fxRate)
      : null

  function changeType(next: TransactionType) {
    setValue('type', next)
    const category = categories.find((c) => c.id === getValues('categoryId'))
    if (next === 'transfer' || (category && category.kind !== next)) setValue('categoryId', '')
  }

  function changeCurrency(next: string) {
    setValue('currency', next, { shouldValidate: Boolean(errors.currency) })
    if (next !== baseCurrency) {
      setValue('fxRate', prefs.fxRates[fxPair(next, baseCurrency)] ?? '')
    }
  }

  async function submit(values: TransactionFormValues) {
    setError(null)
    const message = await onSubmit(values)
    if (message) setError(message)
  }

  const accountLabel = (a: Account) =>
    `${a.name} · ${formatMoney(accountBalance(a), a.currency, locale)}${a.archived ? ' (archived)' : ''}`

  return (
    <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
      {error && <FormMessage kind="error">{error}</FormMessage>}

      <Tabs value={type} onValueChange={(v) => changeType(v as TransactionType)}>
        <TabsList className="grid w-full grid-cols-3" aria-label="Transaction type">
          {TRANSACTION_TYPES.map((t) => (
            <TabsTrigger key={t} value={t}>
              {TRANSACTION_TYPE_LABELS[t]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* On phones the amount stays in view while the keypad below is used. */}
      <div className="sticky -top-5 z-10 -mx-1 space-y-1.5 bg-card px-1 py-1 md:static">
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1 space-y-1.5">
            <label htmlFor="tx-amount" className="text-sm font-medium">
              Amount
            </label>
            <input
              id="tx-amount"
              autoComplete="off"
              // On phones the keypad below replaces the system keyboard.
              inputMode={isMobile ? 'none' : 'decimal'}
              placeholder="0"
              // eslint-disable-next-line jsx-a11y/no-autofocus -- the sheet exists to type an amount
              autoFocus={!isMobile}
              aria-invalid={errors.amount ? true : undefined}
              aria-describedby="tx-amount-help"
              className="h-14 w-full min-w-0 rounded-md border bg-background px-3 text-3xl font-semibold tabular-nums shadow-xs outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive"
              {...register('amount')}
            />
          </div>
          <div className="w-28 shrink-0">
            <SelectField
              label="Currency"
              className="h-14"
              value={currency}
              onChange={(e) => changeCurrency(e.target.value)}
            >
              {currencyOptions(locale, currency).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.value}
                </option>
              ))}
            </SelectField>
          </div>
        </div>
        <p
          id="tx-amount-help"
          className={errors.amount ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}
        >
          {errors.amount?.message ??
            (preview !== null && isExpression(amountText)
              ? `= ${formatMoney(preview, currency, locale)}`
              : 'You can type a sum like 120+45.')}
        </p>
        {errors.currency && <p className="text-xs text-destructive">{errors.currency.message}</p>}
      </div>

      {isMobile && (
        <AmountKeypad
          onKey={(key) =>
            setValue('amount', applyKey(getValues('amount'), key), {
              shouldValidate: Boolean(errors.amount),
            })
          }
        />
      )}

      {currency !== baseCurrency && (
        <div className="space-y-1.5 rounded-lg border bg-muted/40 p-3">
          <TextField
            label={`Exchange rate: 1 ${currency} in ${baseCurrency}`}
            inputMode="decimal"
            autoComplete="off"
            placeholder="e.g. 83.25"
            error={errors.fxRate?.message}
            hint={
              basePreview !== null
                ? `Recorded as ${formatMoney(basePreview, baseCurrency, locale)} in your base currency.`
                : 'Prefilled with the last rate you used for this pair.'
            }
            {...register('fxRate')}
          />
        </div>
      )}

      <div className={type === 'transfer' ? 'grid gap-4 sm:grid-cols-2' : ''}>
        <SelectField
          label={type === 'transfer' ? 'From account' : 'Account'}
          error={errors.accountId?.message}
          {...register('accountId', {
            onChange: (e: { target: { value: string } }) => {
              const next = currencyById.get(e.target.value)
              if (next) changeCurrency(next)
            },
          })}
        >
          {accountOptions.length === 0 && <option value="">No accounts yet</option>}
          {accountOptions.map((a) => (
            <option key={a.id} value={a.id}>
              {accountLabel(a)}
            </option>
          ))}
        </SelectField>
        {type === 'transfer' && (
          <SelectField
            label="To account"
            error={errors.toAccountId?.message}
            {...register('toAccountId')}
          >
            <option value="">Choose an account</option>
            {accountOptions
              .filter((a) => a.id !== accountId)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {accountLabel(a)}
                </option>
              ))}
          </SelectField>
        )}
      </div>

      {type !== 'transfer' && (
        <SelectField
          label="Category"
          error={errors.categoryId?.message}
          {...register('categoryId')}
        >
          <option value="">Uncategorised</option>
          {recentOptions.length > 0 && (
            <optgroup label="Recently used">
              {recentOptions.map((o) => (
                <option key={`recent-${o.id}`} value={o.id}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="All categories">
            {categoryOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </optgroup>
        </SelectField>
      )}

      <div className={type === 'transfer' ? '' : 'grid gap-4 sm:grid-cols-2'}>
        <TextField label="Date" type="date" error={errors.date?.message} {...register('date')} />
        {type !== 'transfer' && (
          <>
            <TextField
              label="Payee"
              list="tx-payees"
              maxLength={PAYEE_MAX}
              autoComplete="off"
              error={errors.payee?.message}
              {...register('payee')}
            />
            <datalist id="tx-payees">
              {prefs.recentPayees.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </>
        )}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="tx-note" className="text-sm font-medium">
          Note
        </label>
        <textarea
          id="tx-note"
          rows={2}
          maxLength={NOTE_MAX}
          aria-invalid={errors.note ? true : undefined}
          className="flex w-full rounded-md border bg-background px-3 py-2 text-base shadow-xs outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm"
          {...register('note')}
        />
        {errors.note && <p className="text-xs text-destructive">{errors.note.message}</p>}
      </div>

      <Controller
        control={control}
        name="tags"
        render={({ field, fieldState }) => (
          <TagInput
            label="Tags"
            value={field.value}
            onChange={field.onChange}
            suggestions={prefs.knownTags}
            error={fieldState.error?.message}
          />
        )}
      />

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? 'Saving…'
            : initial && !props.duplicate
              ? 'Save changes'
              : `Add ${TRANSACTION_TYPE_LABELS[type].toLowerCase()}`}
        </Button>
      </div>
    </form>
  )
}

function safeConvert(amount: number, from: string, to: string, rate: string): number | null {
  try {
    return convertMinor(amount, from, to, rate)
  } catch {
    return null
  }
}
