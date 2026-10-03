import {
  CircleStop,
  EllipsisVertical,
  Pause,
  Pencil,
  Play,
  SkipForward,
  Trash2,
} from 'lucide-react'
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
import { formatCalendarDate } from '@/utils/dates'
import { formatMoney } from '@/utils/money'
import { describeRule } from '../engine'
import type { RecurringRule } from '../types'
import { ruleCost, ruleNextDate, ruleSchedule, ruleStatus } from '../utils'
import { ruleLabel } from './ruleLabel'

export interface RuleActions {
  onEdit: (rule: RecurringRule) => void
  onSkipNext: (rule: RecurringRule) => void
  onTogglePaused: (rule: RecurringRule) => void
  onEnd: (rule: RecurringRule) => void
  onDelete: (rule: RecurringRule) => void
}

interface Props extends RuleActions {
  rule: RecurringRule
  accounts: ReadonlyMap<string, Account>
  categories: ReadonlyMap<string, Category>
  baseCurrency: string
  locale?: string
}

export function RuleRow({ rule, accounts, categories, baseCurrency, locale, ...actions }: Props) {
  const { title, icon, color } = ruleLabel(rule, categories)
  const status = ruleStatus(rule)
  const next = ruleNextDate(rule)
  const t = rule.template
  const account = accounts.get(t.accountId)?.name ?? 'Unknown account'
  const amount = formatMoney(t.type === 'expense' ? -t.amount : t.amount, t.currency, locale)
  const monthly = ruleCost(rule).monthly
  const nextText =
    status === 'ended'
      ? 'Ended'
      : status === 'paused'
        ? 'Paused'
        : next
          ? `Next ${formatCalendarDate(next, locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}`
          : ''

  return (
    <li className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5">
      <ColoredIcon icon={icon} color={color} className={status === 'active' ? '' : 'opacity-50'} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <p className="truncate font-medium">{title}</p>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {rule.mode === 'auto' ? 'Auto' : 'Remind'}
          </span>
          {rule.pending && <PendingBadge />}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {describeRule(ruleSchedule(rule), locale)} · {account}
        </p>
        <p
          className={
            status === 'active' ? 'text-xs' : 'text-xs font-medium text-muted-foreground uppercase'
          }
        >
          {nextText}
        </p>
      </div>
      <div className="text-right">
        <p className="font-semibold tabular-nums">{amount}</p>
        {t.type === 'expense' && (
          <p className="text-xs text-muted-foreground tabular-nums">
            ≈ {formatMoney(monthly, baseCurrency, locale)}/mo
          </p>
        )}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions for ${title}`}>
            <EllipsisVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => actions.onEdit(rule)}>
            <Pencil aria-hidden />
            Edit
          </DropdownMenuItem>
          {status === 'active' && next && (
            <DropdownMenuItem onSelect={() => actions.onSkipNext(rule)}>
              <SkipForward aria-hidden />
              Skip next
            </DropdownMenuItem>
          )}
          {status !== 'ended' && (
            <DropdownMenuItem onSelect={() => actions.onTogglePaused(rule)}>
              {rule.paused ? <Play aria-hidden /> : <Pause aria-hidden />}
              {rule.paused ? 'Resume' : 'Pause'}
            </DropdownMenuItem>
          )}
          {status !== 'ended' && (
            <DropdownMenuItem onSelect={() => actions.onEnd(rule)}>
              <CircleStop aria-hidden />
              End now
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => actions.onDelete(rule)} className="text-destructive">
            <Trash2 aria-hidden />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  )
}
