import { Check, SkipForward } from 'lucide-react-native'
import { StyleSheet, View } from 'react-native'
import type { Category } from '@/features/categories/types'
import { ruleLabel } from '@/features/recurring/components/ruleLabel'
import type { PendingOccurrence } from '@/features/recurring/types'
import { relativeDay } from '@/features/recurring/utils'
import { formatCalendarDate } from '@/utils/dates'
import { formatMoney } from '@/utils/money'
import { ColoredIcon } from '@m/components/ColoredIcon'
import { Button } from '@m/components/ui/Button'
import { Text } from '@m/components/ui/Text'
import { radius } from '@m/theme/colors'
import { useColors } from '@m/theme/ThemeProvider'

/** Occurrences due now or soon, with Confirm / Skip when those handlers are given. */
export function PendingList({
  items,
  categories,
  locale,
  label,
  onConfirm,
  onSkip,
  busyIds,
}: {
  items: readonly PendingOccurrence[]
  categories: ReadonlyMap<string, Category>
  locale?: string
  label: string
  onConfirm?: (item: PendingOccurrence) => void
  onSkip?: (item: PendingOccurrence) => void
  busyIds?: ReadonlySet<string>
}) {
  const c = useColors()
  return (
    <View accessibilityLabel={label} style={styles.list}>
      {items.map((item) => {
        const { rule, occurrence, daysAway, txId } = item
        const { title, icon, color } = ruleLabel(rule, categories)
        const t = rule.template
        const date = formatCalendarDate(occurrence.date, locale, {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        })
        const busy = busyIds?.has(txId) ?? false
        return (
          <View key={txId} style={[styles.row, { borderColor: c.border, backgroundColor: c.card }]}>
            <View style={styles.top}>
              <ColoredIcon icon={icon} color={color} />
              <View style={styles.text}>
                <Text weight="600" numberOfLines={1}>
                  {title}
                </Text>
                <Text variant="caption" tone="muted">
                  {date} ·{' '}
                  <Text
                    variant="caption"
                    tone={daysAway < 0 ? 'destructive' : 'muted'}
                    weight={daysAway < 0 ? '600' : undefined}
                  >
                    {relativeDay(daysAway)}
                  </Text>
                  {rule.mode === 'auto' ? ' · posts automatically' : ''}
                </Text>
              </View>
              <Text weight="600" tabular>
                {formatMoney(t.type === 'expense' ? -t.amount : t.amount, t.currency, locale)}
              </Text>
            </View>
            {onConfirm || onSkip ? (
              <View style={styles.actions}>
                {onSkip ? (
                  <Button
                    title="Skip"
                    icon={SkipForward}
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    accessibilityLabel={`Skip ${title} on ${date}`}
                    onPress={() => onSkip(item)}
                  />
                ) : null}
                {onConfirm ? (
                  <Button
                    title="Confirm"
                    icon={Check}
                    size="sm"
                    disabled={busy}
                    accessibilityLabel={`Confirm ${title} on ${date}`}
                    onPress={() => onConfirm(item)}
                  />
                ) : null}
              </View>
            ) : null}
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  list: { gap: 8 },
  row: { borderWidth: 1, borderRadius: radius.lg, padding: 12, gap: 8 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  text: { flex: 1, minWidth: 0 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
})
