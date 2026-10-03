import { useState, type ReactNode } from 'react'
import { SelectField } from '@/components/form/SelectField'
import { TextField } from '@/components/form/TextField'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import type { Account } from '@/features/accounts/types'
import type { Category } from '@/features/categories/types'
import { buildCategoryTree } from '@/features/categories/utils'
import {
  DATE_PRESETS,
  DATE_PRESET_LABELS,
  DEFAULT_FILTERS,
  type DatePreset,
  type TxFilters,
} from '../filters'
import { TRANSACTION_TYPES, TRANSACTION_TYPE_LABELS, type TransactionType } from '../schemas'
import { TagInput } from './TagInput'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
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
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent>
        <SheetTitle className="pr-8 text-lg font-semibold">Filter transactions</SheetTitle>
        <SheetDescription className="mb-4 text-sm text-muted-foreground">
          Filters combine: a transaction must match all of them.
        </SheetDescription>
        {/* Remount per open so the draft starts from the current filters. */}
        {props.open && <FiltersForm {...props} />}
      </SheetContent>
    </Sheet>
  )
}

function FiltersForm({
  filters,
  onApply,
  onOpenChange,
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
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (invalid) return
        onApply(draft)
        onOpenChange(false)
      }}
    >
      <div className="space-y-3">
        <SelectField
          label="Date"
          value={draft.range}
          onChange={(e) => set({ range: e.target.value as DatePreset })}
        >
          {DATE_PRESETS.map((p) => (
            <option key={p} value={p}>
              {DATE_PRESET_LABELS[p]}
            </option>
          ))}
        </SelectField>
        {draft.range === 'custom' && (
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label="From"
              type="date"
              value={draft.from}
              onChange={(e) => set({ from: e.target.value })}
            />
            <TextField
              label="To"
              type="date"
              value={draft.to}
              error={rangeError}
              onChange={(e) => set({ to: e.target.value })}
            />
          </div>
        )}
      </div>

      <Group legend="Type">
        <div className="flex flex-wrap gap-2">
          {([null, ...TRANSACTION_TYPES] as (TransactionType | null)[]).map((t) => (
            <label
              key={t ?? 'all'}
              className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50"
            >
              <input
                type="radio"
                name="type"
                className="sr-only"
                checked={draft.type === t}
                onChange={() => set({ type: t })}
              />
              {t ? TRANSACTION_TYPE_LABELS[t] : 'All'}
            </label>
          ))}
        </div>
      </Group>

      {visibleAccounts.length > 0 && (
        <Group legend="Accounts">
          <div className="grid gap-1.5 sm:grid-cols-2">
            {visibleAccounts.map((a) => (
              <Check
                key={a.id}
                label={a.name}
                checked={draft.accountIds.includes(a.id)}
                onChange={() => set({ accountIds: toggle(draft.accountIds, a.id) })}
              />
            ))}
          </div>
        </Group>
      )}

      {(['expense', 'income'] as const).map((kind) => {
        const tree = buildCategoryTree(categories, kind)
        if (tree.length === 0) return null
        return (
          <Group
            key={kind}
            legend={kind === 'expense' ? 'Expense categories' : 'Income categories'}
          >
            <div className="space-y-1.5">
              {tree.map(({ category, children }) => (
                <div key={category.id} className="space-y-1.5">
                  <Check
                    label={category.name}
                    checked={draft.categoryIds.includes(category.id)}
                    onChange={() => set({ categoryIds: toggle(draft.categoryIds, category.id) })}
                  />
                  {children.length > 0 && (
                    <div className="space-y-1.5 pl-6">
                      {children.map((child) => (
                        <Check
                          key={child.id}
                          label={child.name}
                          checked={
                            draft.categoryIds.includes(child.id) ||
                            draft.categoryIds.includes(category.id)
                          }
                          disabled={draft.categoryIds.includes(category.id)}
                          onChange={() => set({ categoryIds: toggle(draft.categoryIds, child.id) })}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
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
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Minimum"
            inputMode="decimal"
            value={draft.min}
            error={amountError(draft.min)}
            onChange={(e) => set({ min: e.target.value.trim() })}
          />
          <TextField
            label="Maximum"
            inputMode="decimal"
            value={draft.max}
            error={amountError(draft.max)}
            onChange={(e) => set({ max: e.target.value.trim() })}
          />
        </div>
      </Group>

      <div className="flex justify-between gap-2 pt-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setDraft({ ...DEFAULT_FILTERS, search: draft.search, sort: draft.sort })}
        >
          Reset
        </Button>
        <Button type="submit" disabled={invalid}>
          Apply filters
        </Button>
      </div>
    </form>
  )
}

function Group({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      {children}
    </fieldset>
  )
}

function Check({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string
  checked: boolean
  disabled?: boolean
  onChange: () => void
}) {
  return (
    <label className="flex items-center gap-2 text-sm has-[:disabled]:opacity-60">
      <input
        type="checkbox"
        className="size-4 accent-primary"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      {label}
    </label>
  )
}
