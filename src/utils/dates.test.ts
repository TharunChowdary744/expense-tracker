import { describe, expect, it } from 'vitest'
import {
  addCalendarDays,
  addCalendarMonths,
  calendarDate,
  calendarDaysBetween,
  calendarWeekday,
  formatCalendarDate,
  isCalendarDate,
  localMidnight,
  startOfCalendarMonth,
  timeZoneOffsetMinutes,
  zonedTime,
} from './dates'

describe('calendarDate', () => {
  it('places an instant on the calendar of the given timezone', () => {
    const instant = '2026-09-30T20:00:00Z'
    expect(calendarDate(instant, 'UTC')).toBe('2026-09-30')
    expect(calendarDate(instant, 'Asia/Kolkata')).toBe('2026-10-01')
    expect(calendarDate(instant, 'America/New_York')).toBe('2026-09-30')
    expect(calendarDate(new Date('2026-01-01T03:00:00Z'), 'America/Los_Angeles')).toBe('2025-12-31')
  })

  it('rejects invalid instants', () => {
    expect(() => calendarDate('nope', 'UTC')).toThrow(RangeError)
  })
})

describe('calendar arithmetic', () => {
  it('adds days across months, years and leap days', () => {
    expect(addCalendarDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addCalendarDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addCalendarDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addCalendarDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('is not shifted by daylight saving (2026-03-08 in the US, 2026-03-29 in the EU)', () => {
    expect(addCalendarDays('2026-03-07', 2)).toBe('2026-03-09')
    expect(calendarDaysBetween('2026-03-28', '2026-03-30')).toBe(2)
  })

  it('moves by months to the first of the month', () => {
    expect(addCalendarMonths('2026-01-31', 1)).toBe('2026-02-01')
    expect(addCalendarMonths('2026-01-15', -1)).toBe('2025-12-01')
    expect(addCalendarMonths('2026-11-01', 2)).toBe('2027-01-01')
  })

  it('counts days and weekdays', () => {
    expect(calendarDaysBetween('2026-10-01', '2026-11-01')).toBe(31)
    expect(calendarDaysBetween('2026-11-01', '2026-10-01')).toBe(-31)
    expect(calendarWeekday('2026-10-03')).toBe(6)
    expect(calendarWeekday('2026-10-04')).toBe(0)
    expect(startOfCalendarMonth('2026-10-17')).toBe('2026-10-01')
  })

  it('validates calendar dates', () => {
    expect(isCalendarDate('2026-02-29')).toBe(false)
    expect(isCalendarDate('2028-02-29')).toBe(true)
    expect(isCalendarDate('2026-1-1')).toBe(false)
    expect(() => addCalendarDays('x', 1)).toThrow(RangeError)
  })

  it('formats without a timezone shift and gives local midnights', () => {
    expect(formatCalendarDate('2026-10-01', 'en-GB', { day: 'numeric', month: 'short' })).toBe(
      '1 Oct',
    )
    const midnight = localMidnight('2026-10-01')
    expect([midnight.getFullYear(), midnight.getMonth(), midnight.getDate()]).toEqual([2026, 9, 1])
    expect(midnight.getHours()).toBe(0)
  })
})

describe('zonedTime', () => {
  it('finds local midnight in fixed and DST zones', () => {
    expect(zonedTime('2026-10-03', 'Asia/Kolkata').toISOString()).toBe('2026-10-02T18:30:00.000Z')
    expect(zonedTime('2026-10-03', 'UTC').toISOString()).toBe('2026-10-03T00:00:00.000Z')
    // New York: EDT (UTC-4) in summer, EST (UTC-5) in winter.
    expect(zonedTime('2026-07-01', 'America/New_York').toISOString()).toBe(
      '2026-07-01T04:00:00.000Z',
    )
    expect(zonedTime('2026-12-01', 'America/New_York').toISOString()).toBe(
      '2026-12-01T05:00:00.000Z',
    )
  })

  it('handles the days clocks change', () => {
    // 8 Mar 2026: New York springs forward at 02:00, midnight still exists.
    expect(zonedTime('2026-03-08', 'America/New_York').toISOString()).toBe(
      '2026-03-08T05:00:00.000Z',
    )
    expect(zonedTime('2026-03-08', 'America/New_York', 12).toISOString()).toBe(
      '2026-03-08T16:00:00.000Z',
    )
    // 1 Nov 2026: falls back at 02:00.
    expect(zonedTime('2026-11-01', 'America/New_York', 12).toISOString()).toBe(
      '2026-11-01T17:00:00.000Z',
    )
    // London's clocks change at 01:00 UTC on 29 Mar 2026.
    expect(zonedTime('2026-03-29', 'Europe/London', 12).toISOString()).toBe(
      '2026-03-29T11:00:00.000Z',
    )
  })

  it('uses the first instant after a gap at midnight', () => {
    // Santiago skips 00:00–00:59 on 6 Sep 2026 (UTC-4 → UTC-3).
    const instant = zonedTime('2026-09-06', 'America/Santiago')
    expect(calendarDate(instant, 'America/Santiago')).toBe('2026-09-06')
    expect(instant.toISOString()).toBe('2026-09-06T04:00:00.000Z')
  })

  it('always lands on the requested calendar date', () => {
    for (const zone of ['Pacific/Kiritimati', 'Pacific/Pago_Pago', 'Asia/Kathmandu']) {
      for (const date of ['2026-01-01', '2026-02-28', '2028-02-29', '2026-12-31']) {
        expect(calendarDate(zonedTime(date, zone), zone)).toBe(date)
        expect(calendarDate(zonedTime(date, zone, 12), zone)).toBe(date)
      }
    }
  })

  it('reports offsets', () => {
    expect(timeZoneOffsetMinutes(new Date('2026-01-01T00:00:00Z'), 'Asia/Kolkata')).toBe(330)
    expect(timeZoneOffsetMinutes(new Date('2026-01-01T00:00:00Z'), 'America/New_York')).toBe(-300)
  })
})
