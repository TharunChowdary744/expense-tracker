import { describe, expect, it } from 'vitest'
import { zonedTime } from '@/utils/dates'
import { LAST_DAY } from './engine'
import type { RecurringRule } from './types'
import {
  earliestNewStart,
  isDue,
  occurrenceTxId,
  pendingOccurrences,
  planCatchUp,
  planRuleUpdate,
  postedLookupIds,
  relativeDay,
  ruleCost,
  ruleNextDate,
  ruleSchedule,
  ruleStatus,
  subscriptionSummary,
} from './utils'

const TZ = 'Asia/Kolkata'
const at = (date: string, tz = TZ) => zonedTime(date, tz).toISOString()
/** 10:30 on 3 Oct 2026 in India. */
const NOW = new Date('2026-10-03T05:00:00Z')

function rule(over: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: 'r1',
    pending: false,
    template: {
      type: 'expense',
      amount: 2500000,
      currency: 'INR',
      fxRateToBase: 1,
      baseAmount: 2500000,
      accountId: 'bank',
      categoryId: 'rent',
      tags: [],
      payee: 'Landlord',
      note: '',
    },
    frequency: 'monthly',
    interval: 1,
    byMonthDay: 3,
    startDate: at('2026-07-03'),
    timeZone: TZ,
    nextRunAt: at('2026-07-03'),
    lastRunAt: null,
    mode: 'auto',
    paused: false,
    skippedKeys: [],
    createdAt: at('2026-07-01'),
    updatedAt: at('2026-07-01'),
    createdBy: 'alice',
    ...over,
  }
}

describe('reading a rule', () => {
  it('turns stored instants into calendar dates in the rule timezone', () => {
    const r = rule({ endDate: at('2027-01-31') })
    expect(ruleSchedule(r)).toMatchObject({
      startDate: '2026-07-03',
      endDate: '2027-01-31',
      byMonthDay: 3,
    })
    expect(ruleNextDate(r)).toBe('2026-07-03')
  })

  it('keeps dates in the rule timezone even when read elsewhere', () => {
    // Created in New York: midnight there is already the next morning in India.
    const r = rule({
      timeZone: 'America/New_York',
      startDate: at('2026-07-03', 'America/New_York'),
    })
    expect(ruleSchedule(r).startDate).toBe('2026-07-03')
  })

  it('reports status and due-ness', () => {
    expect(ruleStatus(rule())).toBe('active')
    expect(ruleStatus(rule({ paused: true }))).toBe('paused')
    expect(ruleStatus(rule({ nextRunAt: null }))).toBe('ended')
    expect(isDue(rule(), NOW)).toBe(true)
    expect(isDue(rule({ paused: true }), NOW)).toBe(false)
    expect(isDue(rule({ mode: 'remind' }), NOW)).toBe(false)
    expect(isDue(rule({ nextRunAt: at('2026-10-04') }), NOW)).toBe(false)
    // Due from local midnight.
    expect(isDue(rule({ nextRunAt: at('2026-10-03') }), new Date('2026-10-02T18:30:00Z'))).toBe(
      true,
    )
  })

  it('builds deterministic occurrence ids', () => {
    expect(occurrenceTxId('r1', '2026-07-03')).toBe('r1_2026-07-03')
  })
})

describe('planCatchUp', () => {
  it('posts 3 when the start was 3 months ago and today is not the due day', () => {
    const r = rule({ byMonthDay: 5, startDate: at('2026-07-05') })
    const plan = planCatchUp(ruleSchedule(r), '2026-07-05', '2026-10-03')
    expect(plan.due.map((o) => o.date)).toEqual(['2026-07-05', '2026-08-05', '2026-09-05'])
    expect(plan.remaining).toBe(0)
    expect(plan.nextDate).toBe('2026-10-05')
  })

  it('posts 4 when today is the due day', () => {
    const plan = planCatchUp(ruleSchedule(rule()), '2026-07-03', '2026-10-03')
    expect(plan.due).toHaveLength(4)
    expect(plan.nextDate).toBe('2026-11-03')
  })

  it('posts the 31st on the last day of short months', () => {
    const r = rule({ byMonthDay: 31, startDate: at('2026-01-31') })
    const plan = planCatchUp(ruleSchedule(r), '2026-01-31', '2026-05-01')
    expect(plan.due.map((o) => o.date)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ])
  })

  it('caps the run and leaves nextDate at the first one not posted', () => {
    const r = rule({ frequency: 'daily', startDate: at('2026-05-01') })
    delete (r as Partial<RecurringRule>).byMonthDay
    const plan = planCatchUp(ruleSchedule(r), '2026-05-01', '2026-10-03', 100)
    expect(plan.due).toHaveLength(100)
    expect(plan.remaining).toBe(56)
    expect(plan.nextDate).toBe('2026-08-09')
  })

  it('leaves out skipped occurrences and ends when the schedule does', () => {
    const r = rule({ skippedKeys: ['2026-08-03'], maxOccurrences: 3 })
    const plan = planCatchUp(ruleSchedule(r), '2026-07-03', '2026-10-03')
    expect(plan.due.map((o) => o.date)).toEqual(['2026-07-03', '2026-09-03'])
    expect(plan.nextDate).toBeNull()
  })

  it('does nothing before the next date', () => {
    const plan = planCatchUp(ruleSchedule(rule()), '2026-11-03', '2026-10-03')
    expect(plan.due).toEqual([])
    expect(plan.nextDate).toBe('2026-11-03')
  })
})

