import { describe, expect, it } from 'vitest'
import { periodContaining, shiftPeriod } from './period'
import {
  alertKey,
  computeBudgetStatus,
  expandCategoryIds,
  initialStartDate,
  loadRange,
  percentOf,
  toneOf,
  type StatusBudget,
  type StatusTransaction,
} from './utils'

const UTC = 'UTC'
const food: StatusBudget = {
  amount: 500_000, // ₹5,000.00
  categoryIds: ['food'],
  rollover: false,
  alertThresholds: [80, 100],
  startDate: '2020-01-01T00:00:00.000Z',
}
const overall: StatusBudget = { ...food, categoryIds: [] }

let seq = 0
function tx(
  date: string,
  baseAmount: number,
  extra: Partial<StatusTransaction> = {},
): StatusTransaction & { id: string } {
  seq += 1
  return { id: `t${seq}`, type: 'expense', categoryId: 'food', baseAmount, date, ...extra }
}

const oct = periodContaining('2026-10-15', 'monthly', 1)

describe('computeBudgetStatus: what counts', () => {
  it('sums expenses in the budget categories within the period', () => {
    const txs = [
      tx('2026-10-01T00:00:00Z', 10_000),
      tx('2026-10-31T23:59:59Z', 20_000),
      tx('2026-11-01T00:00:00Z', 40_000), // next month
      tx('2026-09-30T23:59:59Z', 80_000), // last month
      tx('2026-10-10T10:00:00Z', 1_000, { categoryId: 'rent' }),
      tx('2026-10-10T10:00:00Z', 2_000, { categoryId: undefined }),
      tx('2026-10-10T10:00:00Z', 4_000, { type: 'income' }),
      tx('2026-10-10T10:00:00Z', 8_000, { type: 'transfer', categoryId: undefined }),
    ]
    const s = computeBudgetStatus(food, txs, oct, { today: '2026-10-15', timeZone: UTC })
    expect(s.spent).toBe(30_000)
    expect(s.transactions.map((t) => t.baseAmount)).toEqual([20_000, 10_000]) // newest first
  })

  it('counts every expense (with or without category) for an overall budget', () => {
    const txs = [
      tx('2026-10-02T10:00:00Z', 1_000, { categoryId: 'rent' }),
      tx('2026-10-02T10:00:00Z', 2_000, { categoryId: undefined }),
      tx('2026-10-02T10:00:00Z', 4_000, { type: 'income' }),
    ]
    const s = computeBudgetStatus(overall, txs, oct, { today: '2026-10-15', timeZone: UTC })
    expect(s.spent).toBe(3_000)
  })

  it('includes subcategories when given the expanded category set', () => {
    const ids = expandCategoryIds(
      ['food'],
      [
        { id: 'food', parentId: null },
        { id: 'groceries', parentId: 'food' },
        { id: 'taxi', parentId: 'transport' },
      ],
    )
    expect([...ids].sort()).toEqual(['food', 'groceries'])
    const txs = [
      tx('2026-10-02T10:00:00Z', 1_000, { categoryId: 'groceries' }),
      tx('2026-10-02T10:00:00Z', 2_000, { categoryId: 'taxi' }),
    ]
    const s = computeBudgetStatus(food, txs, oct, {
      today: '2026-10-15',
      timeZone: UTC,
      categoryIds: ids,
    })
    expect(s.spent).toBe(1_000)
  })

  it('uses base-currency amounts', () => {
    const s = computeBudgetStatus(food, [tx('2026-10-02T10:00:00Z', 104_375)], oct, {
      today: '2026-10-15',
      timeZone: UTC,
    })
    expect(s.spent).toBe(104_375)
  })
})

