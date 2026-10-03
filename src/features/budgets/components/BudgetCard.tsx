import { EllipsisVertical, Pencil, Trash2 } from 'lucide-react'
import { Link } from 'react-router'
import { PendingBadge } from '@/components/PendingBadge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import type { Transaction } from '@/features/transactions/types'
import type { Budget } from '../types'
import type { BudgetStatus } from '../utils'
import { BudgetSummary } from './BudgetSummary'

interface Props {
  budget: Budget
  scope: string
  status: BudgetStatus<Transaction> | undefined
  currency: string
  locale?: string
  onEdit: () => void
  onDelete: () => void
}

export function BudgetCard({ budget, scope, status, currency, locale, onEdit, onDelete }: Props) {
  const link = `/budgets/${budget.id}${status ? `?at=${status.period.start}` : ''}`
  return (
    <li className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link
              to={link}
              className="truncate font-semibold underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {budget.name}
            </Link>
            {budget.pending && <PendingBadge />}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {scope}
            {budget.rollover && ' · Rollover'}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`Actions for ${budget.name}`}>
              <EllipsisVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil aria-hidden />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onDelete} className="text-destructive">
              <Trash2 aria-hidden />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {status ? (
        <BudgetSummary name={budget.name} status={status} currency={currency} locale={locale} />
      ) : (
        <div className="space-y-3">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-2.5 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}
    </li>
  )
}
