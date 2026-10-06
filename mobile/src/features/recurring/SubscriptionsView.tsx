import { CreditCard } from 'lucide-react-native'
import { StyleSheet, View } from 'react-native'
import type { Category } from '@/features/categories/types'
import { ruleLabel } from '@/features/recurring/components/ruleLabel'
import { describeRule } from '@/features/recurring/engine'
import type { RecurringRule } from '@/features/recurring/types'
import { ruleSchedule, subscriptionSummary } from '@/features/recurring/utils'
import { formatMoney } from '@/utils/money'
import { ColoredIcon } from '@m/components/ColoredIcon'
import { Card } from '@m/components/ui/Card'
import { EmptyState } from '@m/components/ui/ListStates'
import { Text } from '@m/components/ui/Text'
import { useColors } from '@m/theme/ThemeProvider'

/** Active recurring expenses with their monthly and yearly cost. */
export function SubscriptionsView({
  rules,
  categories,
  baseCurrency,
  locale,
}: {
  rules: readonly RecurringRule[]
  categories: ReadonlyMap<string, Category>
  baseCurrency: string
  locale?: string
}) {
  const c = useColors()
  const summary = subscriptionSummary(rules)
  const money = (v: number) => formatMoney(v, baseCurrency, locale)
  if (summary.items.length === 0) {
    return (
      <EmptyState
        icon={CreditCard}
        title="No active recurring expenses"
        description="Subscriptions and bills you set to repeat are totalled here. Paused and ended rules are left out."
      />
    )
  }
  return (
    <View style={styles.wrap}>
      <View style={styles.tiles}>
        <Card style={styles.tile}>
          <Text variant="small" tone="muted">
            Per month
          </Text>
          <Text variant="heading" tabular>
            {money(summary.monthly)}
          </Text>
        </Card>
        <Card style={styles.tile}>
          <Text variant="small" tone="muted">
            Per year
          </Text>
          <Text variant="heading" tabular>
            {money(summary.yearly)}
          </Text>
        </Card>
      </View>
      <Text variant="caption" tone="muted">
        {summary.items.length} active recurring expense{summary.items.length === 1 ? '' : 's'}, in
        your base currency. Daily and weekly costs use an average month (30.44 days).
      </Text>
      <View accessibilityLabel="Recurring expenses by monthly cost">
        {summary.items.map(({ rule, monthly, yearly }) => {
          const { title, icon, color } = ruleLabel(rule, categories)
          return (
            <View
              key={rule.id}
              accessible
              accessibilityLabel={`${title}: ${money(monthly)} a month, ${money(yearly)} a year`}
              style={[styles.row, { borderTopColor: c.border }]}
            >
              <ColoredIcon icon={icon} color={color} size={32} />
              <View style={styles.text}>
                <Text weight="600" numberOfLines={1}>
                  {title}
                </Text>
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {formatMoney(rule.template.amount, rule.template.currency, locale)} ·{' '}
                  {describeRule(ruleSchedule(rule), locale).toLowerCase()}
                </Text>
              </View>
              <View style={styles.amounts}>
                <Text tabular>{money(monthly)}/mo</Text>
                <Text variant="caption" tone="muted" tabular>
                  {money(yearly)}/yr
                </Text>
              </View>
            </View>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  tiles: { flexDirection: 'row', gap: 12 },
  tile: { flex: 1, gap: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  text: { flex: 1, minWidth: 0 },
  amounts: { alignItems: 'flex-end' },
})
