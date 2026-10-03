import { describe, expect, it } from 'vitest'
import { inPeriod, periodContaining, periodDays, periodLabel, shiftPeriod } from './period'

describe('periodContaining', () => {
  it('gives the calendar month with an exclusive end', () => {
    expect(periodContaining('2026-10-17', 'monthly', 1)).toEqual({
      kind: 'monthly',
      start: '2026-10-01',
      end: '2026-11-01',
      key: 'M2026-10-01',
    })
    expect(periodContaining('2026-12-31', 'monthly', 0).end).toBe('2027-01-01')
    expect(periodDays(periodContaining('2028-02-10', 'monthly', 1))).toHaveLength(29)
  })

  it('starts weeks on Monday or Sunday', () => {
    // 2026-10-03 is a Saturday.
    expect(periodContaining('2026-10-03', 'weekly', 1)).toMatchObject({
      start: '2026-09-28',
      end: '2026-10-05',
      key: 'W2026-09-28',
    })
    expect(periodContaining('2026-10-03', 'weekly', 0)).toMatchObject({
      start: '2026-09-27',
      end: '2026-10-04',
    })
    // Sunday itself: last day of a Monday week, first day of a Sunday week.
    expect(periodContaining('2026-10-04', 'weekly', 1).start).toBe('2026-09-28')
    expect(periodContaining('2026-10-04', 'weekly', 0).start).toBe('2026-10-04')
    // Monday itself.
    expect(periodContaining('2026-09-28', 'weekly', 1).start).toBe('2026-09-28')
  })

  it('spans year boundaries for weeks', () => {
    expect(periodContaining('2027-01-01', 'weekly', 1)).toMatchObject({
      start: '2026-12-28',
      end: '2027-01-04',
    })
  })
})

describe('shiftPeriod', () => {
  it('moves months and weeks both ways', () => {
    const oct = periodContaining('2026-10-03', 'monthly', 1)
    expect(shiftPeriod(oct, -1)).toMatchObject({ start: '2026-09-01', end: '2026-10-01' })
    expect(shiftPeriod(oct, 3)).toMatchObject({ start: '2027-01-01', end: '2027-02-01' })
    const week = periodContaining('2026-10-03', 'weekly', 1)
    expect(shiftPeriod(week, -1)).toMatchObject({ start: '2026-09-21', end: '2026-09-28' })
    expect(shiftPeriod(week, 1).key).toBe('W2026-10-05')
  })
})

describe('inPeriod and periodLabel', () => {
  it('includes the start and excludes the end', () => {
    const oct = periodContaining('2026-10-03', 'monthly', 1)
    expect(inPeriod('2026-10-01', oct)).toBe(true)
    expect(inPeriod('2026-10-31', oct)).toBe(true)
    expect(inPeriod('2026-11-01', oct)).toBe(false)
    expect(inPeriod('2026-09-30', oct)).toBe(false)
  })

  it('labels months and weeks', () => {
    expect(periodLabel(periodContaining('2026-10-03', 'monthly', 1), 'en-GB')).toBe('October 2026')
    expect(periodLabel(periodContaining('2026-10-03', 'weekly', 1), 'en-US')).toBe(
      'Sep 28 – Oct 4, 2026',
    )
    expect(periodLabel(periodContaining('2027-01-01', 'weekly', 1), 'en-US')).toBe(
      'Dec 28, 2026 – Jan 3, 2027',
    )
  })
})
