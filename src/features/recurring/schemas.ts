import { z } from 'zod'
import { TRANSACTION_TYPES } from '@/features/transactions/schemas'
import { CURRENCY_CODE } from '@/utils/currency'
import { FREQUENCIES, INTERVAL_MAX, LAST_DAY, MAX_OCCURRENCES_LIMIT } from './engine'
import { RECURRING_MODES } from './recurrence'

/** Most skipped keys kept on a rule (older ones are pruned as the rule advances). */
export const SKIPPED_KEYS_MAX = 200

const positiveMinor = z
  .number()
  .int()
  .positive()
  .refine(Number.isSafeInteger, 'Amount is too large')

/** The transaction each occurrence posts. */
export const recurringTemplateSchema = z.object({
  type: z.enum(TRANSACTION_TYPES),
  amount: positiveMinor,
  currency: z.string().regex(CURRENCY_CODE),
  fxRateToBase: z.number().positive(),
  baseAmount: positiveMinor,
  accountId: z.string().min(1),
  toAccountId: z.string().min(1).optional(),
  categoryId: z.string().min(1).optional(),
  tags: z.array(z.string()).catch([]),
  payee: z.string().catch(''),
  note: z.string().catch(''),
})

export type RecurringTemplate = z.output<typeof recurringTemplateSchema>

/**
 * users/{uid}/recurring/{id} as read from Firestore (Timestamps already ISO strings).
 *
 * Dates are stored as Timestamps at local midnight in the rule's `timeZone` and read back as
 * calendar dates in that zone, so the schedule doesn't move when the device travels.
 * `nextRunAt` is when the first occurrence that is neither posted nor skipped becomes due;
 * null once the schedule has ended.
 */
export const recurringSchema = z.object({
  template: recurringTemplateSchema,
  frequency: z.enum(FREQUENCIES),
  interval: z.number().int().min(1).max(INTERVAL_MAX),
  byWeekday: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
  byMonthDay: z
    .number()
    .int()
    .refine((d) => d === LAST_DAY || (d >= 1 && d <= 31))
    .optional(),
  startDate: z.string(),
  endDate: z.string().optional(),
  maxOccurrences: z.number().int().min(1).max(MAX_OCCURRENCES_LIMIT).optional(),
  timeZone: z.string().min(1),
  nextRunAt: z.string().nullable(),
  lastRunAt: z.string().nullable().catch(null),
  mode: z.enum(RECURRING_MODES),
  paused: z.boolean(),
  skippedKeys: z.array(z.string()).catch([]),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.string(),
})

export type RecurringDoc = z.output<typeof recurringSchema>
