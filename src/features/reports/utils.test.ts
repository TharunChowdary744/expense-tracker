import { describe, expect, it } from 'vitest'
import { computeDashboard, computeReport } from './compute'
import { selectDrill, selectReport } from './selectors'
import { UNCATEGORISED, type ReportCategory, type ReportTx } from './types'
import {
  calendarWeeks,
  categorySpend,
  comparePeriods,
  dailyFlow,
  deltaPercent,
  filterTransactions,
  heatLevel,
  monthKeys,
  monthlyTotals,
  newestFirst,
  previousRange,
  rangeLabel,
  resolvePreset,
  sliceTransactions,
  spanOf,
  tagTotals,
  topPayees,
  totals,
  trailingMonths,
} from './utils'

const TZ = 'Asia/Kolkata'

let seq = 0
function tx(partial: Partial<ReportTx> & Pick<ReportTx, 'type' | 'baseAmount' | 'date'>): ReportTx {
  seq += 1
  return {
    id: `t${seq}`,
    amount: partial.baseAmount,
    currency: 'INR',
    accountId: 'bank',
    payee: '',
    note: '',
    tags: [],
    ...partial,
  }
}

const cat = (
  id: string,
  name: string,
  parentId: string | null = null,
  kind: 'expense' | 'income' = 'expense',
): ReportCategory => ({ id, name, kind, parentId, color: '#ea580c', order: 0 })

const categories = [
  cat('food', 'Food'),
  cat('groceries', 'Groceries', 'food'),
  cat('dining', 'Dining', 'food'),
  cat('transport', 'Transport'),
  cat('salary', 'Salary', null, 'income'),
]

// 2026-10-01T00:30+05:30 is still 30 Sep in UTC: dates must use the given timezone.
const earlyOct1 = '2026-09-30T19:00:00.000Z'

const data: ReportTx[] = [
  tx({
    type: 'expense',
    baseAmount: 10000,
    date: earlyOct1,
    categoryId: 'groceries',
    payee: 'BigBasket',
    tags: ['home'],
  }),
  tx({
    type: 'expense',
    baseAmount: 5000,
    date: '2026-10-02T06:00:00.000Z',
    categoryId: 'dining',
    payee: 'bigbasket ',
  }),
  tx({
    type: 'expense',
    baseAmount: 2500,
    date: '2026-10-02T07:00:00.000Z',
    categoryId: 'food',
    payee: 'Cafe',
    tags: ['trip', 'home'],
  }),
  tx({
    type: 'expense',
    baseAmount: 3000,
    date: '2026-10-03T07:00:00.000Z',
    categoryId: 'transport',
    payee: 'Uber',
    accountId: 'card',
  }),
  tx({ type: 'expense', baseAmount: 700, date: '2026-10-03T08:00:00.000Z' }),
  tx({
    type: 'income',
    baseAmount: 100000,
    date: '2026-10-01T05:00:00.000Z',
    categoryId: 'salary',
    tags: ['trip'],
  }),
  tx({
    type: 'transfer',
    baseAmount: 20000,
    date: '2026-10-02T05:00:00.000Z',
    toAccountId: 'card',
  }),
  // September
  tx({
    type: 'expense',
    baseAmount: 8000,
    date: '2026-09-15T05:00:00.000Z',
    categoryId: 'groceries',
  }),
  tx({
    type: 'expense',
    baseAmount: 4000,
    date: '2026-09-20T05:00:00.000Z',
    categoryId: 'transport',
  }),
  tx({ type: 'income', baseAmount: 90000, date: '2026-09-01T05:00:00.000Z', categoryId: 'salary' }),
]

const october = { start: '2026-10-01', end: '2026-10-04' }

