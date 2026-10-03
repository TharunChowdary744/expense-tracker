import { zodResolver } from '@hookform/resolvers/zod'
import { useId, useMemo, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { FormMessage } from '@/components/form/FormMessage'
import { SelectField } from '@/components/form/SelectField'
import { TextField } from '@/components/form/TextField'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import type { Category } from '@/features/categories/types'
import { buildCategoryTree } from '@/features/categories/utils'
import { fromMinor } from '@/utils/money'
import {
  BUDGET_NAME_MAX,
  BUDGET_PERIODS,
  BUDGET_PERIOD_LABELS,
  DEFAULT_THRESHOLDS,
  budgetFormSchema,
  type BudgetFormInput,
  type BudgetFormValues,
} from '../schemas'
import type { Budget } from '../types'

interface Props {
  budget?: Budget
  categories: readonly Category[]
  baseCurrency: string
  /** Resolves to an error message, or null on success. */
  onSubmit: (values: BudgetFormValues) => Promise<string | null>
  onCancel: () => void
}

function toggle(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
}

export function BudgetForm({ budget, categories, baseCurrency, onSubmit, onCancel }: Props) {
  const [error, setError] = useState<string | null>(null)
  const ids = useId()
  const schema = useMemo(() => budgetFormSchema(baseCurrency), [baseCurrency])
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<BudgetFormInput, unknown, BudgetFormValues>({
    resolver: zodResolver(schema),
    defaultValues: budget
      ? {
          name: budget.name,
          period: budget.period,
          scope: budget.categoryIds.length > 0 ? 'categories' : 'overall',
          categoryIds: budget.categoryIds,
          amount: fromMinor(budget.amount, baseCurrency),
          rollover: budget.rollover,
          thresholds: budget.alertThresholds.join(', '),
        }
      : {
          name: '',
          period: 'monthly',
          scope: 'categories',
          categoryIds: [],
          amount: '',
          rollover: false,
          thresholds: DEFAULT_THRESHOLDS.join(', '),
        },
  })
  const scope = useWatch({ control, name: 'scope' })
  const period = useWatch({ control, name: 'period' })
  const tree = useMemo(() => buildCategoryTree(categories, 'expense'), [categories])

  async function submit(values: BudgetFormValues) {
    setError(null)
    const message = await onSubmit(values)
    if (message) setError(message)
  }

  return (
    <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
      {error && <FormMessage kind="error">{error}</FormMessage>}
      <TextField
        label="Name"
        maxLength={BUDGET_NAME_MAX}
        autoComplete="off"
        placeholder="e.g. Food"
        error={errors.name?.message}
        {...register('name')}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Period" error={errors.period?.message} {...register('period')}>
          {BUDGET_PERIODS.map((p) => (
            <option key={p} value={p}>
              {BUDGET_PERIOD_LABELS[p]}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Limit"
          inputMode="decimal"
          autoComplete="off"
          placeholder="5000"
          hint={`In ${baseCurrency}, per ${period === 'weekly' ? 'week' : 'month'}.`}
          error={errors.amount?.message}
          {...register('amount')}
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">What counts</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              value="categories"
              className="accent-primary"
              {...register('scope')}
            />
            Selected categories
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" value="overall" className="accent-primary" {...register('scope')} />
            All expenses
          </label>
        </div>
      </fieldset>

      {scope === 'categories' && (
        <Controller
          control={control}
          name="categoryIds"
          render={({ field, fieldState }) => (
            <fieldset
              className="space-y-1.5 rounded-md border p-3"
              aria-describedby={fieldState.error ? `${ids}-cat-error` : undefined}
            >
              <legend className="px-1 text-sm font-medium">Categories</legend>
              {tree.length === 0 && (
                <p className="text-sm text-muted-foreground">No expense categories yet.</p>
              )}
              <div className="max-h-56 space-y-1.5 overflow-y-auto">
                {tree.map(({ category, children }) => (
                  <div key={category.id} className="space-y-1.5">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        checked={field.value.includes(category.id)}
                        onChange={() =>
                          field.onChange(
                            // Picking a parent covers its subcategories.
                            toggle(
                              field.value.filter((id) => !children.some((c) => c.id === id)),
                              category.id,
                            ),
                          )
                        }
                      />
                      {category.name}
                      {children.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          (includes subcategories)
                        </span>
                      )}
                    </label>
                    {children.length > 0 && (
                      <div className="space-y-1.5 pl-6">
                        {children.map((child) => (
                          <label
                            key={child.id}
                            className="flex items-center gap-2 text-sm has-[:disabled]:opacity-60"
                          >
                            <input
                              type="checkbox"
                              className="size-4 accent-primary"
                              checked={
                                field.value.includes(child.id) || field.value.includes(category.id)
                              }
                              disabled={field.value.includes(category.id)}
                              onChange={() => field.onChange(toggle(field.value, child.id))}
                            />
                            {child.name}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {fieldState.error && (
                <p id={`${ids}-cat-error`} className="text-xs text-destructive">
                  {fieldState.error.message}
                </p>
              )}
            </fieldset>
          )}
        />
      )}

      <Controller
        control={control}
        name="rollover"
        render={({ field }) => (
          <div className="flex items-start gap-3">
            <Switch
              id={`${ids}-rollover`}
              checked={field.value}
              onCheckedChange={field.onChange}
              aria-describedby={`${ids}-rollover-hint`}
              className="mt-0.5"
            />
            <div>
              <label htmlFor={`${ids}-rollover`} className="text-sm font-medium">
                Roll over
              </label>
              <p id={`${ids}-rollover-hint`} className="text-xs text-muted-foreground">
                Add last {period === 'weekly' ? "week's" : "month's"} unspent amount to this limit,
                or take off what was overspent.
              </p>
            </div>
          </div>
        )}
      />

      <TextField
        label="Alert at (% of limit)"
        autoComplete="off"
        inputMode="numeric"
        hint="Separate with commas. You get one alert per threshold each period."
        error={errors.thresholds?.message}
        {...register('thresholds')}
      />

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : budget ? 'Save changes' : 'Create budget'}
        </Button>
      </div>
    </form>
  )
}
