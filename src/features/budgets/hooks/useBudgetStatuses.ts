import { skipToken } from '@reduxjs/toolkit/query/react'
import { useMemo } from 'react'
import { useUid } from '@/features/auth/hooks'
import { useGetCategoriesQuery } from '@/features/categories/api'
import type { Transaction } from '@/features/transactions/types'
import { useGetExpensesInRangeQuery } from '../api'
import type { Period } from '../period'
import type { Budget } from '../types'
import { computeBudgetStatus, expandCategoryIds, loadRange, type BudgetStatus } from '../utils'

/** Live status of each budget in `period` (budgets must share the period's kind). */
export function useBudgetStatuses(budgets: readonly Budget[], period: Period, today: string) {
  const uid = useUid()
  const categoriesQuery = useGetCategoriesQuery(uid)
  const range = loadRange(
    budgets.length > 0 ? [period] : [],
    budgets.some((b) => b.rollover),
  )
  const expensesQuery = useGetExpensesInRangeQuery(range ? { uid, ...range } : skipToken)
  const categories = categoriesQuery.data
  const expenses = expensesQuery.data

  const statuses = useMemo(() => {
    const map = new Map<string, BudgetStatus<Transaction>>()
    if (!expenses || !categories) return map
    for (const budget of budgets) {
      map.set(
        budget.id,
        computeBudgetStatus(budget, expenses, period, {
          today,
          categoryIds: expandCategoryIds(budget.categoryIds, categories),
        }),
      )
    }
    return map
  }, [budgets, expenses, categories, period, today])

  return {
    statuses,
    categories: categories ?? [],
    isLoading:
      budgets.length > 0 &&
      (expensesQuery.isLoading || categoriesQuery.isLoading || !expenses || !categories),
    error: expensesQuery.error ?? categoriesQuery.error,
    refetch: () => {
      void expensesQuery.refetch()
      void categoriesQuery.refetch()
    },
  }
}