describe('cost', () => {
  it('gives monthly and yearly equivalents in base currency', () => {
    expect(ruleCost(rule())).toEqual({ monthly: 2500000, yearly: 30000000 })
    // ₹100 a day: ₹36,525 a year, ₹3,043.75 a month.
    expect(
      ruleCost(rule({ frequency: 'daily', template: { ...rule().template, baseAmount: 10000 } })),
    ).toEqual({ monthly: 304375, yearly: 3652500 })
    // $15 every 3 months recorded as ₹1,252.50.
    expect(
      ruleCost(rule({ interval: 3, template: { ...rule().template, baseAmount: 125250 } })),
    ).toEqual({ monthly: 41750, yearly: 501000 })
    expect(
      ruleCost(rule({ frequency: 'yearly', template: { ...rule().template, baseAmount: 119900 } })),
    ).toEqual({ monthly: 9992, yearly: 119900 })
  })

  it('totals active recurring expenses only', () => {
    const summary = subscriptionSummary([
      rule({ id: 'rent' }),
      rule({ id: 'netflix', template: { ...rule().template, baseAmount: 64900 } }),
      rule({ id: 'paused', paused: true }),
      rule({ id: 'ended', nextRunAt: null }),
      rule({ id: 'salary', template: { ...rule().template, type: 'income' } }),
    ])
    expect(summary.items.map((i) => i.rule.id)).toEqual(['rent', 'netflix'])
    expect(summary.monthly).toBe(2564900)
    expect(summary.yearly).toBe(30778800)
  })
})

describe('pendingOccurrences', () => {
  const remind = rule({ id: 'm', mode: 'remind', nextRunAt: at('2026-09-03') })

  it('lists due and upcoming occurrences with days away', () => {
    const items = pendingOccurrences([remind], { days: 7, now: NOW })
    expect(items.map((i) => [i.occurrence.date, i.daysAway, i.txId])).toEqual([
      ['2026-09-03', -30, 'm_2026-09-03'],
      ['2026-10-03', 0, 'm_2026-10-03'],
    ])
  })

  it('leaves out posted, skipped, paused and filtered rules', () => {
    expect(
      pendingOccurrences([remind], { days: 7, now: NOW, posted: new Set(['m_2026-10-03']) }).map(
        (i) => i.occurrence.date,
      ),
    ).toEqual(['2026-09-03'])
    expect(
      pendingOccurrences([{ ...remind, skippedKeys: ['2026-10-03'] }], { days: 7, now: NOW }),
    ).toHaveLength(1)
    expect(pendingOccurrences([{ ...remind, paused: true }], { days: 7, now: NOW })).toEqual([])
    expect(
      pendingOccurrences([remind], { days: 7, now: NOW, filter: (r) => r.mode === 'auto' }),
    ).toEqual([])
  })

  it('shows upcoming auto occurrences within the window', () => {
    const auto = rule({ nextRunAt: at('2026-11-03') })
    expect(pendingOccurrences([auto], { days: 7, now: NOW })).toEqual([])
    const soon = rule({ byMonthDay: 8, startDate: at('2026-07-08'), nextRunAt: at('2026-10-08') })
    expect(pendingOccurrences([soon], { days: 7, now: NOW })[0]?.daysAway).toBe(5)
  })

  it('looks up only remind occurrences after the first', () => {
    expect(postedLookupIds([remind, rule()], 7, NOW)).toEqual(['m_2026-10-03'])
  })
})

describe('planRuleUpdate ("this and future")', () => {
  const values = {
    frequency: 'monthly' as const,
    interval: 1,
    byMonthDay: 3,
    mode: 'auto' as const,
  }
  const live = rule({ nextRunAt: at('2026-11-03') })

  it('keeps the schedule when only the amount or mode changes', () => {
    const result = planRuleUpdate(live, '2026-07-03', { ...values, mode: 'remind' }, NOW)
    expect(result).toMatchObject({
      ok: true,
      update: { startDate: '2026-07-03', nextDate: '2026-11-03' },
    })
  })

  it('restarts a changed schedule from its new start', () => {
    const result = planRuleUpdate(live, '2026-10-10', { ...values, byMonthDay: LAST_DAY }, NOW)
    expect(result).toMatchObject({
      ok: true,
      update: { startDate: '2026-10-10', byMonthDay: LAST_DAY, nextDate: '2026-10-31' },
    })
  })

  it('refuses a changed schedule that would start in posted history', () => {
    expect(earliestNewStart(live, NOW)).toBe('2026-10-03')
    const result = planRuleUpdate(live, '2026-07-03', { ...values, byMonthDay: 15 }, NOW)
    expect(result.ok).toBe(false)
  })

  it('lets an overdue remind rule restart from its first unhandled occurrence', () => {
    const overdue = rule({ mode: 'remind', nextRunAt: at('2026-09-03') })
    expect(earliestNewStart(overdue, NOW)).toBe('2026-09-03')
  })

  it('ends when the new end date has passed and keeps future skips only', () => {
    const r = rule({ nextRunAt: at('2026-11-03'), skippedKeys: ['2026-08-03', '2026-12-03'] })
    const ended = planRuleUpdate(r, '2026-07-03', { ...values, endDate: '2026-10-31' }, NOW)
    expect(ended).toMatchObject({ ok: true, update: { nextDate: null, endDate: '2026-10-31' } })
    const kept = planRuleUpdate(r, '2026-07-03', values, NOW)
    expect(kept).toMatchObject({ ok: true, update: { skippedKeys: ['2026-12-03'] } })
  })
})

describe('relativeDay', () => {
  it('reads naturally', () => {
    expect(relativeDay(0)).toBe('Today')
    expect(relativeDay(1)).toBe('Tomorrow')
    expect(relativeDay(4)).toBe('In 4 days')
    expect(relativeDay(-1)).toBe('1 day overdue')
    expect(relativeDay(-3)).toBe('3 days overdue')
  })
})
