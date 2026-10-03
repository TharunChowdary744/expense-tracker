import { describe, expect, it } from 'vitest'
import { calendarDate, zonedTime } from '@/utils/dates'
import {
  LAST_DAY,
  countBefore,
  describeRule,
  nextOccurrence,
  occurrenceAfter,
  occurrencesBetween,
  occurrencesPerYear,
  validateRule,
  type RecurrenceRule,
} from './engine'

const dates = (rule: RecurrenceRule, from: string, to: string) =>
  occurrencesBetween(rule, from, to).map((o) => o.date)

const monthly = (startDate: string, extra: Partial<RecurrenceRule> = {}): RecurrenceRule => ({
  frequency: 'monthly',
  interval: 1,
  startDate,
  ...extra,
})

describe('daily', () => {
  it('repeats every n days from the start', () => {
    const rule: RecurrenceRule = { frequency: 'daily', interval: 1, startDate: '2026-02-27' }
    expect(dates(rule, '2026-01-01', '2026-03-02')).toEqual([
      '2026-02-27',
      '2026-02-28',
      '2026-03-01',
      '2026-03-02',
    ])
    expect(dates({ ...rule, interval: 3 }, '2026-02-27', '2026-03-10')).toEqual([
      '2026-02-27',
      '2026-03-02',
      '2026-03-05',
      '2026-03-08',
    ])
  })

  it('crosses DST changes without shifting days (dates carry no time)', () => {
    const rule: RecurrenceRule = { frequency: 'daily', interval: 1, startDate: '2026-03-07' }
    expect(dates(rule, '2026-03-07', '2026-03-10')).toEqual([
      '2026-03-07',
      '2026-03-08',
      '2026-03-09',
      '2026-03-10',
    ])
  })

  it('includes Feb 29 in leap years', () => {
    const rule: RecurrenceRule = { frequency: 'daily', interval: 1, startDate: '2028-02-28' }
    expect(dates(rule, '2028-02-28', '2028-03-01')).toEqual([
      '2028-02-28',
      '2028-02-29',
      '2028-03-01',
    ])
  })
})

describe('weekly', () => {
  it("defaults to the start date's weekday", () => {
    // 2026-10-02 is a Friday.
    const rule: RecurrenceRule = { frequency: 'weekly', interval: 1, startDate: '2026-10-02' }
    expect(dates(rule, '2026-10-01', '2026-10-20')).toEqual([
      '2026-10-02',
      '2026-10-09',
      '2026-10-16',
    ])
  })

  it('uses chosen weekdays, never before the start', () => {
    // Start Wednesday 2026-09-30; Mon/Thu: Mon 28 Sep is before the start.
    const rule: RecurrenceRule = {
      frequency: 'weekly',
      interval: 1,
      byWeekday: [4, 1],
      startDate: '2026-09-30',
    }
    expect(dates(rule, '2026-09-01', '2026-10-12')).toEqual([
      '2026-10-01',
      '2026-10-05',
      '2026-10-08',
      '2026-10-12',
    ])
  })

  it('skips weeks with an interval, weeks running Monday to Sunday', () => {
    // Start Sunday 2026-10-04 (end of its Mon-Sun week); every 2 weeks on Mon and Sun.
    const rule: RecurrenceRule = {
      frequency: 'weekly',
      interval: 2,
      byWeekday: [0, 1],
      startDate: '2026-10-04',
    }
    expect(dates(rule, '2026-10-01', '2026-10-31')).toEqual([
      '2026-10-04',
      '2026-10-12',
      '2026-10-18',
      '2026-10-26',
    ])
  })
})

describe('monthly', () => {
  it('puts the 31st on the last day of short months', () => {
    expect(dates(monthly('2026-01-31'), '2026-01-01', '2026-06-30')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
      '2026-06-30',
    ])
    // Leap year.
    expect(dates(monthly('2028-01-31'), '2028-02-01', '2028-02-29')).toEqual(['2028-02-29'])
  })

  it('keeps the 31st after a short month (no drift)', () => {
    expect(dates(monthly('2026-02-28', { byMonthDay: 31 }), '2026-02-01', '2026-04-30')).toEqual([
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ])
  })

  it('supports the last day of the month', () => {
    expect(
      dates(monthly('2026-01-15', { byMonthDay: LAST_DAY }), '2026-01-01', '2026-04-30'),
    ).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'])
  })

  it('starts in the next month when the day has passed', () => {
    expect(dates(monthly('2026-01-15', { byMonthDay: 10 }), '2026-01-01', '2026-03-31')).toEqual([
      '2026-02-10',
      '2026-03-10',
    ])
  })

  it('repeats every n months across years', () => {
    expect(dates(monthly('2026-11-05', { interval: 2 }), '2026-01-01', '2027-06-30')).toEqual([
      '2026-11-05',
      '2027-01-05',
      '2027-03-05',
      '2027-05-05',
    ])
  })
})

