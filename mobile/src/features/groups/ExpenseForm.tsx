import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo, useState, type ReactNode } from 'react'
import { Controller, useForm, useWatch, type Control } from 'react-hook-form'
import { StyleSheet, View } from 'react-native'
import type { Account } from '@/features/accounts/types'
import type { Category } from '@/features/categories/types'
import { categoryPickerOptions } from '@/features/categories/utils'
import {
  DESCRIPTION_MAX,
  GROUP_CATEGORIES,
  groupExpenseFormSchema,
  paidProblem,
  previewSplit,
  splitProblem,
  type GroupExpenseFormInput,
  type GroupExpenseFormValues,
} from '@/features/groups/schemas'
import { SPLIT_TYPES, SPLIT_TYPE_LABELS, sumMap } from '@/features/groups/split'
import type { Group, GroupExpense } from '@/features/groups/types'
import { memberLabel } from '@/features/groups/utils'
import { formatMoney } from '@/utils/money'
import { FormDateField, FormSelectField, FormTextField } from '@m/components/form/Controlled'
import { FormMessage } from '@m/components/form/FormMessage'
import { Button } from '@m/components/ui/Button'
import { Checkbox, Segmented, SwitchRow } from '@m/components/ui/Controls'
import { TextField } from '@m/components/ui/Field'
import { Text } from '@m/components/ui/Text'
import { radius } from '@m/theme/colors'
import { useColors } from '@m/theme/ThemeProvider'
import { expenseDefaults } from './expenseDefaults'

interface Props {
  group: Group
  /** Members shown in the form, in group order (current members, plus any in `expense`). */
  memberIds: readonly string[]
  uid: string
  expense?: GroupExpense
  accounts: readonly Account[]
  categories: readonly Category[]
  baseCurrency: string
  locale: string
  /** The receipts section, shown above the buttons. */
  attachments?: ReactNode
  /** Resolves to an error message, or null on success. */
  onSubmit: (values: GroupExpenseFormValues) => Promise<string | null>
  onDelete?: () => void
  onCancel: () => void
}

type MapField = 'paid' | 'exact' | 'percent' | 'shares'

/** A small right-aligned number box for one member's row. */
function MemberInput({
  control,
  field,
  id,
  label,
  invalid,
  suffix,
}: {
  control: Control<GroupExpenseFormInput, unknown, GroupExpenseFormValues>
  field: MapField
  id: string
  label: string
  invalid: boolean
  suffix?: string
}) {
  return (
    <View style={styles.memberInput}>
      <Controller
        control={control}
        name={`${field}.${id}`}
        render={({ field: f }) => (
          <TextField
            accessibilityLabel={label}
            value={typeof f.value === 'string' ? f.value : ''}
            onChangeText={f.onChange}
            onBlur={f.onBlur}
            keyboardType="decimal-pad"
            placeholder="0"
            error={invalid ? ' ' : undefined}
            style={styles.numberBox}
          />
        )}
      />
      {suffix ? (
        <Text variant="small" tone="muted" style={styles.suffix}>
          {suffix}
        </Text>
      ) : null}
    </View>
  )
}