describe('ranges', () => {
  const today = '2026-10-03'

  it('resolves presets ending today like the Transactions filters', () => {
    expect(resolvePreset('this-month', today)).toEqual({ start: '2026-10-01', end: '2026-10-04' })
    expect(resolvePreset('last-month', today)).toEqual({ start: '2026-09-01', end: '2026-10-01' })
    expect(resolvePreset('last-3-months', today)).toEqual({
      start: '2026-08-01',
      end: '2026-10-04',
    })
    expect(resolvePreset('last-12-months', today)).toEqual({
      start: '2025-11-01',
      end: '2026-10-04',
    })
    expect(resolvePreset('this-year', today)).toEqual({ start: '2026-01-01', end: '2026-10-04' })
  })

  it('resolves a custom range with an inclusive end, falling back when invalid', () => {
    expect(resolvePreset('custom', today, { from: '2026-02-10', to: '2026-02-20' })).toEqual({
      start: '2026-02-10',
      end: '2026-02-21',
    })
    expect(resolvePreset('custom', today, { from: '2026-02-20', to: '2026-02-10' })).toEqual({
      start: '2026-10-01',
      end: '2026-10-04',
    })
    expect(resolvePreset('custom', today, { from: 'nope', to: '' }).start).toBe('2026-10-01')
  })

  it('compares month-aligned ranges with whole months and others with equal days', () => {
    expect(previousRange({ start: '2026-10-01', end: '2026-10-04' })).toEqual({
      start: '2026-09-01',
      end: '2026-10-01',
    })
    expect(previousRange({ start: '2026-09-01', end: '2026-10-01' })).toEqual({
      start: '2026-08-01',
      end: '2026-09-01',
    })
    expect(previousRange({ start: '2026-08-01', end: '2026-10-04' })).toEqual({
      start: '2026-05-01',
      end: '2026-08-01',
    })
    expect(previousRange({ start: '2026-01-01', end: '2026-10-04' })).toEqual({
      start: '2025-01-01',
      end: '2026-01-01',
    })
    expect(previousRange({ start: '2026-02-10', end: '2026-02-21' })).toEqual({
      start: '2026-01-30',
      end: '2026-02-10',
    })
  })

  it('lists months, trailing months and spans', () => {
    expect(monthKeys({ start: '2026-08-15', end: '2026-10-02' })).toEqual([
      '2026-08',
      '2026-09',
      '2026-10',
    ])
    expect(monthKeys({ start: '2026-09-01', end: '2026-10-01' })).toEqual(['2026-09'])
    const trend = trailingMonths(october)
    expect(trend).toEqual({ start: '2025-11-01', end: '2026-11-01' })
    expect(monthKeys(trend)).toHaveLength(12)
    expect(spanOf([october, { start: '2026-09-01', end: '2026-10-01' }])).toEqual({
      start: '2026-09-01',
      end: '2026-10-04',
    })
  })

  it('labels ranges', () => {
    expect(rangeLabel({ start: '2026-09-01', end: '2026-10-01' }, 'en-GB')).toBe('September 2026')
    expect(rangeLabel(october, 'en-GB')).toBe('1 Oct – 3 Oct 2026')
    expect(rangeLabel({ start: '2026-10-03', end: '2026-10-04' }, 'en-GB')).toBe('3 Oct 2026')
  })
})

describe('totals and filtering', () => {
  it('filters by calendar date in the timezone and by either account side', () => {
    const oct = filterTransactions(data, { range: october, accountIds: [] }, TZ)
    expect(oct).toHaveLength(7)
    expect(oct.some((t) => t.date === earlyOct1)).toBe(true)
    const utc = filterTransactions(data, { range: october, accountIds: [] }, 'UTC')
    expect(utc.some((t) => t.date === earlyOct1)).toBe(false)
    const card = filterTransactions(data, { range: october, accountIds: ['card'] }, TZ)
    expect(card.map((t) => t.type).sort()).toEqual(['expense', 'transfer'])
  })

  it('sums income and expenses, ignoring transfers', () => {
    const oct = filterTransactions(data, { range: october, accountIds: [] }, TZ)
    expect(totals(oct)).toEqual({ income: 100000, expense: 21200, net: 78800, count: 6 })
    expect(totals([])).toEqual({ income: 0, expense: 0, net: 0, count: 0 })
  })

  it('computes a percentage change, or null from zero', () => {
    expect(deltaPercent(150, 100)).toBe(50)
    expect(deltaPercent(50, 100)).toBe(-50)
    expect(deltaPercent(10, 0)).toBeNull()
    expect(deltaPercent(-50, -100)).toBe(50)
  })
})

