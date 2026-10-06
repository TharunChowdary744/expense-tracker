import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { StyleSheet, View } from 'react-native'
import {
  BUDGET_NAME_MAX,
  BUDGET_PERIODS,
  BUDGET_PERIOD_LABELS,
  DEFAULT_THRESHOLDS,
  budgetFormSchema,
  type BudgetFormInput,
  type BudgetFormValues,
} from '@/features/budgets/schemas'
import type { Budget } from '@/features/budgets/types'
import type { Category } from '@/features/categories/types'
import { buildCategoryTree } from '@/features/categories/utils'
import { fromMinor } from '@/utils/money'
import { FormTextField } from '@m/components/form/Controlled'
import { FormMessage } from '@m/components/form/FormMessage'
import { Button } from '@m/components/ui/Button'
import { Checkbox, Segmented, SwitchRow } from '@m/components/ui/Controls'
import { Text } from '@m/components/ui/Text'
import { radius } from '@m/theme/colors'
import { useColors } from '@m/theme/ThemeProvider'

function toggle(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
}

export function BudgetForm({
  budget,
  categories,
  baseCurrency,
  onSubmit,
  onCancel,
}: {
  budget?: Budget
  categories: readonly Category[]
  baseCurrency: string
  /** Resolves to an error message, or null on success. */
  onSubmit: (values: BudgetFormValues) => Promise<string | null>
  onCancel: () => void
}) {
  const c = useColors()
  const [error, setError] = useState<string | null>(null)
  const schema = useMemo(() => budgetFormSchema(baseCurrency), [baseCurrency])
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
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

  const submit = handleSubmit(async (values) => {
    setError(null)
    const message = await onSubmit(values)
    if (message) setError(message)
  })

  return (
    <View style={styles.form}>
      {error ? <FormMessage kind="error">{error}</FormMessage> : null}
      <FormTextField
        control={control}
        name="name"
        label="Name"
        maxLength={BUDGET_NAME_MAX}
        placeholder="e.g. Food"
        autoComplete="off"
      />
      <Controller
        control={control}
        name="period"
        render={({ field }) => (
          <Segmented
            label="Period"
            value={field.value}
            onChange={field.onChange}
            options={BUDGET_PERIODS.map((p) => ({ value: p, label: BUDGET_PERIOD_LABELS[p] }))}
          />
        )}
      />
      <FormTextField
        control={control}
        name="amount"
        label="Limit"
        keyboardType="decimal-pad"
        placeholder="5000"
        hint={`In ${baseCurrency}, per ${period === 'weekly' ? 'week' : 'month'}.`}
      />
      <Controller
        control={control}
        name="scope"
        render={({ field }) => (
          <Segmented
            label="What counts"
            value={field.value}
            onChange={field.onChange}
            options={[
              { value: 'categories', label: 'Selected categories' },
              { value: 'overall', label: 'All expenses' },
            ]}
          />
        )}
      />
      {scope === 'categories' ? (
        <Controller
          control={control}
          name="categoryIds"
          render={({ field, fieldState }) => (
            <View
              style={[styles.box, { borderColor: fieldState.error ? c.destructive : c.border }]}
            >
              <Text weight="600" accessibilityRole="header">
                Categories
              </Text>
              {tree.length === 0 ? (
                <Text variant="small" tone="muted">
                  No expense categories yet.
                </Text>
              ) : null}
              {tree.map(({ category, children }) => (
                <View key={category.id}>
                  <Checkbox
                    label={category.name}
                    description={children.length > 0 ? 'Includes subcategories' : undefined}
                    checked={field.value.includes(category.id)}
                    onChange={() =>
                      field.onChange(
                        // Picking a parent covers its subcategories.
                        toggle(
                          field.value.filter((id) => !children.some((ch) => ch.id === id)),
                          category.id,
                        ),
                      )
                    }
                  />
                  {children.map((child) => (
                    <View key={child.id} style={styles.indent}>
                      <Checkbox
                        label={child.name}
                        checked={
                          field.value.includes(child.id) || field.value.includes(category.id)
                        }
                        disabled={field.value.includes(category.id)}
                        onChange={() => field.onChange(toggle(field.value, child.id))}
                      />
                    </View>
                  ))}
                </View>
              ))}
              {fieldState.error ? (
                <Text variant="caption" tone="destructive" accessibilityRole="alert">
                  {fieldState.error.message}
                </Text>
              ) : null}
            </View>
          )}
        />
      ) : null}
      <Controller
        control={control}
        name="rollover"
        render={({ field }) => (
          <SwitchRow
            label="Roll over"
            description={`Add last ${period === 'weekly' ? "week's" : "month's"} unspent amount to this limit, or take off what was overspent.`}
            value={field.value}
            onChange={field.onChange}
          />
        )}
      />
      <FormTextField
        control={control}
        name="thresholds"
        label="Alert at (% of limit)"
        keyboardType="numbers-and-punctuation"
        hint="Separate with commas. You get one alert per threshold each period."
      />
      <View style={styles.actions}>
        <Button title="Cancel" variant="ghost" onPress={onCancel} />
        <Button
          title={isSubmitting ? 'Saving…' : budget ? 'Save changes' : 'Create budget'}
          loading={isSubmitting}
          onPress={() => void submit()}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  form: { gap: 16 },
  box: { borderWidth: 1, borderRadius: radius.md, padding: 12, gap: 4 },
  indent: { paddingLeft: 28 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, paddingTop: 8 },
})
