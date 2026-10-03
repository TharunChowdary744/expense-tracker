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
