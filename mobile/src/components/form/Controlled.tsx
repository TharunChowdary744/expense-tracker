import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form'
import { DateField } from '../ui/Controls'
import { TextField, type TextFieldProps } from '../ui/Field'
import { SelectField, type SelectOption } from '../ui/Select'

/** react-hook-form wrappers: the field reads and writes the form value by `name`. */
export function FormTextField<T extends FieldValues, TOut extends FieldValues = T>({
  control,
  name,
  ...rest
}: { control: Control<T, unknown, TOut>; name: FieldPath<T> } & Omit<TextFieldProps, 'value' | 'onChangeText'>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <TextField
          {...rest}
          value={field.value == null ? '' : String(field.value)}
          onChangeText={field.onChange}
          onBlur={field.onBlur}
          error={fieldState.error?.message ?? rest.error}
        />
      )}
    />
  )
}

export function FormSelectField<T extends FieldValues, TOut extends FieldValues = T>({
  control,
  name,
  options,
  ...rest
}: {
  control: Control<T, unknown, TOut>
  name: FieldPath<T>
  options: SelectOption[]
  label?: string
  placeholder?: string
  hint?: string
  searchable?: boolean
  title?: string
  disabled?: boolean
  empty?: string
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <SelectField
          {...rest}
          options={options}
          value={field.value as string}
          onChange={field.onChange}
          error={fieldState.error?.message}
        />
      )}
    />
  )
}

export function FormDateField<T extends FieldValues, TOut extends FieldValues = T>({
  control,
  name,
  ...rest
}: {
  control: Control<T, unknown, TOut>
  name: FieldPath<T>
  label?: string
  hint?: string
  minimumDate?: string
  maximumDate?: string
  clearable?: boolean
  placeholder?: string
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <DateField
          {...rest}
          value={(field.value as string) ?? ''}
          onChange={field.onChange}
          error={fieldState.error?.message}
        />
      )}
    />
  )
}