describe('computeBudgetStatus: timezones and month boundaries', () => {
  // 20:00 UTC on 30 Sep is 01:30 on 1 Oct in India and 16:00 on 30 Sep in New York.
  const lateSep = tx('2026-09-30T20:00:00Z', 10_000)
  // 02:00 UTC on 1 Nov is 07:30 on 1 Nov in India, 22:00 on 31 Oct in New York.
  const earlyNov = tx('2026-11-01T02:00:00Z', 20_000)

  it('places transactions by the calendar day in the user timezone', () => {
    const india = computeBudgetStatus(food, [lateSep, earlyNov], oct, {
      today: '2026-10-15',
      timeZone: 'Asia/Kolkata',
    })
    expect(india.spent).toBe(10_000)
    const newYork = computeBudgetStatus(food, [lateSep, earlyNov], oct, {
      today: '2026-10-15',
      timeZone: 'America/New_York',
    })
    expect(newYork.spent).toBe(20_000)
    const utc = computeBudgetStatus(food, [lateSep, earlyNov], oct, {
      today: '2026-10-15',
      timeZone: UTC,
    })
    expect(utc.spent).toBe(0)
  })

  it('handles February in leap and common years', () => {
    const feb28 = periodContaining('2026-02-10', 'monthly', 1)
    const s = computeBudgetStatus(food, [tx('2026-02-28T12:00:00Z', 1_000)], feb28, {
      today: '2026-02-10',
      timeZone: UTC,
    })
    expect(s.totalDays).toBe(28)
    expect(s.spent).toBe(1_000)
    const leap = periodContaining('2028-02-10', 'monthly', 1)
    const l = computeBudgetStatus(food, [tx('2028-02-29T12:00:00Z', 1_000)], leap, {
      today: '2028-02-10',
      timeZone: UTC,
    })
    expect(l.totalDays).toBe(29)
    expect(l.spent).toBe(1_000)
  })

  it('handles a December period ending in the next year', () => {
    const dec = periodContaining('2026-12-20', 'monthly', 1)
    const s = computeBudgetStatus(
      food,
      [tx('2026-12-31T23:00:00Z', 1_000), tx('2027-01-01T00:00:00Z', 2_000)],
      dec,
      { today: '2026-12-31', timeZone: UTC },
    )
    expect(s.spent).toBe(1_000)
    expect(s.daysLeft).toBe(1)
  })

  it('keeps day buckets right across a daylight-saving change', () => {
    // Europe/London switches to BST on 29 Mar 2026.
    const mar = periodContaining('2026-03-15', 'monthly', 1)
    const s = computeBudgetStatus(
      food,
      [tx('2026-03-28T23:30:00Z', 1_000), tx('2026-03-29T23:30:00Z', 2_000)],
      mar,
      { today: '2026-03-31', timeZone: 'Europe/London' },
    )
    expect(s.byDay).toHaveLength(31)
    expect(s.byDay.find((d) => d.date === '2026-03-28')?.amount).toBe(1_000)
    // 23:30 UTC on 29 Mar is 00:30 BST on 30 Mar.
    expect(s.byDay.find((d) => d.date === '2026-03-30')?.amount).toBe(2_000)
  })
})

describe('computeBudgetStatus: weekly budgets and weekStartsOn', () => {
  const weekly: StatusBudget = { ...food, amount: 70_000 }
  // Sunday 4 Oct 2026, 12:00 UTC.
  const sunday = tx('2026-10-04T12:00:00Z', 7_000)
  const monday = tx('2026-10-05T12:00:00Z', 3_000)

  it('counts Sunday in a Monday-start week ending that day', () => {
    const week = periodContaining('2026-10-03', 'weekly', 1)
    const s = computeBudgetStatus(weekly, [sunday, monday], week, {
      today: '2026-10-03',
      timeZone: UTC,
    })
    expect(s.spent).toBe(7_000)
    expect(s.totalDays).toBe(7)
    expect(s.daysLeft).toBe(2) // Saturday and Sunday
  })

  it('counts Sunday as the first day of a Sunday-start week', () => {
    const week = periodContaining('2026-10-04', 'weekly', 0)
    const s = computeBudgetStatus(weekly, [sunday, monday], week, {
      today: '2026-10-04',
      timeZone: UTC,
    })
    expect(s.spent).toBe(10_000)
    expect(s.daysLeft).toBe(7)
  })
})

describe('computeBudgetStatus: limits, colour and thresholds', () => {
  const at = (spent: number) =>
    computeBudgetStatus(food, spent ? [tx('2026-10-02T10:00:00Z', spent)] : [], oct, {
      today: '2026-10-15',
      timeZone: UTC,
    })

  it('is green below 80%, amber from 80% to 100%, red above 100%', () => {
    expect(at(0)).toMatchObject({ tone: 'ok', percent: 0, crossed: [] })
    expect(at(399_999)).toMatchObject({ tone: 'ok', crossed: [] })
    expect(at(400_000)).toMatchObject({ tone: 'warning', percent: 80, crossed: [80] })
    expect(at(500_000)).toMatchObject({ tone: 'warning', remaining: 0, crossed: [80, 100] })
    expect(at(500_001)).toMatchObject({ tone: 'over', remaining: -1, crossed: [80, 100] })
  })

  it('reports custom thresholds in ascending order', () => {
    const s = computeBudgetStatus(
      { ...food, alertThresholds: [100, 50, 90] },
      [tx('2026-10-02T10:00:00Z', 460_000)],
      oct,
      { today: '2026-10-15', timeZone: UTC },
    )
    expect(s.crossed).toEqual([50, 90])
  })

  it('handles limits of zero or less', () => {
    expect(percentOf(0, 0)).toBe(0)
    expect(percentOf(1, 0)).toBe(Number.POSITIVE_INFINITY)
    expect(toneOf(0, 0)).toBe('ok')
    expect(toneOf(0, -5)).toBe('over')
    expect(toneOf(1, 0)).toBe('over')
  })
})

