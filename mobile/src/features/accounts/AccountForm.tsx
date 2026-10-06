import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { View } from 'react-native'
import {
  ACCOUNT_NAME_MAX,
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABELS,
  accountFormSchema,
  type AccountFormInput,
  type AccountFormValues,
} from '@/features/accounts/schemas'
import type { Account } from '@/features/accounts/types'
import { currencyOptions } from '@/utils/currency'
import { fromMinor } from '@/utils/money'
import { FormSelectField, FormTextField } from '@m/components/form/Controlled'
import { FormMessage } from '@m/components/form/FormMessage'
import { ColorPicker } from '@m/components/pickers/ColorPicker'
import { IconPicker } from '@m/components/pickers/IconPicker'
import { Button } from '@m/components/ui/Button'

export function AccountForm({
  account,
  defaultCurrency,
  locale,
  onSubmit,
  onCancel,
}: {
  account?: Account
  defaultCurrency: string
  locale?: string
  /** Resolves to an error message, or null on success. */
  onSubmit: (values: AccountFormValues) => Promise<string | null>
  onCancel: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<AccountFormInput, unknown, AccountFormValues>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: account
      ? {
          name: account.name,
          type: account.type,
          currency: account.currency,
          openingBalance: fromMinor(account.openingBalance, account.currency),
          color: account.color,
          icon: account.icon,
        }
      : {
          name: '',
          type: 'bank',
          currency: defaultCurrency,
          openingBalance: '',
          color: '#2563eb',
          icon: 'landmark',
        },
  })
  const currency = useWatch({ control, name: 'currency' })
  const color = useWatch({ control, name: 'color' })

  const submit = handleSubmit(async (values) => {
    setError(null)
    const message = await onSubmit(values)
    if (message) setError(message)
  })

  return (
    <View style={{ gap: 16 }}>
      {error ? <FormMessage kind="error">{error}</FormMessage> : null}
      <FormTextField
        control={control}
        name="name"
        label="Name"
        maxLength={ACCOUNT_NAME_MAX}
        autoComplete="off"
      />
      <FormSelectField
        control={control}
        name="type"
        label="Type"
        options={ACCOUNT_TYPES.map((t) => ({ value: t, label: ACCOUNT_TYPE_LABELS[t] }))}
      />
      <FormSelectField
        control={control}
        name="currency"
        label="Currency"
        searchable
        options={currencyOptions(locale, account?.currency)}
      />
      <FormTextField
        control={control}
        name="openingBalance"
        label="Opening balance"
        keyboardType="numbers-and-punctuation"
        placeholder="0"
        hint={`In ${currency}. Use a minus sign for money you owe, such as a card balance.`}
      />
      <Controller
        control={control}
        name="color"
        render={({ field, fieldState }) => (
          <ColorPicker
            label="Colour"
            value={field.value}
            onChange={field.onChange}
            error={fieldState.error?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="icon"
        render={({ field, fieldState }) => (
          <IconPicker
            label="Icon"
            value={field.value}
            onChange={field.onChange}
            color={color}
            error={fieldState.error?.message}
          />
        )}
      />
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
        <Button title="Cancel" variant="ghost" onPress={onCancel} />
        <Button
          title={isSubmitting ? 'Saving…' : account ? 'Save changes' : 'Create account'}
          loading={isSubmitting}
          onPress={() => void submit()}
        />
      </View>
    </View>
  )
}
