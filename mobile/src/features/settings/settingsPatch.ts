import { z } from 'zod'

/** The settings this app edits, read leniently so older docs still parse. */
export const deviceSettingsSchema = z.object({
  settings: z
    .object({
      theme: z.enum(['system', 'light', 'dark']).catch('system'),
      weekStartsOn: z.union([z.literal(0), z.literal(1)]).catch(1),
      notificationPrefs: z
        .object({
          budgetAlerts: z.boolean().catch(true),
          recurringReminders: z.boolean().catch(true),
          groupActivity: z.boolean().catch(true),
          push: z.boolean().catch(false),
        })
        .catch({ budgetAlerts: true, recurringReminders: true, groupActivity: true, push: false }),
    })
    .catch({
      theme: 'system',
      weekStartsOn: 1,
      notificationPrefs: {
        budgetAlerts: true,
        recurringReminders: true,
        groupActivity: true,
        push: false,
      },
    }),
})

export type DeviceSettings = z.output<typeof deviceSettingsSchema>['settings']
export type NotificationPrefs = DeviceSettings['notificationPrefs']

/** A change to users/{uid}.settings: only the given fields are written. */
export interface SettingsPatch {
  theme?: DeviceSettings['theme']
  weekStartsOn?: 0 | 1
  notificationPrefs?: Partial<NotificationPrefs>
}

export function settingsUpdate(patch: SettingsPatch): Record<string, unknown> {
  const update: Record<string, unknown> = {}
  if (patch.theme) update['settings.theme'] = patch.theme
  if (patch.weekStartsOn !== undefined) update['settings.weekStartsOn'] = patch.weekStartsOn
  for (const [key, value] of Object.entries(patch.notificationPrefs ?? {})) {
    if (typeof value === 'boolean') update[`settings.notificationPrefs.${key}`] = value
  }
  return update
}
