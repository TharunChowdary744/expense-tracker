import { useEffect, useState } from 'react'
import { Linking, StyleSheet, View } from 'react-native'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { useUid } from '@/features/auth/hooks'
import { useUserSettings } from '@/features/settings/hooks'
import { useToast } from '@/features/ui/hooks'
import { Screen } from '@m/components/Screen'
import { Button } from '@m/components/ui/Button'
import { Card, CardHeader } from '@m/components/ui/Card'
import { Segmented, SwitchRow } from '@m/components/ui/Controls'
import { ListSkeleton } from '@m/components/ui/ListStates'
import { Text } from '@m/components/ui/Text'
import { notificationsAllowed, requestNotificationPermission } from '../notifications/device'
import { preferencesChanged, type ThemePreference } from '../preferences/slice'
import {
  useDeviceSettings,
  useUpdateSettingsMutation,
  type NotificationPrefs,
  type SettingsPatch,
} from './api'

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

const PREF_LABELS: {
  key: keyof Omit<NotificationPrefs, 'push'>
  label: string
  description: string
}[] = [
  {
    key: 'budgetAlerts',
    label: 'Budget alerts',
    description: 'When a budget reaches one of its alert thresholds.',
  },
  {
    key: 'recurringReminders',
    label: 'Recurring bill reminders',
    description: 'Bills set to "Remind me to confirm" when they are due.',
  },
  {
    key: 'groupActivity',
    label: 'Group activity',
    description: 'Settle-up reminders from people in your groups.',
  },
]

export function SettingsScreen() {
  const uid = useUid()
  const toast = useToast()
  const dispatch = useAppDispatch()
  const prefs = useAppSelector((s) => s.preferences)
  const settings = useDeviceSettings()
  const { baseCurrency, locale } = useUserSettings()
  const [update] = useUpdateSettingsMutation()
  const [allowed, setAllowed] = useState<boolean | null>(null)

  useEffect(() => {
    let live = true
    void notificationsAllowed().then((ok) => live && setAllowed(ok))
    return () => {
      live = false
    }
  }, [])

  async function save(patch: SettingsPatch) {
    const result = await update({ uid, patch })
    if ('error' in result) {
      toast({
        title: 'Could not save the setting',
        description: String(result.error),
        variant: 'error',
      })
    }
  }

  function setTheme(theme: ThemePreference) {
    dispatch(preferencesChanged({ theme }))
    void save({ theme })
  }

  async function allow() {
    const ok = await requestNotificationPermission()
    setAllowed(ok)
    if (!ok) {
      toast({
        title: 'Notifications are off for Ledgerly',
        description: 'Turn them on in your device settings.',
        variant: 'error',
      })
    }
  }

  return (
    <Screen>
      <Card>
        <CardHeader title="Appearance" />
        <Segmented label="Theme" value={prefs.theme} options={THEMES} onChange={setTheme} />
        <Text variant="caption" tone="muted">
          System follows your device’s light or dark mode.
        </Text>
      </Card>

      <Card>
        <CardHeader title="Region" />
        <View style={styles.row}>
          <Text style={styles.flex}>Base currency</Text>
          <Text weight="600">{baseCurrency}</Text>
        </View>
        <Text variant="caption" tone="muted">
          Totals, budgets and reports are in your base currency. It is chosen when you sign up.
        </Text>
        <View style={styles.row}>
          <Text style={styles.flex}>Language and number format</Text>
          <Text weight="600">{locale}</Text>
        </View>
        {settings ? (
          <>
            <Text>Week starts on</Text>
            <Segmented
              label="Week starts on"
              value={String(settings.weekStartsOn) as '0' | '1'}
              options={[
                { value: '1', label: 'Monday' },
                { value: '0', label: 'Sunday' },
              ]}
              onChange={(v) => void save({ weekStartsOn: v === '0' ? 0 : 1 })}
            />
          </>
        ) : (
          <ListSkeleton rows={1} label="Loading settings" />
        )}
      </Card>

      <Card>
        <CardHeader title="Notifications" />
        <Text variant="small" tone="muted">
          What Ledgerly tells you about, in the app’s inbox and on this device.
        </Text>
        {settings ? (
          PREF_LABELS.map((p) => (
            <SwitchRow
              key={p.key}
              label={p.label}
              description={p.description}
              value={settings.notificationPrefs[p.key]}
              onChange={(on) => void save({ notificationPrefs: { [p.key]: on } })}
            />
          ))
        ) : (
          <ListSkeleton rows={2} label="Loading notification settings" />
        )}
      </Card>

      <Card>
        <CardHeader title="On this device" />
        {allowed === false ? (
          <View style={styles.stack}>
            <Text variant="small" tone="muted">
              Ledgerly can’t show notifications on this device yet.
            </Text>
            <View style={styles.buttons}>
              <Button title="Allow notifications" size="sm" onPress={() => void allow()} />
              <Button
                title="Device settings"
                variant="outline"
                size="sm"
                onPress={() => void Linking.openSettings()}
              />
            </View>
          </View>
        ) : null}
        <SwitchRow
          label="Bill reminders"
          description="A reminder at 9:00 on the day a bill is due."
          value={prefs.billReminders}
          disabled={allowed === false}
          onChange={(on) => dispatch(preferencesChanged({ billReminders: on }))}
        />
        <SwitchRow
          label="Alerts on this device"
          description="Show budget alerts and settle-up reminders as notifications when the app is in the background."
          value={prefs.deviceAlerts}
          disabled={allowed === false}
          onChange={(on) => dispatch(preferencesChanged({ deviceAlerts: on }))}
        />
      </Card>
    </Screen>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 },
  stack: { gap: 8 },
  buttons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
})
