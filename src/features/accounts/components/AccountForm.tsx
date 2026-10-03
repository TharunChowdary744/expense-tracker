import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { FormMessage } from '@/components/form/FormMessage'
import { SelectField } from '@/components/form/SelectField'
import { TextField } from '@/components/form/TextField'
import { ColorPicker } from '@/components/pickers/ColorPicker'
import { IconPicker } from '@/components/pickers/IconPicker'
import { Button } from '@/components/ui/button'
import { currencyOptions } from '@/utils/currency'
import { fromMinor } from '@/utils/money'
import {
  ACCOUNT_NAME_MAX,
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABELS,
  accountFormSchema,
  type AccountFormInput,
  type AccountFormValues,
} from '../schemas'
import type { Account } from '../types'

interface Props {
  /** The account being edited; omit to create one. */
  account?: Account
  defaultCurrency: string
  locale?: string
  /** Resolves to an error message, or null on success. */
  onSubmit: (values: AccountFormValues) => Promise<string | null>
  onCancel: () => void
}

export function AccountForm({ account, defaultCurrency, locale, onSubmit, onCancel }: Props) {
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
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

  async function submit(values: AccountFormValues) {
    setError(null)
    const message = await onSubmit(values)
    if (message) setError(message)
  }

  return (
    <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
      {error && <FormMessage kind="error">{error}</FormMessage>}
      <TextField
        label="Name"
        maxLength={ACCOUNT_NAME_MAX}
        autoComplete="off"
        error={errors.name?.message}
        {...register('name')}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Type" error={errors.type?.message} {...register('type')}>
          {ACCOUNT_TYPES.map((type) => (
            <option key={type} value={type}>
              {ACCOUNT_TYPE_LABELS[type]}
            </option>
          ))}
        </SelectField>
        <SelectField label="Currency" error={errors.currency?.message} {...register('currency')}>
          {currencyOptions(locale, account?.currency).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </SelectField>
      </div>
      <TextField
        label="Opening balance"
        inputMode="decimal"
        autoComplete="off"
        placeholder="0"
        hint={`In ${currency}. Use a minus sign for money you owe, such as a card balance.`}
        error={errors.openingBalance?.message}
        {...register('openingBalance')}
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
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : account ? 'Save changes' : 'Create account'}
        </Button>
      </div>
    </form>
  )
}
