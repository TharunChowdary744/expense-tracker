import { z } from 'zod'
import { evaluateAmount } from '@/utils/calc'
import { convertMinor } from '@/utils/money'

export interface ConfirmFormValues {
  amount: number
  baseAmount: number
}

const base = z.object({ amount: z.string().trim() })
export type ConfirmFormInput = z.input<typeof base>

/**
 * The Confirm dialog's amount: a number or a sum like the quick-add field. A foreign-currency
 * template keeps its exchange rate, so the base amount is recomputed from it.
 */
export function confirmFormSchema(ctx: {
  currency: string
  baseCurrency: string
  fxRateToBase: number
}) {
  return base.transform((v, zctx): ConfirmFormValues => {
    const fail = (message: string) => {
      zctx.addIssue({ code: 'custom', path: ['amount'], message })
      return z.NEVER
    }
    let amount: number
    try {
      amount = evaluateAmount(v.amount, ctx.currency)
    } catch (error) {
      return fail(v.amount === '' ? 'Enter an amount' : (error as Error).message)
    }
    if (amount <= 0) return fail('Enter an amount greater than zero')
    if (ctx.currency === ctx.baseCurrency) return { amount, baseAmount: amount }
    let baseAmount: number
    try {
      baseAmount = convertMinor(amount, ctx.currency, ctx.baseCurrency, String(ctx.fxRateToBase))
    } catch (error) {
      return fail((error as Error).message)
    }
    if (baseAmount <= 0) return fail('The converted amount rounds to zero')
    return { amount, baseAmount }
  })
}
