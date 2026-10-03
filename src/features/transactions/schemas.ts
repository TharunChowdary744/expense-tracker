import { z } from 'zod'
import {
  parseRecurrence,
  recurrenceFormSchema,
  type RecurrenceValues,
} from '@/features/recurring/recurrence'
import { CURRENCY_CODE } from '@/utils/currency'
import { evaluateAmount } from '@/utils/calc'
import { convertMinor, isValidRate } from '@/utils/money'

export const TRANSACTION_TYPES = ['expense', 'income', 'transfer'] as const
export type TransactionType = (typeof TRANSACTION_TYPES)[number]

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  expense: 'Expense',
  income: 'Income',
  transfer: 'Transfer',
}

export const PAYEE_MAX = 80
export const NOTE_MAX = 500
export const TAG_MAX = 30
export const TAGS_MAX = 10

const positiveMinor = z
  .number()
  .int()
  .positive()
  .refine(Number.isSafeInteger, 'Amount is too large')

/** users/{uid}/transactions/{id} as read from Firestore (Timestamps already ISO strings). */
export const transactionSchema = z.object({
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
  date: z.string(),
  attachments: z.array(z.unknown()).catch([]),
  recurringId: z.string().optional(),
  occurrenceKey: z.string().optional(),
  groupExpenseRef: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.string(),
})

export type TransactionDoc = z.output<typeof transactionSchema>

/** "Groceries " → "groceries"; tags are compared and stored lower-case. */
export function normalizeTag(tag: string): string {
  return tag.trim().replace(/\s+/g, '-').toLowerCase().slice(0, TAG_MAX)
}

/**
 * The quick-add / edit form. `amount` is what the user typed (a number or a calculator
 * expression) and `fxRate` a decimal string; both become integer minor units on submit.
 * `baseCurrency` and the account currencies come from context, so the form schema is built
 * per render with `transactionFormSchema(ctx)`.
 */
export interface TransactionFormContext {
  baseCurrency: string
  /** Currency of each account the user can pick, by id. */
  accountCurrency: (accountId: string) => string | undefined
}

export const transactionFormBase = z.object({
  type: z.enum(TRANSACTION_TYPES),
  amount: z.string().trim(),
  currency: z.string().regex(CURRENCY_CODE, 'Choose a currency'),
  fxRate: z.string().trim(),
  accountId: z.string().min(1, 'Choose an account'),
  toAccountId: z.string(),
  categoryId: z.string(),
  /** yyyy-MM-dd in the user's timezone. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date'),
  payee: z.string().trim().max(PAYEE_MAX, `Use at most ${PAYEE_MAX} characters`),
  note: z.string().trim().max(NOTE_MAX, `Use at most ${NOTE_MAX} characters`),
  tags: z.array(z.string()).max(TAGS_MAX, `Use at most ${TAGS_MAX} tags`),
  /** The "Make recurring" section; when enabled the date is the schedule's start. */
  recurrence: recurrenceFormSchema.optional(),
})

export type TransactionFormInput = z.input<typeof transactionFormBase>

export interface TransactionFormValues {
  type: TransactionType
  amount: number
  currency: string
  fxRateToBase: number
  /** The exact rate text the user confirmed, remembered for the next entry. */
  fxRateText: string | null
  baseAmount: number
  accountId: string
  toAccountId?: string
  categoryId?: string
  date: string
  payee: string
  note: string
  tags: string[]
  /** Set when the form creates or edits a recurring rule instead of a single transaction. */
  recurrence?: RecurrenceValues
}

/** Why a transaction currency can't be used with an account, or null when it can. */
export function currencyProblem(
  txCurrency: string,
  accountCurrency: string | undefined,
  baseCurrency: string,
): string | null {
  if (!accountCurrency || accountCurrency === txCurrency || accountCurrency === baseCurrency) {
    return null
  }
  return `This account holds ${accountCurrency}. Use ${accountCurrency} or your base currency (${baseCurrency}).`
}

export function transactionFormSchema(ctx: TransactionFormContext) {
  return transactionFormBase.transform((v, zctx): TransactionFormValues => {
    const fail = (path: string, message: string) => {
      zctx.addIssue({ code: 'custom', path: [path], message })
      return z.NEVER
    }

    let amount: number
    try {
      amount = evaluateAmount(v.amount, v.currency)
    } catch (error) {
      return fail('amount', v.amount === '' ? 'Enter an amount' : (error as Error).message)
    }
    if (amount <= 0) return fail('amount', 'Enter an amount greater than zero')

    const fromProblem = currencyProblem(
      v.currency,
      ctx.accountCurrency(v.accountId),
      ctx.baseCurrency,
    )
    if (fromProblem) return fail('currency', fromProblem)

    if (v.type === 'transfer') {
      if (!v.toAccountId) return fail('toAccountId', 'Choose the account the money goes to')
      if (v.toAccountId === v.accountId) return fail('toAccountId', 'Choose a different account')
      const toProblem = currencyProblem(
        v.currency,
        ctx.accountCurrency(v.toAccountId),
        ctx.baseCurrency,
      )
      if (toProblem) return fail('currency', toProblem.replace('This account', 'The other account'))
    }

    let fxRateToBase = 1
    let fxRateText: string | null = null
    let baseAmount = amount
    if (v.currency !== ctx.baseCurrency) {
      if (!isValidRate(v.fxRate)) {
        return fail('fxRate', `Enter how many ${ctx.baseCurrency} one ${v.currency} is worth`)
      }
      fxRateText = v.fxRate.trim()
      fxRateToBase = Number(fxRateText)
      try {
        baseAmount = convertMinor(amount, v.currency, ctx.baseCurrency, fxRateText)
      } catch (error) {
        return fail('fxRate', (error as Error).message)
      }
      if (baseAmount <= 0) return fail('fxRate', 'The converted amount rounds to zero')
    }

    let recurrence: RecurrenceValues | undefined
    if (v.recurrence?.enabled) {
      const parsed = parseRecurrence(v.recurrence, v.date)
      if (!parsed.ok) {
        zctx.addIssue({ code: 'custom', path: parsed.path.split('.'), message: parsed.message })
        return z.NEVER
      }
      recurrence = parsed.value
    }

    return {
      type: v.type,
      amount,
      currency: v.currency,
      fxRateToBase,
      fxRateText,
      baseAmount,
      accountId: v.accountId,
      ...(v.type === 'transfer' ? { toAccountId: v.toAccountId } : {}),
      ...(v.type !== 'transfer' && v.categoryId ? { categoryId: v.categoryId } : {}),
      date: v.date,
      payee: v.type === 'transfer' ? '' : v.payee,
      note: v.note,
      tags: [...new Set(v.tags.map(normalizeTag).filter(Boolean))],
      ...(recurrence ? { recurrence } : {}),
    }
  })
}
