import { skipToken } from '@reduxjs/toolkit/query/react'
import * as Notifications from 'expo-notifications'
import { router } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { AppState } from 'react-native'
import { useAppSelector } from '@/app/hooks'
import { useAuth } from '@/features/auth/hooks'
import { useGetCategoriesQuery } from '@/features/categories/api'
import { useGetUnreadNotificationsQuery } from '@/features/notifications/api'
import { useGetRecurringQuery } from '@/features/recurring/api'
import { ruleLabel } from '@/features/recurring/components/ruleLabel'
import { usePendingOccurrences } from '@/features/recurring/hooks/usePendingOccurrences'
import type { PendingOccurrence, RecurringRule } from '@/features/recurring/types'
import { useUserSettings } from '@/features/settings/hooks'
import { useDeviceSettings } from '@m/features/settings/api'
import { mobilePath } from '@m/features/shell/links'
import {
  cancelBillReminders,
  configureNotifications,
  notificationsAllowed,
  presentNow,
  syncBillReminders,
} from './device'
import { planBillReminders } from './reminders'

const isRemind = (rule: RecurringRule) => rule.mode === 'remind'

/**
 * Device notifications (mounted in the signed-in layout). There is no server to send push
 * messages, so everything is local to this device:
 * - remind-mode bills get a reminder at 9:00 on their due day, rescheduled whenever the rules
 *   change (off with the "Bill reminders" setting or the account's recurring reminders pref);
 * - budget alerts and settle-up reminders that arrive while the app is in the background are
 *   shown as notifications ("Alerts on this device" setting).
 * Tapping a notification opens the screen it is about.
 */
export function useDeviceNotifications() {
  const { user } = useAuth()
  const uid = user?.uid
  const { locale } = useUserSettings()
  const settings = useDeviceSettings()
  const prefs = useAppSelector((s) => s.preferences)
  const { data: rules } = useGetRecurringQuery(uid ?? skipToken)
  const { data: categories } = useGetCategoriesQuery(uid ?? skipToken)
  const { items } = usePendingOccurrences(rules, 30, isRemind)

  useEffect(() => {
    configureNotifications()
    const open = (response: Notifications.NotificationResponse | null) => {
      const url = response?.notification.request.content.data?.url
      if (typeof url === 'string' && url.startsWith('/')) router.push(url as never)
    }
    void Notifications.getLastNotificationResponseAsync()
      .then(open)
      .catch(() => undefined)
    const sub = Notifications.addNotificationResponseReceivedListener(open)
    return () => sub.remove()
  }, [])

  const byId = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories])
  const titleOf = useCallback((item: PendingOccurrence) => ruleLabel(item.rule, byId).title, [byId])
  const billsOn = prefs.billReminders && (settings?.notificationPrefs.recurringReminders ?? true)
  const plan = useMemo(
    () => (billsOn && rules ? planBillReminders(items, titleOf, locale) : []),
    [billsOn, rules, items, titleOf, locale],
  )

  useEffect(() => {
    if (!prefs.loaded || !uid) return
    let cancelled = false
    void (async () => {
      if (!(await notificationsAllowed()) || cancelled) return
      if (billsOn) await syncBillReminders(plan)
      else await cancelBillReminders()
    })().catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [prefs.loaded, uid, billsOn, plan])

  // Signed out: reminders for this account stop.
  useEffect(() => {
    if (uid) return
    void cancelBillReminders().catch(() => undefined)
  }, [uid])

  useBackgroundAlerts(uid, prefs.deviceAlerts, settings?.notificationPrefs.budgetAlerts ?? true)
}

function useBackgroundAlerts(uid: string | undefined, enabled: boolean, budgetAlerts: boolean) {
  const budget = useGetUnreadNotificationsQuery(
    uid && enabled && budgetAlerts ? { uid, type: 'budget-threshold' } : skipToken,
  )
  const settle = useGetUnreadNotificationsQuery(
    uid && enabled ? { uid, type: 'settle-reminder' } : skipToken,
  )
  const seen = useRef<Set<string> | null>(null)

  useEffect(() => {
    if (!budget.data && !settle.data) return
    const all = [...(budget.data ?? []), ...(settle.data ?? [])]
    // The first load only records what is already there.
    if (seen.current === null) {
      seen.current = new Set(all.map((n) => n.id))
      return
    }
    for (const n of all) {
      if (seen.current.has(n.id)) continue
      seen.current.add(n.id)
      if (AppState.currentState === 'active') continue
      void notificationsAllowed().then(async (ok) => {
        if (ok) await presentNow(n.title, n.body, mobilePath(n.link) ?? '/notifications')
      })
    }
  }, [budget.data, settle.data])
}
