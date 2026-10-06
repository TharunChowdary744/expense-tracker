import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo, useState, type ReactNode } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { ScrollView, StyleSheet, TextInput, View } from 'react-native'
import type { Account } from '@/features/accounts/types'
import { accountBalance } from '@/features/accounts/utils'
import type { Category } from '@/features/categories/types'
import { categoryPickerOptions } from '@/features/categories/utils'
import { defaultRecurrenceInput, recurrenceInputFrom } from '@/features/recurring/recurrence'
import type { RecurringRule } from '@/features/recurring/types'
import { ruleSchedule } from '@/features/recurring/utils'
import { fxPair, type QuickAddPrefs } from '@/features/transactions/prefs'
import {
  NOTE_MAX,
  PAYEE_MAX,
  TRANSACTION_TYPES,
  TRANSACTION_TYPE_LABELS,
  transactionFormSchema,
  type TransactionFormInput,
  type TransactionFormValues,
  type TransactionType,
} from '@/features/transactions/schemas'
import type { Transaction } from '@/features/transactions/types'
import { applyKey, dayKey, todayInput } from '@/features/transactions/utils'
import { evaluateAmount, isExpression } from '@/utils/calc'
import { currencyOptions } from '@/utils/currency'
import { convertMinor, formatMoney, fromMinor, isValidRate } from '@/utils/money'
import { FormDateField, FormSelectField, FormTextField } from '@m/components/form/Controlled'
import { FormMessage } from '@m/components/form/FormMessage'
import { Button } from '@m/components/ui/Button'
import { Chip, Segmented, SwitchRow } from '@m/components/ui/Controls'
import { FieldShell } from '@m/components/ui/Field'
import { SelectField, type SelectOption } from '@m/components/ui/Select'
import { Text } from '@m/components/ui/Text'
import { useColors } from '@m/theme/ThemeProvider'
import { radius } from '@m/theme/colors'
import { RecurrenceFields } from '../recurring/RecurrenceFields'
import { AmountKeypad } from './AmountKeypad'
import { TagInput } from './TagInput'

export interface TransactionFormProps {
  accounts: readonly Account[]
  categories: readonly Category[]
  baseCurrency: string
  locale?: string
  prefs: QuickAddPrefs
  initial?: Transaction
  duplicate?: boolean
  recurring?: 'toggle' | 'rule'
  startRecurring?: boolean
  rule?: RecurringRule
  dateHint?: string
  attachments?: ReactNode
  onSubmit: (values: TransactionFormValues) => Promise<string | null>
  onCancel: () => void
}

function defaultValues(p: TransactionFormProps): TransactionFormInput {
  const { initial, accounts, prefs, baseCurrency, rule } = p
  if (rule) {
    const t = rule.template
    const schedule = ruleSchedule(rule)
    return {
      type: t.type,
      amount: fromMinor(t.amount, t.currency),
      currency: t.currency,
      fxRate: t.currency === baseCurrency ? '' : String(t.fxRateToBase),
      accountId: t.accountId,
      toAccountId: t.toAccountId ?? '',
      categoryId: t.categoryId ?? '',
      date: schedule.startDate,
      payee: t.payee,
      note: t.note,
      tags: t.tags,
      recurrence: recurrenceInputFrom(schedule, rule.mode),
    }
  }
  const recurrence = defaultRecurrenceInput(Boolean(p.startRecurring))
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
      recurrence,
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
    recurrence,
  }
}

function safeConvert(amount: number, from: string, to: string, rate: string): number | null {
  try {
    return convertMinor(amount, from, to, rate)
  } catch {
    return null
  }
}

