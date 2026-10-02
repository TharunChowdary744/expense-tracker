import { z } from 'zod'
import { CURRENCY_CODE } from '@/utils/currency'

/** users/{uid} as read from Firestore. Lenient on optional extras so older docs still parse. */
export const userDocSchema = z.object({
  displayName: z.string().default(''),
  email: z.string().default(''),
  settings: z.object({
    baseCurrency: z.string().regex(CURRENCY_CODE),
    locale: z.string().min(1),
    theme: z.enum(['system', 'light', 'dark']).default('system'),
    dateFormat: z.string().default('dd MMM yyyy'),
    weekStartsOn: z.union([z.literal(0), z.literal(1)]).default(1),
  }),
})

export type UserDoc = z.output<typeof userDocSchema>
