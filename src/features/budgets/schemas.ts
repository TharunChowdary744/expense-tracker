import { z } from 'zod'
import { toMinor } from '@/utils/money'

export const BUDGET_PERIODS = ['monthly', 'weekly'] as const
export type BudgetPeriodKind = (typeof BUDGET_PERIODS)[number]

export const BUDGET_PERIOD_LABELS: Record<BudgetPeriodKind, string> = {
  monthly: 'Monthly',
  weekly: 'Weekly',
}

export const BUDGET_NAME_MAX = 40
export const BUDGET_CATEGORIES_MAX = 50
export const THRESHOLDS_MAX = 5
export const THRESHOLD_MIN = 1
export const THRESHOLD_MAX = 1000
export const DEFAULT_THRESHOLDS = [80, 100] as const

/** Sorted, unique, whole percentages. */
export function normalizeThresholds(values: readonly number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b)
}

/** users/{uid}/budgets/{id} as read from Firestore (Timestamps already ISO strings). */
export const budgetSchema = z.object({
  name: z.string(),
  period: z.enum(BUDGET_PERIODS),
  /** Expense categories counted; empty means every expense (an overall budget). */
  categoryIds: z.array(z.string()).catch([]),
  /** Limit per period in base-currency minor units. */
  amount: z.number().int().positive().refine(Number.isSafeInteger),
  rollover: z.boolean().default(false),
  alertThresholds: z
    .array(z.number().int().min(THRESHOLD_MIN).max(THRESHOLD_MAX))
    .transform(normalizeThresholds)
    .catch([...DEFAULT_THRESHOLDS]),
  startDate: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.string(),
})

export type BudgetDoc = z.output<typeof budgetSchema>

export const budgetFormBase = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Enter a name')
    .max(BUDGET_NAME_MAX, `Use at most ${BUDGET_NAME_MAX} characters`),
  period: z.enum(BUDGET_PERIODS, 'Choose a period'),
  scope: z.enum(['overall', 'categories']),
  categoryIds: z.array(z.string()),
  amount: z.string().trim(),
  rollover: z.boolean(),
  /** Comma-separated percentages, e.g. "80, 100". */
  thresholds: z.string().trim(),
})

export type BudgetFormInput = z.input<typeof budgetFormBase>

export interface BudgetFormValues {
  name: string
  period: BudgetPeriodKind
  categoryIds: string[]
  amount: number
  rollover: boolean
  alertThresholds: number[]
}

/** Parses "80, 100" into [80, 100], or returns an error message. */
export function parseThresholds(text: string): number[] | string {
  if (text.trim() === '') return 'Enter at least one percentage, e.g. 80, 100'
  const parts = text
    .split(/[,\s]+/)
    .map((p) => p.replace(/%$/, ''))
    .filter(Boolean)
  const values: number[] = []
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return `"${part}" is not a whole percentage`
    const value = Number(part)
    if (value < THRESHOLD_MIN || value > THRESHOLD_MAX) {
      return `Use percentages from ${THRESHOLD_MIN} to ${THRESHOLD_MAX}`
    }
    values.push(value)
  }
  const unique = normalizeThresholds(values)
  if (unique.length > THRESHOLDS_MAX) return `Use at most ${THRESHOLDS_MAX} alerts`
  return unique
}

/** The create/edit form; the amount is typed in major units of the base currency. */
export function budgetFormSchema(baseCurrency: string) {
  return budgetFormBase.transform((v, ctx): BudgetFormValues => {
    // Collect every problem so the form shows them all at once.
    let ok = true
    const fail = (path: string, message: string) => {
      ctx.addIssue({ code: 'custom', path: [path], message })
      ok = false
    }

    let amount = 0
    if (v.amount === '') fail('amount', 'Enter the limit')
    else {
      try {
        amount = toMinor(v.amount, baseCurrency)
        if (amount <= 0) fail('amount', 'Enter a limit greater than zero')
      } catch {
        fail('amount', 'Enter a valid amount, like 5000 or 5000.50')
      }
    }

    const categoryIds = v.scope === 'overall' ? [] : [...new Set(v.categoryIds)]
    if (v.scope === 'categories' && categoryIds.length === 0) {
      fail('categoryIds', 'Choose at least one category')
    } else if (categoryIds.length > BUDGET_CATEGORIES_MAX) {
      fail('categoryIds', `Choose at most ${BUDGET_CATEGORIES_MAX} categories`)
    }

    const thresholds = parseThresholds(v.thresholds)
    if (typeof thresholds === 'string') fail('thresholds', thresholds)

    if (!ok || typeof thresholds === 'string') return z.NEVER
    return {
      name: v.name,
      period: v.period,
      categoryIds,
      amount,
      rollover: v.rollover,
      alertThresholds: thresholds,
    }
  })
}