describe('yearly', () => {
  it('puts Feb 29 on Feb 28 in common years and back on the 29th in leap years', () => {
    const rule: RecurrenceRule = { frequency: 'yearly', interval: 1, startDate: '2028-02-29' }
    expect(dates(rule, '2028-01-01', '2033-01-01')).toEqual([
      '2028-02-29',
      '2029-02-28',
      '2030-02-28',
      '2031-02-28',
      '2032-02-29',
    ])
  })

  it('supports intervals', () => {
    const rule: RecurrenceRule = { frequency: 'yearly', interval: 2, startDate: '2026-06-15' }
    expect(dates(rule, '2026-01-01', '2031-01-01')).toEqual([
      '2026-06-15',
      '2028-06-15',
      '2030-06-15',
    ])
  })
})

describe('limits and skips', () => {
  it('stops at the end date (inclusive)', () => {
    expect(
      dates(monthly('2026-01-10', { endDate: '2026-03-10' }), '2026-01-01', '2026-12-31'),
    ).toEqual(['2026-01-10', '2026-02-10', '2026-03-10'])
  })

  it('stops after maxOccurrences, counting from the start even when the range starts later', () => {
    const rule = monthly('2026-01-10', { maxOccurrences: 3 })
    expect(dates(rule, '2026-02-01', '2026-12-31')).toEqual(['2026-02-10', '2026-03-10'])
  })

  it('skipped occurrences still count towards maxOccurrences', () => {
    const rule = monthly('2026-01-10', { maxOccurrences: 3, skippedKeys: ['2026-02-10'] })
    expect(dates(rule, '2026-01-01', '2026-12-31')).toEqual(['2026-01-10', '2026-03-10'])
    const all = occurrencesBetween(rule, '2026-01-01', '2026-12-31', { includeSkipped: true })
    expect(all.map((o) => [o.date, o.index, o.skipped])).toEqual([
      ['2026-01-10', 0, false],
      ['2026-02-10', 1, true],
      ['2026-03-10', 2, false],
    ])
  })

  it('respects a limit', () => {
    const rule: RecurrenceRule = { frequency: 'daily', interval: 1, startDate: '2025-01-01' }
    const got = occurrencesBetween(rule, '2025-01-01', '2026-12-31', { limit: 100 })
    expect(got).toHaveLength(100)
    expect(got.at(-1)?.date).toBe('2025-04-10')
  })

  it('returns nothing for an empty range', () => {
    expect(dates(monthly('2026-01-10'), '2026-02-11', '2026-03-09')).toEqual([])
    expect(dates(monthly('2026-01-10'), '2026-03-09', '2026-02-11')).toEqual([])
  })
})

describe('nextOccurrence', () => {
  it('finds the next one on or after a date, skipping skipped ones', () => {
    const rule = monthly('2026-01-31', { skippedKeys: ['2026-02-28'] })
    expect(nextOccurrence(rule, '2026-02-01')?.date).toBe('2026-03-31')
    expect(nextOccurrence(rule, '2026-02-01', { includeSkipped: true })?.date).toBe('2026-02-28')
    expect(occurrenceAfter(rule, '2026-03-31')?.date).toBe('2026-04-30')
  })

  it('returns null when the schedule has ended', () => {
    expect(
      nextOccurrence(monthly('2026-01-10', { endDate: '2026-02-10' }), '2026-02-11'),
    ).toBeNull()
    expect(nextOccurrence(monthly('2026-01-10', { maxOccurrences: 1 }), '2026-01-11')).toBeNull()
  })

  it('counts schedule dates before a date', () => {
    expect(countBefore(monthly('2026-01-10'), '2026-04-10')).toBe(3)
    expect(countBefore(monthly('2026-01-10'), '2026-01-10')).toBe(0)
  })
})

