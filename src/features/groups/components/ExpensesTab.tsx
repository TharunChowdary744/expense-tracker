import { Plus, Receipt } from 'lucide-react'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ListStates'
import { PendingBadge } from '@/components/PendingBadge'
import { Button } from '@/components/ui/button'
import { formatCalendarDate, calendarDate } from '@/utils/dates'
import { cn } from '@/utils/cn'
import { formatMoney } from '@/utils/money'
import { groupCategoryLabel } from '../schemas'
import { memberEffect } from '../split'
import type { Group, GroupExpense } from '../types'
import { memberLabel } from '../utils'

interface Props {
  group: Group
  uid: string
  locale: string
  expenses: GroupExpense[] | undefined
  isLoading: boolean
  error: unknown
  onRetry: () => void
  onAdd: () => void
  onEdit: (expense: GroupExpense) => void
}

function paidByText(
  group: Group,
  expense: GroupExpense,
  uid: string,
  money: (n: number) => string,
) {
  const payers = Object.keys(expense.paidBy)
  if (payers.length === 1) {
    const payer = payers[0] as string
    return `${memberLabel(group, payer, uid)} paid ${money(expense.amount)}`
  }
  return `${payers.length} people paid ${money(expense.amount)}`
}

export function ExpensesTab({
  group,
  uid,
  locale,
  expenses,
  isLoading,
  error,
  onRetry,
  onAdd,
  onEdit,
}: Props) {
  const money = (minor: number) => formatMoney(minor, group.currency, locale)
  const addButton = (
    <Button onClick={onAdd}>
      <Plus aria-hidden />
      Add expense
    </Button>
  )

  if (isLoading) return <ListSkeleton label="Loading expenses" />
  if (error) {
    return <ErrorState title="Could not load expenses" message={String(error)} onRetry={onRetry} />
  }
  if (!expenses || expenses.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title="No expenses yet"
        description="Add what someone paid and how to split it."
        action={addButton}
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">{addButton}</div>
      <ul aria-label="Expenses" className="divide-y rounded-lg border bg-card">
        {expenses.map((expense) => {
          const effect = memberEffect(expense, uid)
          const involved = uid in expense.paidBy || uid in expense.shares
          const category = groupCategoryLabel(expense.categoryId)
          return (
            <li key={expense.id}>
              <button
                type="button"
                onClick={() => onEdit(expense)}
                className="flex w-full items-center gap-3 p-3 text-left outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <span className="w-12 shrink-0 text-center text-xs text-muted-foreground">
                  {formatCalendarDate(calendarDate(expense.date), locale, {
                    day: 'numeric',
                    month: 'short',
                  })}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium">{expense.description}</span>
                    {expense.pending && <PendingBadge />}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {paidByText(group, expense, uid, money)}
                    {category ? ` · ${category}` : ''}
                  </span>
                </span>
                <span className="text-right text-sm">
                  {!involved ? (
                    <span className="text-muted-foreground">not involved</span>
                  ) : effect === 0 ? (
                    <span className="text-muted-foreground">settled</span>
                  ) : (
                    <>
                      <span className="block text-xs text-muted-foreground">
                        {effect > 0 ? 'you lent' : 'you owe'}
                      </span>
                      <span
                        className={cn(
                          'font-medium tabular-nums',
                          effect > 0 ? 'text-success' : 'text-destructive',
                        )}
                      >
                        {money(Math.abs(effect))}
                      </span>
                    </>
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
