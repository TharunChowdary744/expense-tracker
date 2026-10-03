import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, useWatch } from 'react-hook-form'
import { FormMessage } from '@/components/form/FormMessage'
import { SelectField } from '@/components/form/SelectField'
import { Button } from '@/components/ui/button'
import { DATE_FORMATS, IMPORT_FIELDS, IMPORT_FIELD_LABELS, parseDateCell } from '../csvImport'
import { mappingFormSchema, type MappingFormInput, type MappingFormValues } from '../schemas'

interface Props {
  header: readonly string[]
  /** A few data rows, to show what each column holds. */
  sample: readonly (readonly string[])[]
  accounts: readonly { id: string; name: string; currency: string }[]
  defaultValues: MappingFormInput
  onSubmit: (values: MappingFormValues) => void
  onBack: () => void
}

const REQUIRED = new Set(['date'])

/** Step 2: which column holds which field, the date format and the target account. */
export function MappingForm({ header, sample, accounts, defaultValues, onSubmit, onBack }: Props) {
  const {
    register,
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

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      {errors.columns?.message && <FormMessage kind="error">{errors.columns.message}</FormMessage>}

      <fieldset className="space-y-3">
        <legend className="mb-2 text-sm font-semibold">Columns</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {IMPORT_FIELDS.map((field) => (
            <SelectField
              key={field}
              label={`${IMPORT_FIELD_LABELS[field]}${REQUIRED.has(field) ? ' (required)' : ''}`}
              {...register(`columns.${field}`)}
            >
              <option value="">Not in this file</option>
              {header.map((_, i) => (
                <option key={i} value={String(i)}>
                  {columnLabel(i)}
                </option>
              ))}
            </SelectField>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          label="Date format"
          hint={
            dateSample
              ? dateReads
                ? `"${dateSample}" reads as ${dateReads}`
                : `"${dateSample}" doesn't match this format`
              : undefined
          }
          {...register('dateFormat')}
        >
          {DATE_FORMATS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Import into account"
          hint="Used for rows without a matching Account column."
          error={errors.accountId?.message}
          {...register('accountId')}
        >
          <option value="">Choose an account</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.currency})
            </option>
          ))}
        </SelectField>
        {showSign && (
          <SelectField
            label="Positive amounts are"
            hint="Without a Type column, the sign decides; negative amounts are the opposite."
            {...register('positiveIs')}
          >
            <option value="expense">Spending (money out)</option>
            <option value="income">Income (money in)</option>
          </SelectField>
        )}
      </div>

      <div className="flex justify-between gap-2">
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button type="submit">Preview</Button>
      </div>
    </form>
  )
}
