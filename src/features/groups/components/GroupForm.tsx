import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { FormMessage } from '@/components/form/FormMessage'
import { SelectField } from '@/components/form/SelectField'
import { TextField } from '@/components/form/TextField'
import { Button } from '@/components/ui/button'
import { currencyOptions } from '@/utils/currency'
import { cn } from '@/utils/cn'
import {
  DEFAULT_GROUP_EMOJI,
  GROUP_EMOJIS,
  GROUP_NAME_MAX,
  groupFormSchema,
  type GroupFormValues,
} from '../schemas'
import type { Group } from '../types'

interface Props {
  group?: Group
  baseCurrency: string
  locale: string
  /** Resolves to an error message, or null on success. */
  onSubmit: (values: GroupFormValues) => Promise<string | null>
  onCancel: () => void
}

export function GroupForm({ group, baseCurrency, locale, onSubmit, onCancel }: Props) {
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<GroupFormValues>({
    resolver: zodResolver(groupFormSchema),
    defaultValues: {
      name: group?.name ?? '',
      currency: group?.currency ?? baseCurrency,
      emoji: group?.emoji ?? DEFAULT_GROUP_EMOJI,
    },
  })

  async function submit(values: GroupFormValues) {
    setError(null)
    const message = await onSubmit(values)
    if (message) setError(message)
  }

  return (
    <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
      {error && <FormMessage kind="error">{error}</FormMessage>}
      <TextField
        label="Name"
        maxLength={GROUP_NAME_MAX}
        autoComplete="off"
        placeholder="e.g. Goa trip"
        error={errors.name?.message}
        {...register('name')}
      />
      <SelectField
        label="Currency"
        disabled={Boolean(group)}
        hint={group ? "A group's currency can't change after it is created." : undefined}
        error={errors.currency?.message}
        {...register('currency')}
      >
        {currencyOptions(locale, group?.currency).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </SelectField>
      <Controller
        control={control}
        name="emoji"
        render={({ field }) => (
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Cover emoji</legend>
            <div role="radiogroup" aria-label="Cover emoji" className="flex flex-wrap gap-1.5">
              {GROUP_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  role="radio"
                  aria-checked={field.value === emoji}
                  aria-label={emoji}
                  onClick={() => field.onChange(emoji)}
                  className={cn(
                    'flex size-10 items-center justify-center rounded-md border text-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                    field.value === emoji ? 'border-primary bg-primary/10' : 'hover:bg-accent',
                  )}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </fieldset>
        )}
      />
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : group ? 'Save changes' : 'Create group'}
        </Button>
      </div>
    </form>
  )
}
