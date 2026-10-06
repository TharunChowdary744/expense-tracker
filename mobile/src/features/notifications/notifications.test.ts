import type { PendingOccurrence } from '@/features/recurring/types'
import { relativeTime } from './time'
import { MAX_SCHEDULED, planBillReminders } from './reminders'

function pending(id: string, date: string, mode: 'remind' | 'auto' = 'remind'): PendingOccurrence {
  return {
    txId: id,
    occurrence: { key: date, date },
    rule: { mode, template: { amount: 49900, currency: 'INR' } },
  } as unknown as PendingOccurrence
}

describe('planBillReminders', () => {
  const now = new Date(2026, 9, 6, 12, 0)

  it('schedules future remind-mode bills at 9:00 on their due day', () => {
    const plan = planBillReminders(
      [pending('a', '2026-10-06'), pending('b', '2026-10-07'), pending('c', '2026-10-08', 'auto')],
      () => 'Rent',
      'en-IN',
      now,
    )
    expect(plan).toHaveLength(1)
    expect(plan[0]?.id).toBe('bill:b')
    expect(plan[0]?.date).toEqual(new Date(2026, 9, 7, 9, 0))
    expect(plan[0]?.title).toBe('Rent is due today')
    expect(plan[0]?.url).toBe('/recurring')
  })

  it('caps how many are scheduled', () => {
    const many = Array.from({ length: 60 }, (_, i) => pending(`t${i}`, '2026-11-01'))
    expect(planBillReminders(many, () => 'Bill', 'en', now)).toHaveLength(MAX_SCHEDULED)
  })
})

describe('relativeTime', () => {
  const now = new Date('2026-10-06T12:00:00Z')
  it('describes recent times relatively and older ones by date', () => {
    expect(relativeTime('2026-10-06T11:55:00Z', now, 'en')).toBe('5 minutes ago')
    expect(relativeTime('2026-10-06T09:00:00Z', now, 'en')).toBe('3 hours ago')
    expect(relativeTime('2026-10-01T09:00:00Z', now, 'en')).toMatch(/2026/)
  })
})