export function ExpenseForm({
  group,
  memberIds,
  uid,
  expense,
  accounts,
  categories,
  baseCurrency,
  locale,
  attachments,
  onSubmit,
  onDelete,
  onCancel,
}: Props) {
  const c = useColors()
  const [error, setError] = useState<string | null>(null)
  const currency = group.currency
  const accountCurrency = useMemo(() => {
    const map = new Map(accounts.map((a) => [a.id, a.currency]))
    return (id: string) => map.get(id)
  }, [accounts])
  const schema = useMemo(
    () =>
      groupExpenseFormSchema({
        currency,
        memberOrder: memberIds,
        uid,
        baseCurrency,
        accountCurrency,
      }),
    [currency, memberIds, uid, baseCurrency, accountCurrency],
  )
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting, isSubmitted },
  } = useForm<GroupExpenseFormInput, unknown, GroupExpenseFormValues>({
    resolver: zodResolver(schema),
    defaultValues: expenseDefaults(group, memberIds, uid, expense, accounts),
  })
  const values = useWatch({ control }) as GroupExpenseFormInput
  const preview = useMemo(
    () => previewSplit(values, { currency, memberOrder: memberIds }),
    [values, currency, memberIds],
  )
  const money = (minor: number) => formatMoney(minor, currency, locale)
  const name = (id: string) => memberLabel(group, id, uid)
  const activeAccounts = accounts.filter((a) => !a.archived)
  const personalCategories = useMemo(
    () => [
      { value: '', label: 'None' },
      ...categoryPickerOptions(categories, 'expense').map((o) => ({ value: o.id, label: o.label })),
    ],
    [categories],
  )

  const paidText =
    preview.amount === null || values.paidMode === 'single'
      ? null
      : (paidProblem(preview.paid, currency, locale) ?? `Adds up to ${money(preview.amount)}`)
  const splitText =
    preview.amount === null
      ? null
      : (splitProblem(preview.split, values.splitType, currency, locale) ??
        `Adds up to ${money(preview.amount)}`)
  const paidError = (errors.paid as { message?: string } | undefined)?.message
  const splitOk = preview.split?.ok === true
  const shares = preview.split?.ok ? preview.split.shares : {}
  const myShare = shares[uid] ?? 0
  const splitField: MapField | null =
    values.splitType === 'exact'
      ? 'exact'
      : values.splitType === 'percent'
        ? 'percent'
        : values.splitType === 'shares'
          ? 'shares'
          : null

  const submit = handleSubmit(async (v) => {
    setError(null)
    const message = await onSubmit(v)
    if (message) setError(message)
  })

  const box = [styles.box, { borderColor: c.border }]

  return (
    <View style={styles.form}>
      {error ? <FormMessage kind="error">{error}</FormMessage> : null}
      <FormTextField
        control={control}
        name="description"
        label="Description"
        maxLength={DESCRIPTION_MAX}
        autoComplete="off"
        placeholder="e.g. Dinner at Thalassa"
      />
      <FormTextField
        control={control}
        name="amount"
        label={`Amount (${currency})`}
        keyboardType="decimal-pad"
        placeholder="1000"
        error={isSubmitted || values.amount ? (preview.amountError ?? undefined) : undefined}
      />
      <FormDateField control={control} name="date" label="Date" />
      <FormSelectField
        control={control}
        name="categoryId"
        label="Category"
        options={[
          { value: '', label: 'None' },
          ...GROUP_CATEGORIES.map((g) => ({ value: g.id, label: g.label })),
        ]}
      />

      <View style={box}>
        <Text weight="600">Paid by</Text>
        <Controller
          control={control}
          name="paidMode"
          render={({ field }) => (
            <Segmented
              label="Paid by"
              value={field.value}
              onChange={field.onChange}
              options={[
                { value: 'single', label: 'One person' },
                { value: 'multiple', label: 'Several people' },
              ]}
            />
          )}
        />
        {values.paidMode === 'single' ? (
          <FormSelectField
            control={control}
            name="payer"
            label="Who paid"
            options={memberIds.map((id) => ({ value: id, label: name(id) }))}
          />
        ) : (
          <View style={styles.rows}>
            {memberIds.map((id) => (
              <View key={id} style={styles.memberRow}>
                <Text numberOfLines={1} style={styles.flex}>
                  {name(id)}
                </Text>
                <MemberInput
                  control={control}
                  field="paid"
                  id={id}
                  label={`${name(id)} paid`}
                  invalid={preview.paidInvalid === id}
                />
              </View>
            ))}
            {paidText ? (
              <Text
                variant="small"
                tone={preview.paid?.ok ? 'muted' : 'destructive'}
                accessibilityLiveRegion="polite"
              >
                {paidText}
              </Text>
            ) : null}
            {isSubmitted && paidError && !paidText ? (
              <Text variant="small" tone="destructive">
                {paidError}
              </Text>
            ) : null}
          </View>
        )}
      </View>

      <View style={box}>
        <Text weight="600">Split</Text>
        <Controller
          control={control}
          name="splitType"
          render={({ field }) => (
            <Segmented
              label="Split type"
              value={field.value}
              onChange={field.onChange}
              options={SPLIT_TYPES.map((t) => ({ value: t, label: SPLIT_TYPE_LABELS[t] }))}
            />
          )}
        />
        <View accessibilityLabel="Shares" style={styles.rows}>
          {memberIds.map((id) => (
            <View key={id} style={styles.memberRow}>
              {values.splitType === 'equal' ? (
                <View style={styles.flex}>
                  <Controller
                    control={control}
                    name={`included.${id}`}
                    render={({ field }) => (
                      <Checkbox
                        label={name(id)}
                        checked={field.value === true}
                        onChange={field.onChange}
                      />
                    )}
                  />
                </View>
              ) : (
                <Text numberOfLines={1} style={styles.flex}>
                  {name(id)}
                </Text>
              )}
              {splitField ? (
                <MemberInput
                  control={control}
                  field={splitField}
                  id={id}
                  label={`${name(id)}, ${SPLIT_TYPE_LABELS[values.splitType].toLowerCase()}`}
                  invalid={preview.splitInvalid === id}
                  suffix={
                    splitField === 'percent' ? '%' : splitField === 'shares' ? '×' : undefined
                  }
                />
              ) : null}
              <Text
                variant="small"
                tone="muted"
                tabular
                align="right"
                style={styles.share}
                accessibilityLabel={`${name(id)}'s share: ${splitOk ? money(shares[id] ?? 0) : 'not yet known'}`}
              >
                {splitOk ? money(shares[id] ?? 0) : '–'}
              </Text>
            </View>
          ))}
        </View>
        {splitText ? (
          <Text
            variant="small"
            tone={splitOk ? 'muted' : 'destructive'}
            accessibilityLiveRegion="polite"
          >
            {splitText}
            {splitOk && preview.amount !== null && sumMap(shares) === preview.amount ? ' ✓' : ''}
          </Text>
        ) : null}
      </View>

      <FormTextField control={control} name="note" label="Note" autoComplete="off" multiline />

      {!expense ? (
        <View style={box}>
          <Controller
            control={control}
            name="addToPersonal"
            render={({ field }) => (
              <SwitchRow
                label="Also add my share to my personal transactions"
                description={
                  myShare > 0
                    ? `Records an expense of ${money(myShare)} in one of your accounts, linked to this group expense.`
                    : 'Records your share as a personal expense, linked to this group expense.'
                }
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
          {errors.addToPersonal?.message ? (
            <Text variant="small" tone="destructive">
              {errors.addToPersonal.message}
            </Text>
          ) : null}
          {values.addToPersonal ? (
            <>
              <FormSelectField
                control={control}
                name="personalAccountId"
                label="Account"
                placeholder="Choose an account"
                options={activeAccounts.map((a) => ({
                  value: a.id,
                  label: `${a.name} (${a.currency})`,
                }))}
              />
              <FormSelectField
                control={control}
                name="personalCategoryId"
                label="Personal category"
                options={personalCategories}
              />
              {currency !== baseCurrency ? (
                <FormTextField
                  control={control}
                  name="fxRate"
                  label={`1 ${currency} in ${baseCurrency}`}
                  keyboardType="decimal-pad"
                  placeholder="83.25"
                  hint="Exchange rate for your personal records."
                />
              ) : null}
            </>
          ) : null}
        </View>
      ) : null}

      {attachments}

      {isSubmitted && errors.splitType?.message ? (
        <Text variant="small" tone="destructive" accessibilityRole="alert">
          {errors.splitType.message}
        </Text>
      ) : null}
      <View style={styles.actions}>
        {onDelete ? (
          <Button title="Delete" variant="ghost" onPress={onDelete} style={styles.deleteButton} />
        ) : (
          <View />
        )}
        <View style={styles.actionGroup}>
          <Button title="Cancel" variant="ghost" onPress={onCancel} />
          <Button
            title={isSubmitting ? 'Saving…' : expense ? 'Save changes' : 'Add expense'}
            loading={isSubmitting}
            onPress={() => void submit()}
          />
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  form: { gap: 16 },
  box: { borderWidth: 1, borderRadius: radius.md, padding: 12, gap: 12 },
  rows: { gap: 8 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1, minWidth: 0 },
  memberInput: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  numberBox: { width: 84, textAlign: 'right', minHeight: 40, paddingVertical: 6 },
  suffix: { width: 12 },
  share: { width: 84 },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
  },
  actionGroup: { flexDirection: 'row', gap: 8 },
  deleteButton: { marginLeft: -8 },
})