describe('categories', () => {
  const oct = filterTransactions(data, { range: october, accountIds: [] }, TZ)

  it('rolls subcategories into top-level categories, largest first', () => {
    const slices = categorySpend(oct, categories)
    expect(slices.map((s) => [s.id, s.amount, s.count])).toEqual([
      ['food', 17500, 3],
      ['transport', 3000, 1],
      [UNCATEGORISED, 700, 1],
    ])
    expect(slices[0]?.hasChildren).toBe(true)
    expect(slices[1]?.hasChildren).toBe(false)
    expect(slices.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1)
    expect(slices[2]?.name).toBe('Uncategorised')
  })

  it('splits a parent into subcategories plus its own spending', () => {
    const slices = categorySpend(oct, categories, 'food')
    expect(slices.map((s) => [s.id, s.amount, s.isParentSelf])).toEqual([
      ['groceries', 10000, false],
      ['dining', 5000, false],
      ['food', 2500, true],
    ])
    expect(slices[2]?.name).toBe('Food (no subcategory)')
  })

  it('lists the transactions behind a slice', () => {
    const food = sliceTransactions(oct, categories, { id: 'food', isParentSelf: false }, null)
    expect(food).toHaveLength(3)
    expect((food[0]?.date ?? '') >= (food[1]?.date ?? '')).toBe(true)
    const self = sliceTransactions(oct, categories, { id: 'food', isParentSelf: true }, 'food')
    expect(self.map((t) => t.categoryId)).toEqual(['food'])
    const none = sliceTransactions(
      oct,
      categories,
      { id: UNCATEGORISED, isParentSelf: false },
      null,
    )
    expect(none.map((t) => t.baseAmount)).toEqual([700])
  })

  it('treats a missing category as uncategorised', () => {
    const slices = categorySpend(
      [tx({ type: 'expense', baseAmount: 5, date: earlyOct1, categoryId: 'deleted' })],
      categories,
    )
    expect(slices[0]?.id).toBe(UNCATEGORISED)
  })
})