/** The quick-add / edit / duplicate / recurring-rule form (same rules as the web app). */
export function TransactionForm(props: TransactionFormProps) {
  const { accounts, categories, baseCurrency, locale, prefs, initial, onSubmit, onCancel } = props
  const { recurring, rule } = props
  const c = useColors()
  const editingTx = initial !== undefined && !props.duplicate
  const [error, setError] = useState<string | null>(null)

  const currencyById = useMemo(() => new Map(accounts.map((a) => [a.id, a.currency])), [accounts])
  const schema = useMemo(
    () => transactionFormSchema({ baseCurrency, accountCurrency: (id) => currencyById.get(id) }),
    [baseCurrency, currencyById],
  )

  const {
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
  const payee = useWatch({ control, name: 'payee' })
  const repeats = useWatch({ control, name: 'recurrence.enabled' }) === true

  const keep = rule?.template ?? initial
  const accountOptions = accounts.filter(
    (a) => !a.archived || a.id === keep?.accountId || a.id === keep?.toAccountId,
  )
  const categoryKind = type === 'income' ? 'income' : 'expense'
  const categoryOptions = useMemo(() => {
    const options = categoryPickerOptions(categories, categoryKind)
    const current = categories.find((cat) => cat.id === keep?.categoryId)
    if (current && current.kind === categoryKind && !options.some((o) => o.id === current.id)) {
      options.push({ id: current.id, label: `${current.name} (archived)`, depth: 0 })
    }
    return options
  }, [categories, categoryKind, keep?.categoryId])
  const recentOptions = prefs.recentCategoryIds
    .map((id) => categoryOptions.find((o) => o.id === id))
    .filter((o): o is NonNullable<typeof o> => o !== undefined)

  const categorySelect: SelectOption[] = [
    { value: '', label: 'Uncategorised' },
    ...(recentOptions.length > 0
      ? [
          { value: 'h-recent', label: 'Recently used', heading: true },
          ...recentOptions.map((o) => ({ value: o.id, label: o.label })),
          { value: 'h-all', label: 'All categories', heading: true },
        ]
      : []),
    ...categoryOptions.map((o) => ({ value: o.id, label: o.label })),
  ]

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
    const category = categories.find((cat) => cat.id === getValues('categoryId'))
    if (next === 'transfer' || (category && category.kind !== next)) setValue('categoryId', '')
  }

  function changeCurrency(next: string) {
    setValue('currency', next, { shouldValidate: Boolean(errors.currency) })
    if (next !== baseCurrency) setValue('fxRate', prefs.fxRates[fxPair(next, baseCurrency)] ?? '')
  }

  const submit = handleSubmit(async (values) => {
    setError(null)
    const message = await onSubmit(values)
    if (message) setError(message)
  })

  const accountLabel = (a: Account) =>
    `${a.name} · ${formatMoney(accountBalance(a), a.currency, locale)}${a.archived ? ' (archived)' : ''}`
  const accountSelect = accountOptions.map((a) => ({ value: a.id, label: accountLabel(a) }))
  const payeeSuggestions = payee
    ? prefs.recentPayees
        .filter((p) => p.toLowerCase().includes(payee.toLowerCase()) && p !== payee)
        .slice(0, 8)
    : []

  return (
    <View style={{ gap: 16 }}>
      {error ? <FormMessage kind="error">{error}</FormMessage> : null}

      <Segmented
        label="Transaction type"
        value={type}
        onChange={changeType}
        options={TRANSACTION_TYPES.map((t) => ({ value: t, label: TRANSACTION_TYPE_LABELS[t] }))}
      />

      <FieldShell
        label="Amount"
        error={errors.amount?.message ?? errors.currency?.message}
        hint={
          preview !== null && isExpression(amountText)
            ? `= ${formatMoney(preview, currency, locale)}`
            : 'You can type a sum like 120+45.'
        }
      >
        <View style={styles.amountRow}>
          <Controller
            control={control}
            name="amount"
            render={({ field }) => (
              <TextInput
                value={field.value}
                onChangeText={field.onChange}
                showSoftInputOnFocus={false}
                placeholder="0"
                placeholderTextColor={c.mutedForeground}
                accessibilityLabel="Amount"
                accessibilityHint="Use the keypad below"
                style={[
                  styles.amount,
                  {
                    color: c.foreground,
                    borderColor: errors.amount ? c.destructive : c.input,
                    backgroundColor: c.card,
                  },
                ]}
              />
            )}
          />
          <View style={{ width: 104 }}>
            <SelectField
              value={currency}
              title="Currency"
              searchable
              options={currencyOptions(locale, currency).map((o) => ({
                value: o.value,
                label: o.label,
              }))}
              onChange={changeCurrency}
            />
          </View>
        </View>
      </FieldShell>

      <AmountKeypad
        onKey={(key) =>
          setValue('amount', applyKey(getValues('amount'), key), {
            shouldValidate: Boolean(errors.amount),
          })
        }
      />

      {currency !== baseCurrency ? (
        <View style={[styles.fx, { borderColor: c.border, backgroundColor: c.muted }]}>
          <FormTextField
            control={control}
            name="fxRate"
            label={`Exchange rate: 1 ${currency} in ${baseCurrency}`}
            keyboardType="decimal-pad"
            placeholder="e.g. 83.25"
            hint={
              basePreview !== null
                ? `Recorded as ${formatMoney(basePreview, baseCurrency, locale)} in your base currency.`
                : 'Prefilled with the last rate you used for this pair.'
            }
          />
        </View>
      ) : null}

      <Controller
        control={control}
        name="accountId"
        render={({ field, fieldState }) => (
          <SelectField
            label={type === 'transfer' ? 'From account' : 'Account'}
            value={field.value}
            options={accountSelect}
            empty="No accounts yet. Add one under Accounts."
            error={fieldState.error?.message}
            onChange={(id) => {
              field.onChange(id)
              const next = currencyById.get(id)
              if (next) changeCurrency(next)
            }}
          />
        )}
      />
      {type === 'transfer' ? (
        <FormSelectField
          control={control}
          name="toAccountId"
          label="To account"
          placeholder="Choose an account"
          options={accountSelect.filter((a) => a.value !== accountId)}
        />
      ) : (
        <FormSelectField
          control={control}
          name="categoryId"
          label="Category"
          options={categorySelect}
          searchable
        />
      )}

      <FormDateField
        control={control}
        name="date"
        label={repeats ? 'Starts' : 'Date'}
        hint={recurring === 'rule' ? props.dateHint : undefined}
      />

      {type !== 'transfer' ? (
        <View style={{ gap: 6 }}>
          <FormTextField
            control={control}
            name="payee"
            label="Payee"
            maxLength={PAYEE_MAX}
            autoComplete="off"
          />
          {payeeSuggestions.length > 0 ? (
            <ScrollView
              horizontal
              keyboardShouldPersistTaps="handled"
              showsHorizontalScrollIndicator={false}
            >
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {payeeSuggestions.map((p) => (
                  <Chip key={p} label={p} onPress={() => setValue('payee', p)} />
                ))}
              </View>
            </ScrollView>
          ) : null}
        </View>
      ) : null}

      <FormTextField control={control} name="note" label="Note" multiline maxLength={NOTE_MAX} />

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

      {recurring === 'toggle' && !editingTx ? (
        <Controller
          control={control}
          name="recurrence.enabled"
          render={({ field }) => (
            <View style={[styles.fx, { borderColor: c.border }]}>
              <SwitchRow
                label="Make recurring"
                description="Repeat this on a schedule, starting on the date above."
                value={field.value === true}
                onChange={field.onChange}
              />
            </View>
          )}
        />
      ) : null}
      {repeats ? <RecurrenceFields control={control} locale={locale} /> : null}

      {!repeats && recurring !== 'rule' ? props.attachments : null}

      <View style={styles.actions}>
        <Button title="Cancel" variant="ghost" onPress={onCancel} />
        <Button
          loading={isSubmitting}
          onPress={() => void submit()}
          title={
            isSubmitting
              ? 'Saving…'
              : recurring === 'rule' || editingTx
                ? 'Save changes'
                : repeats
                  ? `Create recurring ${TRANSACTION_TYPE_LABELS[type].toLowerCase()}`
                  : `Add ${TRANSACTION_TYPE_LABELS[type].toLowerCase()}`
          }
        />
      </View>
      {Object.keys(errors).length > 0 ? (
        <Text variant="small" tone="destructive" accessibilityLiveRegion="polite">
          Check the highlighted fields.
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  amountRow: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  amount: {
    flex: 1,
    height: 56,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    fontSize: 28,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  fx: { borderWidth: 1, borderRadius: radius.lg, padding: 12 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' },
})
