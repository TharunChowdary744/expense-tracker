import type { PendingOccurrence } from '@/features/recurring/types'
import { formatMoney } from '@/utils/money'

/** Most bill reminders scheduled at once (iOS keeps at most 64 per app). */
export const MAX_SCHEDULED = 40
/** Reminders go off at this local hour on the bill's due day. */
export const REMINDER_HOUR = 9

export interface PlannedReminder {
  id: string
  date: Date
  title: string
  body: string
  url: string
}

function localDate(day: string, hour: number): Date {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d, hour, 0, 0, 0)
}

/**
 * Device reminders for upcoming remind-mode bills: one at REMINDER_HOUR on each due day that
 * is still in the future, soonest first. `titleOf` names the bill (payee or category).
 */
export function planBillReminders(
  pending: readonly PendingOccurrence[],
  titleOf: (item: PendingOccurrence) => string,
  locale: string | undefined,
  now = new Date(),
): PlannedReminder[] {
  const out: PlannedReminder[] = []
  for (const item of pending) {
    if (item.rule.mode !== 'remind') continue
    const date = localDate(item.occurrence.date, REMINDER_HOUR)
    if (date.getTime() <= now.getTime()) continue
    const t = item.rule.template
    const amount = formatMoney(t.amount, t.currency, locale)
    out.push({
      id: `bill:${item.txId}`,
      date,
      title: `${titleOf(item)} is due today`,
      body: `${amount}. Open Ledgerly to confirm or skip it.`,
      url: '/recurring',
    })
    if (out.length >= MAX_SCHEDULED) break
  }
  return out
}
