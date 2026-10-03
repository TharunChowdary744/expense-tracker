import { useEffect, useRef } from 'react'
import { useUid } from '@/features/auth/hooks'
import {
  useGetUnreadNotificationsQuery,
  useMarkNotificationReadMutation,
} from '@/features/notifications/api'
import { useToast } from '@/features/ui/hooks'

/**
 * Shows settle-up reminders other members left for the signed-in user as toasts, once each,
 * and marks them read. Mounted in AppLayout.
 */
export function useSettleReminders() {
  const uid = useUid()
  const toast = useToast()
  const { data } = useGetUnreadNotificationsQuery({ uid, type: 'settle-reminder' })
  const [markRead] = useMarkNotificationReadMutation()
  const shown = useRef(new Set<string>())

  useEffect(() => {
    for (const n of data ?? []) {
      if (shown.current.has(n.id)) continue
      shown.current.add(n.id)
      toast({ title: n.title, description: n.body })
      void markRead({ uid, id: n.id })
    }
  }, [data, markRead, toast, uid])
}
