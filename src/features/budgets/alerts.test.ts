import { describe, expect, it } from 'vitest'
import {
  alertLoadRange,
  alertMessage,
  highestPerBudget,
  periodsToCheck,
  planBudgetAlerts,
} from './alerts'
import { affectedDates } from './listener'
import { periodContaining } from './period'
import type { Budget } from './types'
import type { StatusTransaction } from './utils'

function budget(overrides: Partial<Budget> = {}): Budget {
  return {
    id: 'food-budget',
    name: 'Food',
    period: 'monthly',
    categoryIds: ['food'],
    amount: 500_000,
    rollover: false,
    alertThresholds: [80, 100],
    startDate: '2026-09-01T00:00:00.000Z',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    createdBy: 'alice',
    pending: false,
    ...overrides,
  }
}

const expense = (date: string, baseAmount: number, categoryId = 'food'): StatusTransaction => ({
  type: 'expense',
  baseAmount,
  categoryId,
  date,
})

const base = {
  categories: [],
  today: '2026-10-15',
  affectedDates: [] as string[],
  weekStartsOn: 1 as const,
  timeZone: 'UTC',
  existing: new Set<string>(),
}

describe('planBudgetAlerts', () => {
  it('plans nothing below the first threshold', () => {
    const planned = planBudgetAlerts({
      ...base,
      budgets: [budget()],
      transactions: [expense('2026-10-02T10:00:00Z', 399_999)],
    })
    expect(planned).toEqual([])
  })

  it('plans the 80% alert once spending reaches it', () => {
    const planned = planBudgetAlerts({
      ...base,
      budgets: [budget()],
      transactions: [expense('2026-10-02T10:00:00Z', 410_000)],
    })
    expect(planned).toEqual([
      expect.objectContaining({
        id: 'budget_food-budget_M2026-10-01_80',
        threshold: 80,
        spent: 410_000,
        limit: 500_000,
      }),
    ])
  })

  it('does not plan alerts that already exist (no repeat on the next expense)', () => {
    const planned = planBudgetAlerts({
      ...base,
      budgets: [budget()],
      transactions: [expense('2026-10-02T10:00:00Z', 410_000), expense('2026-10-03T10:00:00Z', 1)],
      existing: new Set(['budget_food-budget_M2026-10-01_80']),
    })
    expect(planned).toEqual([])
  })

  it('plans the 100% alert after the 80% one exists', () => {
    const planned = planBudgetAlerts({
      ...base,
      budgets: [budget()],
      transactions: [expense('2026-10-02T10:00:00Z', 510_000)],
      existing: new Set(['budget_food-budget_M2026-10-01_80']),
    })
    expect(planned.map((p) => p.threshold)).toEqual([100])
  })

  it('checks the period of a backdated entry as well as the current one', () => {
    const planned = planBudgetAlerts({
      ...base,
      budgets: [budget()],
      transactions: [expense('2026-09-12T10:00:00Z', 450_000)],
      affectedDates: ['2026-09-12'],
    })
    expect(planned.map((p) => p.id)).toEqual(['budget_food-budget_M2026-09-01_80'])
  })

  it('counts subcategories of a selected parent and skips other budgets', () => {
    const planned = planBudgetAlerts({
      ...base,
      budgets: [budget(), budget({ id: 'rent', name: 'Rent', categoryIds: ['rent'] })],
      categories: [
        { id: 'food', parentId: null },
        { id: 'groceries', parentId: 'food' },
      ],
      transactions: [expense('2026-10-02T10:00:00Z', 420_000, 'groceries')],
    })
    expect(planned.map((p) => p.budgetId)).toEqual(['food-budget'])
  })

  it('includes rollover in the limit', () => {
    const planned = planBudgetAlerts({
      ...base,
      budgets: [budget({ rollover: true })],
      transactions: [
        expense('2026-09-10T10:00:00Z', 100_000), // 4,000 carried over: limit 9,000
        expense('2026-10-02T10:00:00Z', 450_000),
      ],
    })
    expect(planned).toEqual([])
  })
})

describe('periodsToCheck and alertLoadRange', () => {
  it('dedupes periods and loads the previous period for rollover budgets', () => {
    expect(periodsToCheck(budget(), '2026-10-15', ['2026-10-02', '2026-09-30'], 1)).toHaveLength(2)
    expect(alertLoadRange([budget()], '2026-10-15', [], 1)).toEqual({
      start: '2026-10-01',
      end: '2026-11-01',
    })
    expect(alertLoadRange([budget({ rollover: true })], '2026-10-15', [], 1)).toEqual({
      start: '2026-09-01',
      end: '2026-11-01',
    })
    expect(alertLoadRange([], '2026-10-15', [], 1)).toBeNull()
  })
})

describe('alertMessage and highestPerBudget', () => {
  const oct = periodContaining('2026-10-15', 'monthly', 1)
  const alert = (threshold: number, spent: number) => ({
    id: `budget_b_${oct.key}_${threshold}`,
    budgetId: 'b',
    budgetName: 'Food',
    threshold,
    period: oct,
    spent,
    limit: 500_000,
  })

  it('writes a title, body and link', () => {
    expect(alertMessage(alert(80, 410_000), 'INR', 'en-IN')).toEqual({
      title: 'Food budget: 80% used',
      body: "You've spent ₹4,100.00 of ₹5,000.00 for October 2026.",
      link: '/budgets/b?at=2026-10-01',
    })
    expect(alertMessage(alert(100, 520_000), 'INR', 'en-IN')).toMatchObject({
      title: 'Food budget: 100% reached',
      body: "You've spent ₹5,200.00 of ₹5,000.00 for October 2026, ₹200.00 over.",
    })
  })

  it('keeps one toast per budget and period: the highest threshold', () => {
    expect(highestPerBudget([alert(80, 1), alert(100, 1)]).map((a) => a.threshold)).toEqual([100])
  })
})

describe('affectedDates', () => {
  const action = (endpointName: string, originalArgs: unknown) => ({
    meta: { arg: { endpointName, originalArgs } },
  })

  it('reads the dates each transaction write touched', () => {
    expect(affectedDates(action('createTransaction', { dateIso: 'a' }))).toEqual(['a'])
    expect(
      affectedDates(action('updateTransaction', { before: { date: 'a' }, dateIso: 'b' })),
    ).toEqual(['a', 'b'])
    expect(
      affectedDates(action('deleteTransactions', { transactions: [{ date: 'a' }, { date: 'b' }] })),
    ).toEqual(['a', 'b'])
    expect(affectedDates(action('recategorizeTransactions', { ids: ['x'] }))).toEqual([])
  })
})
