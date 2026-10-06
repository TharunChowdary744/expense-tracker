import { ScrollView, StyleSheet } from 'react-native'
import type { Account } from '@/features/accounts/types'
import type { Category } from '@/features/categories/types'
import {
  DATE_PRESET_LABELS,
  DEFAULT_FILTERS,
  type TxFilters,
} from '@/features/transactions/filters'
import { TRANSACTION_TYPE_LABELS } from '@/features/transactions/schemas'
import { parseDateInput } from '@/features/transactions/utils'
import { formatMoney, toMinor } from '@/utils/money'
import { Button } from '@m/components/ui/Button'
import { Chip } from '@m/components/ui/Controls'

interface ChipItem {
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
}: {
  filters: TxFilters
  onChange: (filters: TxFilters) => void
  accounts: ReadonlyMap<string, Account>
  categories: ReadonlyMap<string, Category>
  baseCurrency: string
  locale?: string
}) {
  const chips: ChipItem[] = []
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
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityLabel="Active filters"
    >
      {chips.map((chip) => (
        <Chip key={chip.key} label={chip.label} onRemove={() => onChange(chip.remove)} />
      ))}
      <Button
        title="Clear all"
        variant="ghost"
        size="sm"
        onPress={() => onChange({ ...DEFAULT_FILTERS, sort: filters.sort })}
      />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  row: { gap: 8, alignItems: 'center', paddingRight: 8 },
})