describe('computeBudgetStatus: rollover', () => {
  const rolling: StatusBudget = { ...food, rollover: true }
  const opts = { today: '2026-10-15', timeZone: UTC }

  it('adds last period underspend to the limit', () => {
    const s = computeBudgetStatus(rolling, [tx('2026-09-10T10:00:00Z', 300_000)], oct, opts)
    expect(s).toMatchObject({ baseLimit: 500_000, carryOver: 200_000, limit: 700_000, spent: 0 })
  })

  it('subtracts last period overspend from the limit', () => {
    const s = computeBudgetStatus(
      rolling,
      [tx('2026-09-10T10:00:00Z', 650_000), tx('2026-10-02T10:00:00Z', 300_000)],
      oct,
      opts,
    )
    expect(s).toMatchObject({ carryOver: -150_000, limit: 350_000, spent: 300_000 })
    expect(s.tone).toBe('warning') // 85.7%
  })

  it('carries the full amount when nothing was spent last period', () => {
    const s = computeBudgetStatus(rolling, [], oct, opts)
    expect(s.carryOver).toBe(500_000)
    expect(s.limit).toBe(1_000_000)
  })

  it('carries one period only and ignores older periods', () => {
    const s = computeBudgetStatus(rolling, [tx('2026-08-10T10:00:00Z', 500_000)], oct, opts)
    expect(s.carryOver).toBe(500_000)
  })

  it('ignores last period when rollover is off', () => {
    const s = computeBudgetStatus(food, [tx('2026-09-10T10:00:00Z', 100_000)], oct, opts)
    expect(s).toMatchObject({ carryOver: 0, limit: 500_000 })
  })

  it('uses the user timezone to decide which period a boundary expense belongs to', () => {
    // 1 Oct in India, 30 Sep in New York.
    const boundary = tx('2026-09-30T20:00:00Z', 100_000)
    const india = computeBudgetStatus(rolling, [boundary], oct, {
      today: '2026-10-15',
      timeZone: 'Asia/Kolkata',
    })
    expect(india).toMatchObject({ carryOver: 500_000, spent: 100_000 })
    const newYork = computeBudgetStatus(rolling, [boundary], oct, {
      today: '2026-10-15',
      timeZone: 'America/New_York',
    })
    expect(newYork).toMatchObject({ carryOver: 400_000, spent: 0 })
  })

  it('never carries from a period that ended before the budget start date', () => {
    // Started 1 Sep: September can carry into October, August can't carry into September.
    const started = { ...rolling, startDate: '2026-09-01T00:00:00.000Z' }
    const txs = [tx('2026-09-10T10:00:00Z', 200_000)]
    expect(computeBudgetStatus(started, txs, oct, opts).carryOver).toBe(300_000)
    const sep = shiftPeriod(oct, -1)
    expect(computeBudgetStatus(started, txs, sep, opts)).toMatchObject({
      carryOver: 0,
      limit: 500_000,
      spent: 200_000,
    })
  })

  it('reads the start date in the user timezone', () => {
    // Local midnight 1 Sep in India is 31 Aug 18:30 UTC.
    const started = { ...rolling, startDate: '2026-08-31T18:30:00.000Z' }
    const sep = shiftPeriod(oct, -1)
    expect(
      computeBudgetStatus(started, [], sep, { today: '2026-10-15', timeZone: 'Asia/Kolkata' })
        .carryOver,
    ).toBe(0)
    expect(
      computeBudgetStatus(started, [], oct, { today: '2026-10-15', timeZone: 'Asia/Kolkata' })
        .carryOver,
    ).toBe(500_000)
  })

  it('rolls over weekly budgets from the previous week', () => {
    const week = periodContaining('2026-10-03', 'weekly', 1) // Mon 28 Sep – Sun 4 Oct
    const s = computeBudgetStatus(
      { ...rolling, amount: 70_000 },
      [tx('2026-09-27T12:00:00Z', 50_000), tx('2026-09-20T12:00:00Z', 70_000)],
      week,
      { today: '2026-10-03', timeZone: UTC },
    )
    expect(s.carryOver).toBe(20_000)
  })
})

