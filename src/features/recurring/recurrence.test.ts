import { describe, expect, it } from 'vitest'
import { LAST_DAY } from './engine'
import { defaultRecurrenceInput, parseRecurrence, recurrenceInputFrom } from './recurrence'

const input = (over: Partial<ReturnType<typeof defaultRecurrenceInput>> = {}) => ({
  ...defaultRecurrenceInput(true),
  ...over,
})

describe('parseRecurrence', () => {
  it("stores the start date's day for a monthly rule", () => {
    expect(parseRecurrence(input(), '2026-01-31')).toEqual({
      ok: true,
      value: { frequency: 'monthly', interval: 1, byMonthDay: 31, mode: 'auto' },
    })
    expect(parseRecurrence(input({ monthDay: 'last' }), '2026-01-15')).toMatchObject({
      value: { byMonthDay: LAST_DAY },
    })
    expect(parseRecurrence(input({ monthDay: '10' }), '2026-01-15')).toMatchObject({
      value: { byMonthDay: 10 },
    })
  })

  it("uses the start's weekday when no days are picked", () => {
    // 2026-10-02 is a Friday.
    expect(parseRecurrence(input({ frequency: 'weekly' }), '2026-10-02')).toMatchObject({
      value: { frequency: 'weekly', byWeekday: [5] },
    })
    expect(
      parseRecurrence(input({ frequency: 'weekly', byWeekday: [4, 1, 4] }), '2026-10-02'),
    ).toMatchObject({ value: { byWeekday: [1, 4] } })
  })

  it('reads ends and mode', () => {
    expect(
      parseRecurrence(input({ ends: 'on', endDate: '2027-01-31', mode: 'remind' }), '2026-01-31'),
    ).toMatchObject({ value: { endDate: '2027-01-31', mode: 'remind' } })
    expect(parseRecurrence(input({ ends: 'after', count: '6' }), '2026-01-31')).toMatchObject({
      value: { maxOccurrences: 6 },
    })
  })

  it.each([
    [{ interval: '0' }, 'recurrence.interval'],
    [{ interval: '1.5' }, 'recurrence.interval'],
    [{ interval: '366' }, 'recurrence.interval'],
    [{ ends: 'on' as const, endDate: '' }, 'recurrence.endDate'],
    [{ ends: 'on' as const, endDate: '2025-12-31' }, 'recurrence.endDate'],
    [{ ends: 'after' as const, count: '0' }, 'recurrence.count'],
    [{ ends: 'after' as const, count: '1001' }, 'recurrence.count'],
    [{ monthDay: '32' }, 'recurrence.monthDay'],
  ])('rejects %o', (over, path) => {
    expect(parseRecurrence(input(over), '2026-01-31')).toMatchObject({ ok: false, path })
  })

  it('round-trips a stored schedule into form input', () => {
    expect(
      recurrenceInputFrom(
        {
          frequency: 'monthly',
          interval: 2,
          byMonthDay: LAST_DAY,
          startDate: '2026-01-31',
          maxOccurrences: 4,
        },
        'remind',
      ),
    ).toMatchObject({ interval: '2', monthDay: 'last', ends: 'after', count: '4', mode: 'remind' })
  })
})
