import { z } from 'zod'

/** Most files on one transaction or group expense. */
export const MAX_ATTACHMENTS = 5
/** Largest file accepted, before and after compression (the Storage rules enforce it too). */
export const MAX_FILE_BYTES = 10 * 1024 * 1024
/** Photos are resized to fit this box... */
export const MAX_IMAGE_DIMENSION = 1600
/** ...and compressed towards this size. */
export const TARGET_IMAGE_BYTES = 300 * 1024
export const NAME_MAX = 200

/** One entry of a doc's `attachments`: where the file is in Storage and what it is. */
export const attachmentSchema = z.object({
  path: z.string().min(1),
  name: z.string(),
  contentType: z.string(),
  size: z.number().int().nonnegative(),
})

export type Attachment = z.output<typeof attachmentSchema>

/**
 * A doc's `attachments` list as read from Firestore. Malformed entries are dropped rather than
 * failing the whole document.
 */
export const attachmentsField = z
  .array(z.unknown())
  .catch([])
  .transform((list) =>
    list.flatMap((item) => {
      const parsed = attachmentSchema.safeParse(item)
      return parsed.success ? [parsed.data] : []
    }),
  )
