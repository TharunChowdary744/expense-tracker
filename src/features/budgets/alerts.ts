import type { Category } from '@/features/categories/types'
import { formatMoney } from '@/utils/money'
import { periodContaining, periodLabel, type Period, type WeekStart } from './period'
import type { Budget, PlannedAlert } from './types'
import {
  alertKey,
  computeBudgetStatus,
  expandCategoryIds,
  loadRange,
  type StatusTransaction,
} from './utils'

/**
 * The periods to check for each budget after a transaction write: the current one plus the
 * ones containing any affected transaction date (so a backdated entry can alert too).
 */
export function periodsToCheck(
  budget: Pick<Budget, 'period'>,
  today: string,
  affectedDates: readonly string[],
  weekStartsOn: WeekStart,
): Period[] {
  const byKey = new Map<string, Period>()
  for (const date of [today, ...affectedDates]) {
    const period = periodContaining(date, budget.period, weekStartsOn)
    byKey.set(period.key, period)
  }
  return [...byKey.values()]
}

/** The date range to read so every budget's checked periods can be computed. */
export function alertLoadRange(
  budgets: readonly Budget[],
  today: string,
  affectedDates: readonly string[],
  weekStartsOn: WeekStart,
): { start: string; end: string } | null {
  const periods = budgets.flatMap((b) => periodsToCheck(b, today, affectedDates, weekStartsOn))
  return loadRange(
    periods,
    budgets.some((b) => b.rollover),
  )
}

/**
 * Every threshold a budget has reached in a checked period whose notification doesn't exist
 * yet (`existing` holds the ids already stored). Pure; the caller reads and writes Firestore.
 */
export function planBudgetAlerts(args: {
  budgets: readonly Budget[]
  transactions: readonly StatusTransaction[]
  categories: readonly Pick<Category, 'id' | 'parentId'>[]
  today: string
  affectedDates: readonly string[]
  weekStartsOn: WeekStart
  timeZone?: string
  existing: ReadonlySet<string>
}): PlannedAlert[] {
  const planned: PlannedAlert[] = []
  for (const budget of args.budgets) {
    const categoryIds = expandCategoryIds(budget.categoryIds, args.categories)
    for (const period of periodsToCheck(
      budget,
      args.today,
      args.affectedDates,
      args.weekStartsOn,
    )) {
      const status = computeBudgetStatus(budget, args.transactions, period, {
        today: args.today,
        timeZone: args.timeZone,
        categoryIds,
      })
      for (const threshold of status.crossed) {
        const id = alertKey(budget.id, period, threshold)
        if (args.existing.has(id)) continue
        planned.push({
          id,
          budgetId: budget.id,
          budgetName: budget.name,
          threshold,
          period,
          spent: status.spent,
          limit: status.limit,
        })
      }
    }
  }
  return planned
}

/** Title, body and link for a threshold notification. */
export function alertMessage(
  alert: PlannedAlert,
  baseCurrency: string,
  locale?: string,
): { title: string; body: string; link: string } {
  const money = (v: number) => formatMoney(v, baseCurrency, locale)
  const when = periodLabel(alert.period, locale)
  const title =
    alert.threshold >= 100
      ? `${alert.budgetName} budget: ${alert.threshold}% reached`
      : `${alert.budgetName} budget: ${alert.threshold}% used`
  const over = alert.spent - alert.limit
  const body =
    over > 0
      ? `You've spent ${money(alert.spent)} of ${money(alert.limit)} for ${when}, ${money(over)} over.`
      : `You've spent ${money(alert.spent)} of ${money(alert.limit)} for ${when}.`
  return { title, body, link: `/budgets/${alert.budgetId}?at=${alert.period.start}` }
}

/** For toasts: only the highest new threshold of each budget and period. */
export function highestPerBudget<T extends PlannedAlert>(alerts: readonly T[]): T[] {
  const best = new Map<string, T>()
  for (const alert of alerts) {
    const key = `${alert.budgetId}_${alert.period.key}`
    const current = best.get(key)
    if (!current || alert.threshold > current.threshold) best.set(key, alert)
  }
  return [...best.values()]
}
