import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Account } from '@/features/accounts/types'
import type { Category } from '@/features/categories/types'
import { formatMoney, toMinor } from '@/utils/money'
import { DATE_PRESET_LABELS, DEFAULT_FILTERS, type TxFilters } from '../filters'
import { TRANSACTION_TYPE_LABELS } from '../schemas'
import { parseDateInput } from '../utils'

interface Props {
  filters: TxFilters
  onChange: (filters: TxFilters) => void
  accounts: ReadonlyMap<string, Account>
  categories: ReadonlyMap<string, Category>
  baseCurrency: string
  locale?: string
}

interface Chip {
  key: string
  label: string
  remove: TxFilters
}

/** The active filters as removable chips, with "Clear all". */
export function ActiveFilters({
  filters,
  onChange,
  accounts,
  categories,
  baseCurrency,
  locale,
}: Props) {
  const chips: Chip[] = []
  const date = (value: string) => {
    const d = parseDateInput(value)
    return d ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(d) : '…'
  }
  const money = (value: string) => {
    try {
      return formatMoney(toMinor(value, baseCurrency), baseCurrency, locale)
    } catch {
      return value
    }
  }

  if (filters.search.trim()) {
    chips.push({
      key: 'q',
      label: `“${filters.search.trim()}”`,
      remove: { ...filters, search: '' },
    })
  }
  if (filters.range !== 'all') {
    chips.push({
      key: 'range',
      label:
        filters.range === 'custom'
          ? `${filters.from ? date(filters.from) : 'Any'} – ${filters.to ? date(filters.to) : 'Any'}`
          : DATE_PRESET_LABELS[filters.range],
      remove: { ...filters, range: 'all', from: '', to: '' },
    })
  }
  if (filters.type) {
    chips.push({
      key: 'type',
      label: TRANSACTION_TYPE_LABELS[filters.type],
      remove: { ...filters, type: null },
    })
  }
  for (const id of filters.accountIds) {
    chips.push({
      key: `acc-${id}`,
      label: accounts.get(id)?.name ?? 'Unknown account',
      remove: { ...filters, accountIds: filters.accountIds.filter((x) => x !== id) },
    })
  }
  for (const id of filters.categoryIds) {
    chips.push({
      key: `cat-${id}`,
      label: categories.get(id)?.name ?? 'Unknown category',
      remove: { ...filters, categoryIds: filters.categoryIds.filter((x) => x !== id) },
    })
  }
  for (const tag of filters.tags) {
    chips.push({
      key: `tag-${tag}`,
      label: `#${tag}`,
      remove: { ...filters, tags: filters.tags.filter((x) => x !== tag) },
    })
  }
  if (filters.min || filters.max) {
    chips.push({
      key: 'amount',
      label:
        filters.min && filters.max
          ? `${money(filters.min)} – ${money(filters.max)}`
          : filters.min
            ? `At least ${money(filters.min)}`
            : `At most ${money(filters.max)}`,
      remove: { ...filters, min: '', max: '' },
    })
  }

  if (chips.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ul className="contents" aria-label="Active filters">
        {chips.map((chip) => (
          <li
            key={chip.key}
            className="inline-flex items-center gap-1 rounded-full border bg-secondary py-0.5 pr-1 pl-3 text-sm"
          >
            {chip.label}
            <button
              type="button"
              aria-label={`Remove filter ${chip.label}`}
              onClick={() => onChange(chip.remove)}
              className="rounded-full p-1 hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <X className="size-3" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => onChange({ ...DEFAULT_FILTERS, sort: filters.sort })}
      >
        Clear all
      </Button>
    </div>
  )
}
