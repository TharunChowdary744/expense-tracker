import { z } from 'zod'

export const NOTIFICATION_TYPES = ['budget-threshold'] as const
export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

export const NOTIFICATION_TITLE_MAX = 120
export const NOTIFICATION_BODY_MAX = 300
export const NOTIFICATION_LINK_MAX = 200

/** users/{uid}/notifications/{id} as read from Firestore (Timestamps already ISO strings). */
export const notificationSchema = z.object({
  type: z.string(),
  title: z.string(),
  body: z.string().catch(''),
  /** An in-app path such as "/budgets/abc?at=2026-10-01". */
  link: z.string().catch(''),
  read: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.string(),
})

export type NotificationDoc = z.output<typeof notificationSchema>