describe('computeBudgetStatus: days left, allowance and projection', () => {
  it('works out the current period', () => {
    // 15 Oct: 17 days left including today, 15 days elapsed.
    const s = computeBudgetStatus(food, [tx('2026-10-02T10:00:00Z', 150_000)], oct, {
      today: '2026-10-15',
      timeZone: UTC,
    })
    expect(s.timing).toBe('current')
    expect(s.totalDays).toBe(31)
    expect(s.daysLeft).toBe(17)
    expect(s.dailyAllowance).toBe(Math.floor(350_000 / 17)) // 20588
    expect(s.projected).toBe(310_000) // 150000 / 15 * 31
  })

  it('has a daily allowance of 0 once the limit is used up', () => {
    const s = computeBudgetStatus(food, [tx('2026-10-02T10:00:00Z', 600_000)], oct, {
      today: '2026-10-31',
      timeZone: UTC,
    })
    expect(s.daysLeft).toBe(1)
    expect(s.dailyAllowance).toBe(0)
    expect(s.projected).toBe(600_000)
  })

  it('projects on the first day from that day alone', () => {
    const s = computeBudgetStatus(food, [tx('2026-10-01T10:00:00Z', 10_000)], oct, {
      today: '2026-10-01',
      timeZone: UTC,
    })
    expect(s.daysLeft).toBe(31)
    expect(s.projected).toBe(310_000)
  })

  it('reports actual spend for past periods', () => {
    const sep = shiftPeriod(oct, -1)
    const s = computeBudgetStatus(food, [tx('2026-09-10T10:00:00Z', 420_000)], sep, {
      today: '2026-10-15',
      timeZone: UTC,
    })
    expect(s).toMatchObject({
      timing: 'past',
      daysLeft: 0,
      dailyAllowance: null,
      projected: 420_000,
      spent: 420_000,
      tone: 'warning',
    })
  })

  it('spreads the whole limit over a future period', () => {
    const nov = shiftPeriod(oct, 1)
    const s = computeBudgetStatus(food, [], nov, { today: '2026-10-15', timeZone: UTC })
    expect(s).toMatchObject({ timing: 'future', daysLeft: 30, projected: null })
    expect(s.dailyAllowance).toBe(Math.floor(500_000 / 30))
  })

  it('buckets spend by day for the chart', () => {
    const s = computeBudgetStatus(
      food,
      [
        tx('2026-10-02T08:00:00Z', 1_000),
        tx('2026-10-02T18:00:00Z', 2_000),
        tx('2026-10-05T10:00:00Z', 4_000),
      ],
      oct,
      { today: '2026-10-15', timeZone: UTC },
    )
    expect(s.byDay).toHaveLength(31)
    expect(s.byDay[0]).toEqual({ date: '2026-10-01', amount: 0 })
    expect(s.byDay[1]).toEqual({ date: '2026-10-02', amount: 3_000 })
    expect(s.byDay[4]).toEqual({ date: '2026-10-05', amount: 4_000 })
    expect(s.byDay.reduce((sum, d) => sum + d.amount, 0)).toBe(s.spent)
  })
})

describe('initialStartDate', () => {
  it('is the start of the previous period', () => {
    expect(initialStartDate('monthly', '2026-10-03', 1)).toBe('2026-09-01')
    expect(initialStartDate('monthly', '2026-01-15', 1)).toBe('2025-12-01')
    expect(initialStartDate('weekly', '2026-10-03', 1)).toBe('2026-09-21')
    expect(initialStartDate('weekly', '2026-10-04', 0)).toBe('2026-09-27')
  })
})

describe('loadRange and alertKey', () => {
  it('covers every period, plus the previous one for rollover', () => {
    const week = periodContaining('2026-10-03', 'weekly', 1)
    expect(loadRange([oct, week], false)).toEqual({ start: '2026-09-28', end: '2026-11-01' })
    expect(loadRange([oct, week], true)).toEqual({ start: '2026-09-01', end: '2026-11-01' })
    expect(loadRange([], true)).toBeNull()
  })

  it('builds one key per budget, period and threshold', () => {
    expect(alertKey('b1', oct, 80)).toBe('budget_b1_M2026-10-01_80')
  })
})
