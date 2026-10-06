/** "5 min ago", "3 h ago", or a date for anything older than a day. */
export function relativeTime(iso: string, now: Date, locale?: string): string {
  const then = new Date(iso)
  const minutes = Math.round((now.getTime() - then.getTime()) / 60_000)
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  if (minutes < 1) return rtf.format(0, 'minute')
  if (minutes < 60) return rtf.format(-minutes, 'minute')
  if (minutes < 24 * 60) return rtf.format(-Math.round(minutes / 60), 'hour')
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(then)
}
