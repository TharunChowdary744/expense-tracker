import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { FormMessage } from '@/components/form/FormMessage'
import { SelectField } from '@/components/form/SelectField'
import { TextField } from '@/components/form/TextField'
import { ColorPicker } from '@/components/pickers/ColorPicker'
import { IconPicker } from '@/components/pickers/IconPicker'
import { Button } from '@/components/ui/button'
import { CATEGORY_NAME_MAX, categoryFormSchema, type CategoryFormValues } from '../schemas'
import type { Category } from '../types'

interface Props {
  /** The category being edited; omit to create one. */
  category?: Category
  /** Allowed parents (active, top-level, same kind). */
  parents: readonly Category[]
  /** A category that has subcategories cannot become a subcategory itself. */
  hasChildren?: boolean
  defaultParentId?: string
  /** Resolves to an error message, or null on success. */
  onSubmit: (values: CategoryFormValues) => Promise<string | null>
  onCancel: () => void
}

export function CategoryForm({
  category,
  parents,
  hasChildren = false,
  defaultParentId = '',
  onSubmit,
  onCancel,
}: Props) {
  const [error, setError] = useState<string | null>(null)
  const parent = parents.find((p) => p.id === (category?.parentId ?? defaultParentId))
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: {
      name: category?.name ?? '',
      parentId: category?.parentId ?? defaultParentId,
      icon: category?.icon ?? parent?.icon ?? 'tag',
      color: category?.color ?? parent?.color ?? '#0d9488',
    },
  })
  const color = useWatch({ control, name: 'color' })

  async function submit(values: CategoryFormValues) {
    setError(null)
    const message = await onSubmit(values)
    if (message) setError(message)
  }

  return (
    <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
      {error && <FormMessage kind="error">{error}</FormMessage>}
      <TextField
        label="Name"
        maxLength={CATEGORY_NAME_MAX}
        autoComplete="off"
        error={errors.name?.message}
        {...register('name')}
      />
      {hasChildren ? (
        <p className="text-sm text-muted-foreground">
          This category has subcategories, so it stays top-level.
        </p>
      ) : (
        <SelectField
          label="Parent category"
          hint="Optional. Subcategories go one level deep."
          error={errors.parentId?.message}
          {...register('parentId')}
        >
          <option value="">None (top-level)</option>
          {parents.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </SelectField>
      )}
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
          {isSubmitting ? 'Saving…' : category ? 'Save changes' : 'Create category'}
        </Button>
      </div>
    </form>
  )
}
