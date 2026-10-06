import { ArrowLeftRight, Copy, Paperclip, Pencil, Trash2 } from 'lucide-react-native'
import { memo } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import type { Account } from '@/features/accounts/types'
import type { Category } from '@/features/categories/types'
import { receiptsEnabled } from '@/features/receipts/flag'
import type { Transaction } from '@/features/transactions/types'
import { describeTransaction } from '@/features/transactions/utils'
import { formatMoney } from '@/utils/money'
import { ColoredIcon } from '@m/components/ColoredIcon'
import { PendingBadge } from '@m/components/PendingBadge'
import { Checkbox } from '@m/components/ui/Controls'
import { ActionMenu } from '@m/components/ui/Menu'
import { Text } from '@m/components/ui/Text'
import { radius } from '@m/theme/colors'
import { useColors } from '@m/theme/ThemeProvider'

interface Props {
  tx: Transaction
  accounts: ReadonlyMap<string, Account>
  categories: ReadonlyMap<string, Category>
  baseCurrency: string
  locale?: string
  selected?: boolean
  /** Turns on selection mode: tapping the row toggles it. */
  selecting?: boolean
  onToggleSelected?: (id: string) => void
  onEdit: (tx: Transaction) => void
  onDuplicate?: (tx: Transaction) => void
  onDelete?: (tx: Transaction) => void
}

/** One transaction: tap to edit, long-press to select, "⋮" for more. */
export const TransactionRow = memo(function TransactionRow({
  tx,
  accounts,
  categories,
  baseCurrency,
  locale,
  selected = false,
  selecting = false,
  onToggleSelected,
  onEdit,
  onDuplicate,
  onDelete,
}: Props) {
  const c = useColors()
  const { title, subtitle } = describeTransaction(tx, accounts, categories)
  const category = tx.categoryId ? categories.get(tx.categoryId) : undefined
  const sign = tx.type === 'expense' ? 'negative' : tx.type === 'income' ? 'positive' : 'none'
  const amount = formatMoney(
    tx.type === 'expense' ? -tx.amount : tx.amount,
    tx.currency,
    locale,
    sign === 'positive' ? { signDisplay: 'always' } : {},
  )
  const label = `${title}, ${amount}`
  const attachments = receiptsEnabled ? tx.attachments.length : 0

  const press = () => (selecting && onToggleSelected ? onToggleSelected(tx.id) : onEdit(tx))

  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: selected ? c.accent : c.card,
          borderColor: selected ? c.primary : c.border,
        },
      ]}
    >
      {selecting && onToggleSelected ? (
        <Checkbox
          checked={selected}
          onChange={() => onToggleSelected(tx.id)}
          label={`Select ${label}`}
          hideLabel
        />
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          selecting ? `${selected ? 'Deselect' : 'Select'} ${label}` : `Edit ${label}`
        }
        accessibilityHint={onToggleSelected && !selecting ? 'Long-press to select' : undefined}
        onPress={press}
        onLongPress={onToggleSelected ? () => onToggleSelected(tx.id) : undefined}
        style={styles.main}
      >
        {tx.type === 'transfer' ? (
          <View style={[styles.transfer, { backgroundColor: c.muted }]}>
            <ArrowLeftRight size={16} color={c.mutedForeground} />
          </View>
        ) : (
          <ColoredIcon icon={category?.icon ?? 'tag'} color={category?.color ?? '#64748b'} />
        )}
        <View style={styles.text}>
          <View style={styles.titleRow}>
            <Text weight="600" numberOfLines={1} style={styles.shrink}>
              {title}
            </Text>
            {attachments > 0 ? (
              <View
                style={styles.clip}
                accessibilityLabel={attachments === 1 ? '1 receipt' : `${attachments} receipts`}
              >
                <Paperclip size={12} color={c.mutedForeground} />
                <Text variant="caption" tone="muted">
                  {attachments}
                </Text>
              </View>
            ) : null}
            {tx.pending ? <PendingBadge /> : null}
          </View>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {subtitle}
            {tx.tags.length > 0 ? ` · ${tx.tags.map((t) => `#${t}`).join(' ')}` : ''}
          </Text>
        </View>
        <View style={styles.amounts}>
          <Text
            weight="600"
            tone={sign === 'positive' ? 'success' : sign === 'none' ? 'muted' : 'default'}
            style={styles.tabular}
          >
            {amount}
          </Text>
          {tx.currency !== baseCurrency ? (
            <Text variant="caption" tone="muted" style={styles.tabular}>
              {formatMoney(tx.baseAmount, baseCurrency, locale)}
            </Text>
          ) : null}
        </View>
      </Pressable>
      {!selecting && (onDuplicate || onDelete) ? (
        <ActionMenu
          label={`Actions for ${label}`}
          title={title}
          actions={[
            { label: 'Edit', icon: Pencil, onPress: () => onEdit(tx) },
            ...(onDuplicate
              ? [{ label: 'Duplicate', icon: Copy, onPress: () => onDuplicate(tx) }]
              : []),
            ...(onDelete
              ? [{ label: 'Delete', icon: Trash2, destructive: true, onPress: () => onDelete(tx) }]
              : []),
          ]}
        />
      ) : null}
    </View>
  )
})

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingLeft: 12,
    paddingVertical: 10,
    paddingRight: 4,
  },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 40 },
  transfer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  shrink: { flexShrink: 1 },
  clip: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  amounts: { alignItems: 'flex-end' },
  tabular: { fontVariant: ['tabular-nums'] },
})
