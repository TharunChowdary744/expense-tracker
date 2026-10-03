import { z } from 'zod'
import {
  DATE_FORMATS,
  IMPORT_FIELDS,
  mappingProblem,
  type ColumnMapping,
  type DateFormat,
  type ImportField,
} from './csvImport'

/** Each field holds a column index as text, or '' when the file has no such column. */
const columnsShape = Object.fromEntries(IMPORT_FIELDS.map((f) => [f, z.string()])) as Record<
  ImportField,
  z.ZodString
>

/** The import wizard's "Map columns" step. */
export const mappingFormSchema = z
  .object({
    columns: z.object(columnsShape),
    dateFormat: z.enum(DATE_FORMATS),
    positiveIs: z.enum(['expense', 'income']),
    accountId: z.string().min(1, 'Choose the account to import into'),
  })
  .transform((values, ctx) => {
    const mapping: ColumnMapping = {}
    for (const field of IMPORT_FIELDS) {
      const value = values.columns[field]
      if (value !== '') mapping[field] = Number(value)
    }
    const problem = mappingProblem(mapping)
    if (problem) {
      ctx.addIssue({ code: 'custom', path: ['columns'], message: problem })
      return z.NEVER
    }
    return {
      mapping,
      dateFormat: values.dateFormat as DateFormat,
      positiveIs: values.positiveIs,
      accountId: values.accountId,
    }
  })

export type MappingFormInput = z.input<typeof mappingFormSchema>
export type MappingFormValues = z.output<typeof mappingFormSchema>

export function mappingDefaults(
  mapping: ColumnMapping,
  dateFormat: DateFormat,
  accountId: string,
): MappingFormInput {
  return {
    columns: Object.fromEntries(
      IMPORT_FIELDS.map((f) => [f, mapping[f] === undefined ? '' : String(mapping[f])]),
    ) as Record<ImportField, string>,
    dateFormat,
    positiveIs: 'expense',
    accountId,
  }
}