describe('the brief: monthly rent started 3 months ago', () => {
  // Today is 3 Oct 2026 in India.
  const today = calendarDate(new Date('2026-10-03T05:00:00Z'), 'Asia/Kolkata')

  it('has 3 due occurrences when today is not the due day', () => {
    const rule = monthly('2026-07-05')
    expect(occurrencesBetween(rule, rule.startDate, today)).toHaveLength(3)
  })

  it('has 4 when today is the due day', () => {
    const rule = monthly('2026-07-03')
    expect(occurrencesBetween(rule, rule.startDate, today)).toHaveLength(4)
  })
})

describe('timezones', () => {
  it('decides "today" in the rule timezone', () => {
    const rule = monthly('2026-10-03')
    // 20:00 UTC on 2 Oct is already 3 Oct in India but still 2 Oct in New York.
    const now = new Date('2026-10-02T20:00:00Z')
    expect(dates(rule, rule.startDate, calendarDate(now, 'Asia/Kolkata'))).toEqual(['2026-10-03'])
    expect(dates(rule, rule.startDate, calendarDate(now, 'America/New_York'))).toEqual([])
  })

  it('becomes due at local midnight across a DST change', () => {
    const rule: RecurrenceRule = { frequency: 'daily', interval: 1, startDate: '2026-03-07' }
    const due = dates(rule, '2026-03-07', '2026-03-09').map((d) =>
      zonedTime(d, 'America/New_York').toISOString(),
    )
    expect(due).toEqual([
      '2026-03-07T05:00:00.000Z',
      '2026-03-08T05:00:00.000Z',
      '2026-03-09T04:00:00.000Z',
    ])
  })
})

describe('validateRule', () => {
  it('accepts valid rules and rejects bad fields', () => {
    expect(validateRule(monthly('2026-01-01'))).toBeNull()
    expect(validateRule(monthly('2026-01-01', { interval: 0 }))).toMatch(/every/)
    expect(validateRule(monthly('2026-01-01', { byMonthDay: 32 }))).toMatch(/Day of month/)
    expect(validateRule(monthly('2026-01-01', { endDate: '2025-12-31' }))).toMatch(/before/)
    expect(validateRule(monthly('2026-01-01', { maxOccurrences: 0 }))).toMatch(/times/)
    expect(
      validateRule({ frequency: 'weekly', interval: 1, byWeekday: [7], startDate: '2026-01-01' }),
    ).toMatch(/Weekdays/)
    expect(() => dates(monthly('2026-01-01', { interval: 0 }), '2026-01-01', '2026-02-01')).toThrow(
      RangeError,
    )
  })
})

describe('occurrencesPerYear', () => {
  it('gives exact fractions', () => {
    expect(occurrencesPerYear(monthly('2026-01-01'))).toEqual({ num: 12, den: 1 })
    expect(occurrencesPerYear(monthly('2026-01-01', { interval: 3 }))).toEqual({ num: 12, den: 3 })
    expect(
      occurrencesPerYear({ frequency: 'daily', interval: 1, startDate: '2026-01-01' }),
    ).toEqual({ num: 1461, den: 4 })
    expect(
      occurrencesPerYear({
        frequency: 'weekly',
        interval: 2,
        byWeekday: [1, 4],
        startDate: '2026-01-01',
      }),
    ).toEqual({ num: 2922, den: 56 })
    expect(
      occurrencesPerYear({ frequency: 'yearly', interval: 1, startDate: '2026-01-01' }),
    ).toEqual({ num: 1, den: 1 })
  })
})

describe('describeRule', () => {
  it('reads naturally', () => {
    expect(describeRule(monthly('2026-01-31'), 'en-IN')).toBe('Every month on the 31st')
    expect(describeRule(monthly('2026-01-01', { byMonthDay: LAST_DAY, interval: 2 }), 'en')).toBe(
      'Every 2 months on the last day',
    )
    expect(describeRule(monthly('2026-01-22'), 'en')).toBe('Every month on the 22nd')
    expect(describeRule({ frequency: 'daily', interval: 1, startDate: '2026-01-01' }, 'en')).toBe(
      'Every day',
    )
    expect(
      describeRule(
        { frequency: 'weekly', interval: 2, byWeekday: [4, 1], startDate: '2026-01-01' },
        'en',
      ),
    ).toBe('Every 2 weeks on Mon, Thu')
    expect(describeRule({ frequency: 'weekly', interval: 1, startDate: '2026-10-02' }, 'en')).toBe(
      'Every week on Friday',
    )
    expect(
      describeRule({ frequency: 'yearly', interval: 1, startDate: '2028-02-29' }, 'en-GB'),
    ).toBe('Every year on 29 February')
  })
})
