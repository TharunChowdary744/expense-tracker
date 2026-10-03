/**
 * Calendar-date helpers. A calendar date is a `yyyy-MM-dd` string: a day on the wall
 * calendar with no time or timezone attached. Instants (ISO timestamps) become calendar dates
 * only through `calendarDate`, which takes an explicit IANA timezone, so date logic built on
 * these helpers can be tested in any timezone without touching the process clock.
 *
 * Arithmetic runs on UTC midnights, so daylight-saving changes never shift a day.
 */

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatterFor(timeZone: string | undefined): Intl.DateTimeFormat {
  const key = timeZone ?? ''
  let formatter = formatters.get(key)
  if (!formatter) {
    // en-CA formats as yyyy-MM-dd.
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    formatters.set(key, formatter)
  }
  return formatter
}

/** The device's IANA timezone, e.g. "Asia/Kolkata". */
export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/** The calendar date of an instant in `timeZone` (the device's timezone when omitted). */
export function calendarDate(instant: string | Date, timeZone?: string): string {
  const date = typeof instant === 'string' ? new Date(instant) : instant
  if (Number.isNaN(date.getTime())) throw new RangeError(`Not a valid instant: ${String(instant)}`)
  const parts = formatterFor(timeZone).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

function toUtc(date: string): Date {
  const match = DATE.exec(date)
  if (!match) throw new RangeError(`Not a calendar date: ${date}`)
  const [, y, m, d] = match
  const utc = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)))
  if (utc.getUTCDate() !== Number(d)) throw new RangeError(`Not a calendar date: ${date}`)
  return utc
}

function fromUtc(utc: Date): string {
  return utc.toISOString().slice(0, 10)
}

export function isCalendarDate(value: string): boolean {
  try {
    toUtc(value)
    return true
  } catch {
    return false
  }
}

export function addCalendarDays(date: string, days: number): string {
  const utc = toUtc(date)
  utc.setUTCDate(utc.getUTCDate() + days)
  return fromUtc(utc)
}

/** Adds months to the first of the month `date` falls in; returns that month's first day. */
export function addCalendarMonths(date: string, months: number): string {
  const utc = toUtc(date)
  return fromUtc(new Date(Date.UTC(utc.getUTCFullYear(), utc.getUTCMonth() + months, 1)))
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function calendarDaysBetween(from: string, to: string): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000)
}

/** 0 = Sunday … 6 = Saturday. */
export function calendarWeekday(date: string): number {
  return toUtc(date).getUTCDay()
}

/** First day of the month `date` falls in. */
export function startOfCalendarMonth(date: string): string {
  return `${date.slice(0, 7)}-01`
}

/** The local midnight that starts `date` on this device, for Firestore range queries. */
export function localMidnight(date: string): Date {
  const utc = toUtc(date)
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate())
}

/** Formats a calendar date for display without any timezone shift. */
export function formatCalendarDate(
  date: string,
  locale: string | undefined,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(toUtc(date))
}

/** Offset of `timeZone` from UTC at `instant`, in minutes (e.g. +330 for Asia/Kolkata). */
export function timeZoneOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  const wall = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  )
  return Math.round((wall - Math.floor(instant.getTime() / 1000) * 1000) / 60_000)
}

/**
 * The instant at which the wall clock in `timeZone` shows `hour`:00 on `date`. When that
 * time doesn't exist (a daylight-saving gap), the first instant after the gap is used, so the
 * result is always on `date` in that zone.
 */
export function zonedTime(date: string, timeZone: string, hour = 0): Date {
  const utc = toUtc(date)
  const guess = Date.UTC(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate(), hour)
  const first = guess - timeZoneOffsetMinutes(new Date(guess), timeZone) * 60_000
  const second = guess - timeZoneOffsetMinutes(new Date(first), timeZone) * 60_000
  const candidate = new Date(second)
  if (calendarDate(candidate, timeZone) === date) return candidate
  return new Date(first)
}