describe('over time', () => {
  it('totals each month, zero-filled', () => {
    const months = monthlyTotals(data, ['2026-08', '2026-09', '2026-10'], TZ)
    expect(months).toEqual([
      { month: '2026-08', income: 0, expense: 0, net: 0, count: 0 },
      { month: '2026-09', income: 90000, expense: 12000, net: 78000, count: 3 },
      { month: '2026-10', income: 100000, expense: 21200, net: 78800, count: 6 },
    ])
  })

  it('builds daily flow with a running net', () => {
    const flow = dailyFlow(data, october, TZ)
    expect(flow.map((d) => d.date)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03'])
    expect(flow.map((d) => [d.income, d.expense, d.cumulative])).toEqual([
      [100000, 10000, 90000],
      [0, 7500, 82500],
      [0, 3700, 78800],
    ])
  })

  it('lays out calendar weeks starting on the chosen weekday', () => {
    // 1 Oct 2026 is a Thursday.
    const monday = calendarWeeks({ start: '2026-10-01', end: '2026-11-01' }, 1)
    expect(monday[0]).toEqual([
      null,
      null,
      null,
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ])
    expect(monday.every((w) => w.length === 7)).toBe(true)
    expect(monday.flat().filter(Boolean)).toHaveLength(31)
    const sunday = calendarWeeks({ start: '2026-10-01', end: '2026-10-02' }, 0)
    expect(sunday).toEqual([[null, null, null, null, '2026-10-01', null, null]])
  })

  it('maps amounts to heat levels', () => {
    expect(heatLevel(0, 100)).toBe(0)
    expect(heatLevel(1, 100)).toBe(1)
    expect(heatLevel(50, 100)).toBe(2)
    expect(heatLevel(100, 100)).toBe(4)
  })
})

describe('payees, tags and comparison', () => {
  const oct = filterTransactions(data, { range: october, accountIds: [] }, TZ)

  it('ranks payees case-insensitively, skipping blanks and income', () => {
    expect(topPayees(oct)).toEqual([
      { payee: 'BigBasket', amount: 15000, count: 2 },
      { payee: 'Uber', amount: 3000, count: 1 },
      { payee: 'Cafe', amount: 2500, count: 1 },
    ])
    expect(topPayees(oct, 1)).toHaveLength(1)
  })

  it('totals tags, counting multi-tag transactions under each', () => {
    expect(tagTotals(oct)).toEqual([
      { tag: 'home', expense: 12500, income: 0, count: 2 },
      { tag: 'trip', expense: 2500, income: 100000, count: 2 },
    ])
  })

  it('compares two periods by category and in total', () => {
    const sep = filterTransactions(
      data,
      { range: { start: '2026-09-01', end: '2026-10-01' }, accountIds: [] },
      TZ,
    )
    const c = comparePeriods(oct, sep, categories)
    expect(c.rows.map((r) => [r.id, r.current, r.previous, r.change])).toEqual([
      ['food', 17500, 8000, 9500],
      ['transport', 3000, 4000, -1000],
      [UNCATEGORISED, 700, 0, 700],
    ])
    expect(c.rows[2]?.changePercent).toBeNull()
    expect(c.expense).toMatchObject({ current: 21200, previous: 12000, change: 9200 })
    expect(c.net).toMatchObject({ current: 78800, previous: 78000 })
  })

  it('includes categories that only had spending before', () => {
    const c = comparePeriods([], data.slice(7), categories)
    expect(c.rows.map((r) => [r.id, r.current, r.previous])).toEqual([
      ['food', 0, 8000],
      ['transport', 0, 4000],
    ])
  })

  it('sorts newest first with a stable tie-break', () => {
    const a = tx({ type: 'expense', baseAmount: 1, date: '2026-10-01T00:00:00.000Z' })
    const b = { ...a, id: 'zz' }
    const c = tx({ type: 'expense', baseAmount: 1, date: '2026-10-02T00:00:00.000Z' })
    expect(newestFirst([a, b, c]).map((t) => t.id)).toEqual([c.id, 'zz', a.id])
  })
})

describe('computeReport and selectors', () => {
  const params = {
    range: october,
    previous: previousRange(october),
    trend: trailingMonths(october),
    accountIds: [] as string[],
    timeZone: TZ,
  }

  it('computes every section', () => {
    const r = computeReport(data, categories, params)
    expect(r.totals.expense).toBe(21200)
    expect(r.previousTotals.expense).toBe(12000)
    expect(r.monthlyTrend).toHaveLength(12)
    expect(r.monthlyTrend.at(-1)).toMatchObject({ month: '2026-10', expense: 21200 })
    expect(r.incomeVsExpense).toHaveLength(1)
    expect(r.flow).toHaveLength(3)
    expect(r.byCategory[0]?.id).toBe('food')
    expect(r.payees[0]?.payee).toBe('BigBasket')
    expect(r.tags).toHaveLength(2)
  })

  it('applies the account filter', () => {
    const r = computeReport(data, categories, { ...params, accountIds: ['card'] })
    expect(r.totals).toEqual({ income: 0, expense: 3000, net: -3000, count: 1 })
  })

  it('memoises on input identity', () => {
    const first = selectReport(data, categories, params)
    expect(selectReport(data, categories, params)).toBe(first)
    expect(selectReport([...data], categories, params)).not.toBe(first)
  })

  it('drills into a category and lists its transactions', () => {
    const oct = filterTransactions(data, { range: october, accountIds: [] }, TZ)
    const top = selectDrill(oct, categories, { parentId: null, sliceId: null })
    expect(top.transactions).toEqual([])
    const food = selectDrill(oct, categories, { parentId: 'food', sliceId: null })
    expect(food.slices.map((s) => s.id)).toEqual(['groceries', 'dining', 'food'])
    expect(food.transactions).toHaveLength(3)
    const groceries = selectDrill(oct, categories, { parentId: 'food', sliceId: 'groceries' })
    expect(groceries.transactions.map((t) => t.baseAmount)).toEqual([10000])
    const transport = selectDrill(oct, categories, { parentId: null, sliceId: 'transport' })
    expect(transport.transactions).toHaveLength(1)
  })

  it('summarises the dashboard with the top five categories', () => {
    const d = computeDashboard(data, categories, {
      range: october,
      previous: previousRange(october),
      timeZone: TZ,
    })
    expect(d.totals.expense).toBe(21200)
    expect(d.previousTotals.expense).toBe(12000)
    expect(d.topCategories.length).toBeLessThanOrEqual(5)
    expect(d.topCategories[0]?.id).toBe('food')
  })
})
