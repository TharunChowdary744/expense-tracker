import { z } from 'zod'
import { HEX_COLOR } from '@/components/icons'
import { CURRENCY_CODE } from '@/utils/currency'
import { toMinor } from '@/utils/money'

export const ACCOUNT_TYPES = ['cash', 'bank', 'card', 'wallet', 'other'] as const
export type AccountType = (typeof ACCOUNT_TYPES)[number]

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  cash: 'Cash',
  bank: 'Bank account',
  card: 'Credit card',
  wallet: 'Wallet',
  other: 'Other',
}

export const ACCOUNT_NAME_MAX = 40

/** users/{uid}/accounts/{id} as read from Firestore (Timestamps already ISO strings). */
export const accountSchema = z.object({
  name: z.string(),
  type: z.enum(ACCOUNT_TYPES),
  currency: z.string().regex(CURRENCY_CODE),
  openingBalance: z.number().int().refine(Number.isSafeInteger),
  /** Cached sum of transaction effects in this account's currency (0 before any). */
  txTotal: z.number().int().refine(Number.isSafeInteger).default(0),
  color: z.string().regex(HEX_COLOR).catch('#64748b'),
  icon: z.string().catch('wallet'),
  archived: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.string(),
})

export type AccountDoc = z.output<typeof accountSchema>

/**
 * The create/edit form. The opening balance is typed as text in major units and converted to
 * integer minor units of the chosen currency on submit.
 */
export const accountFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Enter a name')
      .max(ACCOUNT_NAME_MAX, `Use at most ${ACCOUNT_NAME_MAX} characters`),
    type: z.enum(ACCOUNT_TYPES, 'Choose a type'),
    currency: z.string().regex(CURRENCY_CODE, 'Choose a currency'),
    openingBalance: z.string().trim(),
    color: z.string().regex(HEX_COLOR, 'Choose a colour'),
    icon: z.string().min(1, 'Choose an icon'),
  })
  .transform((values, ctx) => {
    let openingBalance = 0
    if (values.openingBalance !== '') {
      try {
        openingBalance = toMinor(values.openingBalance, values.currency)
      } catch {
        ctx.addIssue({
          code: 'custom',
          path: ['openingBalance'],
          message: 'Enter an amount like 1500 or -250.75',
        })
        return z.NEVER
      }
    }
    return { ...values, openingBalance }
  })

export type AccountFormInput = z.input<typeof accountFormSchema>
export type AccountFormValues = z.output<typeof accountFormSchema>
