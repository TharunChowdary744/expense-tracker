import { CircleStop, Pause, Pencil, Play, SkipForward, Trash2 } from 'lucide-react-native'
import { StyleSheet, View } from 'react-native'
import type { Account } from '@/features/accounts/types'
import type { Category } from '@/features/categories/types'
import { ruleLabel } from '@/features/recurring/components/ruleLabel'
import { describeRule } from '@/features/recurring/engine'
import type { RecurringRule } from '@/features/recurring/types'
import { ruleCost, ruleNextDate, ruleSchedule, ruleStatus } from '@/features/recurring/utils'
import { formatCalendarDate } from '@/utils/dates'
import { formatMoney } from '@/utils/money'
import { ColoredIcon } from '@m/components/ColoredIcon'
import { PendingBadge } from '@m/components/PendingBadge'
import { Badge } from '@m/components/ui/Badge'
import { ActionMenu, type MenuAction } from '@m/components/ui/Menu'
import { Text } from '@m/components/ui/Text'
import { radius } from '@m/theme/colors'
import { useColors } from '@m/theme/ThemeProvider'

export interface RuleActions {
  onEdit: (rule: RecurringRule) => void
  onSkipNext: (rule: RecurringRule) => void
  onTogglePaused: (rule: RecurringRule) => void
  onEnd: (rule: RecurringRule) => void
  onDelete: (rule: RecurringRule) => void
}

export function RuleRow({
  rule,
  accounts,
  categories,
  baseCurrency,
  locale,
  ...actions
}: RuleActions & {
  rule: RecurringRule
  accounts: ReadonlyMap<string, Account>
  categories: ReadonlyMap<string, Category>
  baseCurrency: string
  locale?: string
}) {
  const c = useColors()
  const { title, icon, color } = ruleLabel(rule, categories)
  const status = ruleStatus(rule)
  const next = ruleNextDate(rule)
  const t = rule.template
  const account = accounts.get(t.accountId)?.name ?? 'Unknown account'
  const amount = formatMoney(t.type === 'expense' ? -t.amount : t.amount, t.currency, locale)
  const monthly = ruleCost(rule).monthly
  const nextText =
    status === 'ended'
      ? 'ENDED'
      : status === 'paused'
        ? 'PAUSED'
        : next
          ? `Next ${formatCalendarDate(next, locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}`
          : ''
  const menu: MenuAction[] = [{ label: 'Edit', icon: Pencil, onPress: () => actions.onEdit(rule) }]
  if (status === 'active' && next) {
    menu.push({ label: 'Skip next', icon: SkipForward, onPress: () => actions.onSkipNext(rule) })
  }
  if (status !== 'ended') {
    menu.push({
      label: rule.paused ? 'Resume' : 'Pause',
      icon: rule.paused ? Play : Pause,
      onPress: () => actions.onTogglePaused(rule),
    })
    menu.push({ label: 'End now', icon: CircleStop, onPress: () => actions.onEnd(rule) })
  }
  menu.push({
    label: 'Delete',
    icon: Trash2,
    destructive: true,
    onPress: () => actions.onDelete(rule),
  })

  return (
    <View style={[styles.row, { borderColor: c.border, backgroundColor: c.card }]}>
      <View style={{ opacity: status === 'active' ? 1 : 0.5 }}>
        <ColoredIcon icon={icon} color={color} />
      </View>
      <View style={styles.text}>
        <View style={styles.titleRow}>
          <Text weight="600" numberOfLines={1} style={styles.shrink}>
            {title}
          </Text>
          <Badge label={rule.mode === 'auto' ? 'Auto' : 'Remind'} />
          {rule.pending ? <PendingBadge /> : null}
        </View>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {describeRule(ruleSchedule(rule), locale)} · {account}
        </Text>
        <Text
          variant="caption"
          tone={status === 'active' ? 'default' : 'muted'}
          weight={status === 'active' ? undefined : '600'}
        >
          {nextText}
        </Text>
      </View>
      <View style={styles.amounts}>
        <Text weight="600" tabular>
          {amount}
        </Text>
        {t.type === 'expense' ? (
          <Text variant="caption" tone="muted" tabular>
            ≈ {formatMoney(monthly, baseCurrency, locale)}/mo
          </Text>
        ) : null}
      </View>
      <ActionMenu label={`Actions for ${title}`} title={title} actions={menu} />
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingLeft: 12,
    paddingVertical: 10,
    paddingRight: 4,
  },
  text: { flex: 1, minWidth: 0, gap: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  shrink: { flexShrink: 1 },
  amounts: { alignItems: 'flex-end' },
})
