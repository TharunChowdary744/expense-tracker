import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import type { PlannedReminder } from './reminders'

const CHANNEL = 'reminders'
let configured = false

/** Shows notifications while the app is open too, and sets up the Android channel. */
export function configureNotifications() {
  if (configured) return
  configured = true
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  })
  if (Platform.OS === 'android') {
    void Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Reminders and alerts',
      importance: Notifications.AndroidImportance.DEFAULT,
    }).catch(() => undefined)
  }
}

export async function notificationsAllowed(): Promise<boolean> {
  try {
    return (await Notifications.getPermissionsAsync()).granted
  } catch {
    return false
  }
}

/** Asks for permission (once the person turns a notification setting on). */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync()
    if (current.granted) return true
    if (!current.canAskAgain) return false
    return (await Notifications.requestPermissionsAsync()).granted
  } catch {
    return false
  }
}

/** Replaces every scheduled bill reminder with `plan`. */
export async function syncBillReminders(plan: readonly PlannedReminder[]): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync()
  const wanted = new Map(plan.map((p) => [p.id, p]))
  for (const request of scheduled) {
    if (!request.identifier.startsWith('bill:')) continue
    const keep = wanted.get(request.identifier)
    const at = (request.trigger as { value?: number; date?: number } | null)?.value
    if (keep && at === keep.date.getTime()) {
      wanted.delete(request.identifier)
    } else {
      await Notifications.cancelScheduledNotificationAsync(request.identifier)
    }
  }
  for (const reminder of wanted.values()) {
    await Notifications.scheduleNotificationAsync({
      identifier: reminder.id,
      content: { title: reminder.title, body: reminder.body, data: { url: reminder.url } },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: reminder.date,
        channelId: CHANNEL,
      },
    })
  }
}

export async function cancelBillReminders(): Promise<void> {
  await syncBillReminders([])
}

/** Shows a notification now (used for alerts that arrive while the app is in the background). */
export async function presentNow(title: string, body: string, url: string): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data: { url } },
    trigger: Platform.OS === 'android' ? { channelId: CHANNEL } : null,
  })
}
