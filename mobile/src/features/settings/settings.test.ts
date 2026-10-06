import { deviceSettingsSchema, settingsUpdate } from './settingsPatch'

describe('settingsUpdate', () => {
  it('writes only the changed fields, as dotted paths', () => {
    expect(settingsUpdate({ theme: 'dark' })).toEqual({ 'settings.theme': 'dark' })
    expect(settingsUpdate({ weekStartsOn: 0 })).toEqual({ 'settings.weekStartsOn': 0 })
    expect(settingsUpdate({ notificationPrefs: { budgetAlerts: false } })).toEqual({
      'settings.notificationPrefs.budgetAlerts': false,
    })
  })
})

describe('deviceSettingsSchema', () => {
  it('fills defaults for missing or odd settings', () => {
    const parsed = deviceSettingsSchema.parse({ settings: { theme: 'neon' } })
    expect(parsed.settings.theme).toBe('system')
    expect(parsed.settings.weekStartsOn).toBe(1)
    expect(parsed.settings.notificationPrefs.budgetAlerts).toBe(true)
  })
})
