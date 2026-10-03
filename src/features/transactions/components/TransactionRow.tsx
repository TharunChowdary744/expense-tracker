import { ArrowLeftRight, Copy, EllipsisVertical, Pencil, Trash2 } from 'lucide-react'
import { memo } from 'react'
import { ColoredIcon } from '@/components/ColoredIcon'
import { PendingBadge } from '@/components/PendingBadge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Account } from '@/features/accounts/types'
import type { Category } from '@/features/categories/types'
import { cn } from '@/utils/cn'
import { formatMoney } from '@/utils/money'
import type { Transaction } from '../types'
import { describeTransaction } from '../utils'

interface Props {
  tx: Transaction
  accounts: ReadonlyMap<string, Account>
  categories: ReadonlyMap<string, Category>
  baseCurrency: string
  locale?: string
  selected: boolean
  /** Omit to show the row without a selection checkbox. */
  onToggleSelected?: (id: string) => void
  onEdit: (tx: Transaction) => void
  onDuplicate: (tx: Transaction) => void
  onDelete: (tx: Transaction) => void
}

export const TransactionRow = memo(function TransactionRow({
  tx,
  accounts,
  categories,
  baseCurrency,
  locale,
  selected,
  onToggleSelected,
  onEdit,
  onDuplicate,
  onDelete,
}: Props) {
  const { title, subtitle } = describeTransaction(tx, accounts, categories)
  const category = tx.categoryId ? categories.get(tx.categoryId) : undefined
  const sign = tx.type === 'expense' ? 'negative' : tx.type === 'income' ? 'positive' : 'none'
  const amount = formatMoney(
    tx.type === 'expense' ? -tx.amount : tx.amount,
    tx.currency,
    locale,
    sign === 'positive' ? { signDisplay: 'always' } : {},
  )
  const label = `${title}, ${amount}`

  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 transition-colors',
        selected && 'border-primary bg-accent/50',
      )}
    >
      {onToggleSelected && (
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelected(tx.id)}
          aria-label={`Select ${label}`}
          className="size-4 shrink-0 accent-primary"
        />
      )}
      <button
        type="button"
        onClick={() => onEdit(tx)}
        aria-label={`Edit ${label}`}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {tx.type === 'transfer' ? (
          <span
            aria-hidden
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted"
          >
            <ArrowLeftRight className="size-4 text-muted-foreground" />
          </span>
        ) : (
          <ColoredIcon icon={category?.icon ?? 'tag'} color={category?.color ?? '#64748b'} />
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate font-medium">{title}</span>
            {tx.pending && <PendingBadge />}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {subtitle}
            {tx.tags.length > 0 && ` · ${tx.tags.map((t) => `#${t}`).join(' ')}`}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span
            className={cn(
              'block font-medium tabular-nums',
              sign === 'positive' && 'text-success',
              sign === 'none' && 'text-muted-foreground',
            )}
          >
            {amount}
          </span>
          {tx.currency !== baseCurrency && (
            <span className="block text-xs text-muted-foreground tabular-nums">
              {formatMoney(tx.baseAmount, baseCurrency, locale)}
            </span>
          )}
        </span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions for ${label}`}>
            <EllipsisVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onEdit(tx)}>
            <Pencil aria-hidden />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onDuplicate(tx)}>
            <Copy aria-hidden />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onDelete(tx)} className="text-destructive">
            <Trash2 aria-hidden />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  )
})
