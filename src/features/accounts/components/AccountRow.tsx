import { Archive, ArchiveRestore, EllipsisVertical, Pencil } from 'lucide-react'
import { ColoredIcon } from '@/components/ColoredIcon'
import { PendingBadge } from '@/components/PendingBadge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/utils/cn'
import { formatMoney } from '@/utils/money'
import { ACCOUNT_TYPE_LABELS } from '../schemas'
import type { Account } from '../types'

interface Props {
  account: Account
  balance: number
  locale: string
  onEdit: () => void
  onToggleArchived: () => void
}

export function AccountRow({ account, balance, locale, onEdit, onToggleArchived }: Props) {
  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-lg border bg-card p-3',
        account.archived && 'opacity-70',
      )}
    >
      <ColoredIcon icon={account.icon} color={account.color} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{account.name}</p>
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>
            {ACCOUNT_TYPE_LABELS[account.type]} · {account.currency}
          </span>
          {account.archived && <span className="rounded-full bg-muted px-2 py-0.5">Archived</span>}
          {account.pending && <PendingBadge />}
        </p>
      </div>
      <p className={cn('text-right font-medium tabular-nums', balance < 0 && 'text-destructive')}>
        <span className="sr-only">Balance </span>
        {formatMoney(balance, account.currency, locale)}
      </p>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions for ${account.name}`}>
            <EllipsisVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil aria-hidden />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onToggleArchived}>
            {account.archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
            {account.archived ? 'Restore' : 'Archive'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  )
}
