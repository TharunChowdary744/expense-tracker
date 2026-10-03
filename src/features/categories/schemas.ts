import { z } from 'zod'
import { HEX_COLOR } from '@/components/icons'

export const CATEGORY_KINDS = ['expense', 'income'] as const
export type CategoryKind = (typeof CATEGORY_KINDS)[number]

export const CATEGORY_NAME_MAX = 40

/** users/{uid}/categories/{id} as read from Firestore (Timestamps already ISO strings). */
export const categorySchema = z.object({
  name: z.string(),
  kind: z.enum(CATEGORY_KINDS),
  icon: z.string().catch('tag'),
  color: z.string().regex(HEX_COLOR).catch('#64748b'),
  /** Set on subcategories only (one level deep). */
  parentId: z
    .string()
    .nullish()
    .transform((v) => v ?? null),
  order: z.number().int().default(0),
  archived: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.string(),
})

export type CategoryDoc = z.output<typeof categorySchema>

export const categoryFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Enter a name')
    .max(CATEGORY_NAME_MAX, `Use at most ${CATEGORY_NAME_MAX} characters`),
  /** '' means a top-level category. */
  parentId: z.string(),
  icon: z.string().min(1, 'Choose an icon'),
  color: z.string().regex(HEX_COLOR, 'Choose a colour'),
})

export type CategoryFormValues = z.output<typeof categoryFormSchema>
