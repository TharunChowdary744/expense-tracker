import type { Account } from '@/features/accounts/types'
import { cn } from '@/utils/cn'

interface Props {
  accounts: readonly Account[]
  selected: readonly string[]
  onChange: (ids: string[]) => void
}

const chip =
  'rounded-full border px-3 py-1 text-sm transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none'

/** Toggle chips to limit a report to some accounts ("All" clears the filter). */
export function AccountFilter({ accounts, selected, onChange }: Props) {
  const visible = accounts.filter((a) => !a.archived || selected.includes(a.id))
  if (visible.length < 2) return null
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id])
  return (
    <fieldset className="space-y-1">
      <legend className="text-xs font-medium text-muted-foreground">Accounts</legend>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          aria-pressed={selected.length === 0}
          onClick={() => onChange([])}
          className={cn(
            chip,
            selected.length === 0
              ? 'border-primary bg-primary text-primary-foreground'
              : 'hover:bg-accent',
          )}
        >
          All accounts
        </button>
        {visible.map((a) => {
          const on = selected.includes(a.id)
          return (
            <button
              key={a.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(a.id)}
              className={cn(
                chip,
                on ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent',
              )}
            >
              {a.name}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}
