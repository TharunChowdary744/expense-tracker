import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { View } from 'react-native'
import {
  CATEGORY_NAME_MAX,
  categoryFormSchema,
  type CategoryFormValues,
} from '@/features/categories/schemas'
import type { Category } from '@/features/categories/types'
import { FormSelectField, FormTextField } from '@m/components/form/Controlled'
import { FormMessage } from '@m/components/form/FormMessage'
import { ColorPicker } from '@m/components/pickers/ColorPicker'
import { IconPicker } from '@m/components/pickers/IconPicker'
import { Button } from '@m/components/ui/Button'
import { Text } from '@m/components/ui/Text'

export function CategoryForm({
  category,
  parents,
  hasChildren = false,
  defaultParentId = '',
  onSubmit,
  onCancel,
}: {
  category?: Category
  /** Allowed parents (active, top-level, same kind). */
  parents: readonly Category[]
  hasChildren?: boolean
  defaultParentId?: string
  onSubmit: (values: CategoryFormValues) => Promise<string | null>
  onCancel: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const parent = parents.find((p) => p.id === (category?.parentId ?? defaultParentId))
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
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
        maxLength={CATEGORY_NAME_MAX}
        autoComplete="off"
      />
      {hasChildren ? (
        <Text variant="small" tone="muted">
          This category has subcategories, so it stays top-level.
        </Text>
      ) : (
        <FormSelectField
          control={control}
          name="parentId"
          label="Parent category"
          hint="Optional. Subcategories go one level deep."
          options={[
            { value: '', label: 'None (top-level)' },
            ...parents.map((p) => ({ value: p.id, label: p.name })),
          ]}
        />
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
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
        <Button title="Cancel" variant="ghost" onPress={onCancel} />
        <Button
          title={isSubmitting ? 'Saving…' : category ? 'Save changes' : 'Create category'}
          loading={isSubmitting}
          onPress={() => void submit()}
        />
      </View>
    </View>
  )
}
