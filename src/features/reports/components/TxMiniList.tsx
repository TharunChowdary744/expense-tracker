import { useAppDispatch } from '@/app/hooks'
import type { Account } from '@/features/accounts/types'
import type { Category } from '@/features/categories/types'
import type { Transaction } from '@/features/transactions/types'
import { describeTransaction } from '@/features/transactions/utils'
import { dialogOpened } from '@/features/ui/slice'
import { cn } from '@/utils/cn'
import { calendarDate, formatCalendarDate } from '@/utils/dates'
import { formatMoney } from '@/utils/money'

interface Props {
  label: string
  transactions: readonly Transaction[]
  accounts: ReadonlyMap<string, Account>
  categories: ReadonlyMap<string, Category>
  locale?: string
  /** Show at most this many (the rest are counted). */
  max?: number
}

/** A compact, read-mostly list of transactions; each row opens the edit sheet. */
export function TxMiniList({ label, transactions, accounts, categories, locale, max = 50 }: Props) {
  const dispatch = useAppDispatch()
  const shown = transactions.slice(0, max)
  return (
    <div className="space-y-2">
      <ul aria-label={label} className="divide-y rounded-lg border">
        {shown.map((tx) => {
          const { title, subtitle } = describeTransaction(tx, accounts, categories)
          const signed = tx.type === 'expense' ? -tx.amount : tx.amount
          const amount = formatMoney(signed, tx.currency, locale, {
            signDisplay: tx.type === 'income' ? 'always' : 'auto',
          })
          const day = formatCalendarDate(calendarDate(tx.date), locale, {
            day: 'numeric',
            month: 'short',
          })
          return (
            <li key={tx.id}>
              <button
                type="button"
                className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none"
                onClick={() =>
                  dispatch(dialogOpened({ kind: 'edit-transaction', transaction: tx }))
                }
                aria-label={`${title}, ${amount}, ${day}. Edit`}
              >
                <span className="w-14 shrink-0 text-xs text-muted-foreground tabular-nums">
                  {day}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
                </span>
                <span
                  className={cn(
                    'shrink-0 font-medium tabular-nums',
                    tx.type === 'income' && 'text-success',
                  )}
                >
                  {amount}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {transactions.length > shown.length && (
        <p className="text-xs text-muted-foreground">
          Showing {shown.length} of {transactions.length}.
        </p>
      )}
    </div>
  )
}
