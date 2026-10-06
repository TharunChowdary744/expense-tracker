import { useState, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import type { Account } from '@/features/accounts/types'
import type { Category } from '@/features/categories/types'
import { buildCategoryTree } from '@/features/categories/utils'
import {
  DATE_PRESETS,
  DATE_PRESET_LABELS,
  DEFAULT_FILTERS,
  type DatePreset,
  type TxFilters,
} from '@/features/transactions/filters'
import { TRANSACTION_TYPES, TRANSACTION_TYPE_LABELS } from '@/features/transactions/schemas'
import { Button } from '@m/components/ui/Button'
import { Checkbox, DateField, Segmented } from '@m/components/ui/Controls'
import { TextField } from '@m/components/ui/Field'
import { SelectField } from '@m/components/ui/Select'
import { Sheet } from '@m/components/ui/Sheet'
import { Text } from '@m/components/ui/Text'
import { TagInput } from './TagInput'

interface Props {
  open: boolean
  onClose: () => void
  filters: TxFilters
  onApply: (filters: TxFilters) => void
  accounts: readonly Account[]
  categories: readonly Category[]
  knownTags: readonly string[]
  baseCurrency: string
}

const AMOUNT = /^\d+(\.\d+)?$/

export function FiltersSheet(props: Props) {
  return (
    <Sheet
      open={props.open}
      onClose={props.onClose}
      title="Filter transactions"
      subtitle="A transaction must match all of them."
    >
      {/* Remount per open so the draft starts from the current filters. */}
      {props.open ? <FiltersForm {...props} /> : null}
    </Sheet>
  )
}

function FiltersForm({
  filters,
  onApply,
  onClose,
  accounts,
  categories,
  knownTags,
  baseCurrency,
}: Props) {
  const [draft, setDraft] = useState(filters)
  const set = (patch: Partial<TxFilters>) => setDraft((d) => ({ ...d, ...patch }))
  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
  const amountError = (v: string) => (v && !AMOUNT.test(v) ? 'Enter a number like 500' : undefined)
  const rangeError =
    draft.range === 'custom' && draft.from && draft.to && draft.from > draft.to
      ? 'The start date is after the end date'
      : undefined
  const invalid = Boolean(amountError(draft.min) || amountError(draft.max) || rangeError)
  const visibleAccounts = accounts.filter((a) => !a.archived || draft.accountIds.includes(a.id))

  return (
    <View style={styles.form}>
      <SelectField
        label="Date"
        value={draft.range}
        onChange={(range: DatePreset) => set({ range })}
        options={DATE_PRESETS.map((p) => ({ value: p, label: DATE_PRESET_LABELS[p] }))}
      />
      {draft.range === 'custom' ? (
        <View style={styles.pair}>
          <View style={styles.flex}>
            <DateField
              label="From"
              value={draft.from}
              onChange={(from) => set({ from })}
              clearable
            />
          </View>
          <View style={styles.flex}>
            <DateField
              label="To"
              value={draft.to}
              error={rangeError}
              onChange={(to) => set({ to })}
              clearable
            />
          </View>
        </View>
      ) : null}

      <Group legend="Type">
        <Segmented
          label="Type"
          value={draft.type ?? 'all'}
          onChange={(v) => set({ type: v === 'all' ? null : v })}
          options={[
            { value: 'all' as const, label: 'All' },
            ...TRANSACTION_TYPES.map((t) => ({ value: t, label: TRANSACTION_TYPE_LABELS[t] })),
          ]}
        />
      </Group>

      {visibleAccounts.length > 0 ? (
        <Group legend="Accounts">
          {visibleAccounts.map((a) => (
            <Checkbox
              key={a.id}
              label={a.name}
              checked={draft.accountIds.includes(a.id)}
              onChange={() => set({ accountIds: toggle(draft.accountIds, a.id) })}
            />
          ))}
        </Group>
      ) : null}

      {(['expense', 'income'] as const).map((kind) => {
        const tree = buildCategoryTree(categories, kind)
        if (tree.length === 0) return null
        return (
          <Group
            key={kind}
            legend={kind === 'expense' ? 'Expense categories' : 'Income categories'}
          >
            {tree.map(({ category, children }) => (
              <View key={category.id}>
                <Checkbox
                  label={category.name}
                  checked={draft.categoryIds.includes(category.id)}
                  onChange={() => set({ categoryIds: toggle(draft.categoryIds, category.id) })}
                />
                {children.map((child) => (
                  <View key={child.id} style={styles.indent}>
                    <Checkbox
                      label={child.name}
                      checked={
                        draft.categoryIds.includes(child.id) ||
                        draft.categoryIds.includes(category.id)
                      }
                      disabled={draft.categoryIds.includes(category.id)}
                      onChange={() => set({ categoryIds: toggle(draft.categoryIds, child.id) })}
                    />
                  </View>
                ))}
              </View>
            ))}
          </Group>
        )
      })}

      <TagInput
        label="Tags"
        value={draft.tags}
        onChange={(tags) => set({ tags })}
        suggestions={knownTags}
        max={30}
        hint="Shows transactions with any of these tags."
      />

      <Group legend={`Amount (${baseCurrency})`}>
        <View style={styles.pair}>
          <View style={styles.flex}>
            <TextField
              label="Minimum"
              keyboardType="decimal-pad"
              value={draft.min}
              error={amountError(draft.min)}
              onChangeText={(v) => set({ min: v.trim() })}
            />
          </View>
          <View style={styles.flex}>
            <TextField
              label="Maximum"
              keyboardType="decimal-pad"
              value={draft.max}
              error={amountError(draft.max)}
              onChangeText={(v) => set({ max: v.trim() })}
            />
          </View>
        </View>
      </Group>

      <View style={styles.actions}>
        <Button
          title="Reset"
          variant="ghost"
          onPress={() => setDraft({ ...DEFAULT_FILTERS, search: draft.search, sort: draft.sort })}
        />
        <Button
          title="Apply filters"
          disabled={invalid}
          onPress={() => {
            if (invalid) return
            onApply(draft)
            onClose()
          }}
        />
      </View>
    </View>
  )
}

function Group({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <View style={styles.group} accessibilityRole="none">
      <Text weight="600" accessibilityRole="header">
        {legend}
      </Text>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  form: { gap: 20 },
  pair: { flexDirection: 'row', gap: 12 },
  flex: { flex: 1 },
  group: { gap: 4 },
  indent: { paddingLeft: 28 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8 },
})
