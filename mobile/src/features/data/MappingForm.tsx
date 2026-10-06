import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, useWatch } from 'react-hook-form'
import { StyleSheet, View } from 'react-native'
import {
  DATE_FORMATS,
  IMPORT_FIELDS,
  IMPORT_FIELD_LABELS,
  parseDateCell,
} from '@/features/data/csvImport'
import {
  mappingFormSchema,
  type MappingFormInput,
  type MappingFormValues,
} from '@/features/data/schemas'
import { FormSelectField } from '@m/components/form/Controlled'
import { FormMessage } from '@m/components/form/FormMessage'
import { Button } from '@m/components/ui/Button'
import { Text } from '@m/components/ui/Text'

const REQUIRED = new Set(['date'])

/** Step 2: which column holds which field, the date format and the target account. */
export function MappingForm({
  header,
  sample,
  accounts,
  defaultValues,
  onSubmit,
  onBack,
  busy,
}: {
  header: readonly string[]
  /** A few data rows, to show what each column holds. */
  sample: readonly (readonly string[])[]
  accounts: readonly { id: string; name: string; currency: string }[]
  defaultValues: MappingFormInput
  onSubmit: (values: MappingFormValues) => void
  onBack: () => void
  busy?: boolean
}) {
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<MappingFormInput, unknown, MappingFormValues>({
    resolver: zodResolver(mappingFormSchema),
    defaultValues,
  })
  const columns = useWatch({ control, name: 'columns' })
  const dateFormat = useWatch({ control, name: 'dateFormat' })
  const dateColumn = columns.date === '' ? null : Number(columns.date)
  const dateSample = dateColumn === null ? '' : (sample[0]?.[dateColumn] ?? '')
  const dateReads = dateSample ? parseDateCell(dateSample, dateFormat) : null
  const showSign = columns.amount !== '' && columns.type === ''
  const columnLabel = (i: number) => {
    const example = sample[0]?.[i]
    return `${header[i] || `Column ${i + 1}`}${example ? ` (e.g. ${example.slice(0, 24)})` : ''}`
  }
  const columnOptions = [
    { value: '', label: 'Not in this file' },
    ...header.map((_, i) => ({ value: String(i), label: columnLabel(i) })),
  ]

  return (
    <View style={styles.form}>
      {errors.columns?.message ? (
        <FormMessage kind="error">{errors.columns.message}</FormMessage>
      ) : null}
      <Text weight="600" accessibilityRole="header">
        Columns
      </Text>
      {IMPORT_FIELDS.map((field) => (
        <FormSelectField
          key={field}
          control={control}
          name={`columns.${field}`}
          label={`${IMPORT_FIELD_LABELS[field]}${REQUIRED.has(field) ? ' (required)' : ''}`}
          options={columnOptions}
        />
      ))}
      <FormSelectField
        control={control}
        name="dateFormat"
        label="Date format"
        hint={
          dateSample
            ? dateReads
              ? `"${dateSample}" reads as ${dateReads}`
              : `"${dateSample}" doesn't match this format`
            : undefined
        }
        options={DATE_FORMATS.map((f) => ({ value: f, label: f }))}
      />
      <FormSelectField
        control={control}
        name="accountId"
        label="Import into account"
        placeholder="Choose an account"
        hint="Used for rows without a matching Account column."
        options={accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.currency})` }))}
      />
      {showSign ? (
        <FormSelectField
          control={control}
          name="positiveIs"
          label="Positive amounts are"
          hint="Without a Type column, the sign decides; negative amounts are the opposite."
          options={[
            { value: 'expense', label: 'Spending (money out)' },
            { value: 'income', label: 'Income (money in)' },
          ]}
        />
      ) : null}
      <View style={styles.actions}>
        <Button title="Back" variant="outline" onPress={onBack} />
        <Button
          title={busy ? 'Checking…' : 'Preview'}
          loading={busy}
          onPress={() => void handleSubmit(onSubmit)()}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  form: { gap: 14 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingTop: 8 },
})
