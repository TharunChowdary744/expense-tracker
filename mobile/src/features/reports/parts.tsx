import { ArrowDownRight, ArrowUpRight } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useAppDispatch } from '@/app/hooks'
import type { Account } from '@/features/accounts/types'
import type { Category } from '@/features/categories/types'
import { formatDelta } from '@/features/reports/components/chartTheme'
import { RANGE_PRESET_LABELS, type RangePreset } from '@/features/reports/utils'
import type { Transaction } from '@/features/transactions/types'
import { describeTransaction } from '@/features/transactions/utils'
import { dialogOpened } from '@/features/ui/slice'
import { calendarDate, formatCalendarDate } from '@/utils/dates'
import { formatMoney } from '@/utils/money'
import { DateField } from '@m/components/ui/Controls'
import { ListBox } from '@m/components/ui/ListBox'
import { SelectField } from '@m/components/ui/Select'
import { Text } from '@m/components/ui/Text'
import { radius } from '@m/theme/colors'
import { useColors } from '@m/theme/ThemeProvider'
import { openLink } from '../shell/routeSearch'

export interface RangeValue {
  preset: RangePreset
  from: string
  to: string
}

/** Period selector: a preset, or a custom from/to range (both days inclusive). */
export function RangePicker({
  presets,
  value,
  onChange,
  today,
}: {
  presets: readonly RangePreset[]
  value: RangeValue
  onChange: (next: RangeValue) => void
  /** Today (yyyy-MM-dd), used to fill an empty custom range. */
  today: string
}) {
  const invalid = value.preset === 'custom' && value.from && value.to && value.from > value.to
  return (
    <View style={styles.range}>
      <SelectField
        label="Period"
        value={value.preset}
        options={presets.map((p) => ({ value: p, label: RANGE_PRESET_LABELS[p] }))}
        onChange={(preset) =>
          onChange(
            preset === 'custom' && (!value.from || !value.to)
              ? { preset, from: value.from || `${today.slice(0, 8)}01`, to: value.to || today }
              : { ...value, preset },
          )
        }
      />
      {value.preset === 'custom' ? (
        <View style={styles.dates}>
          <View style={styles.flex}>
            <DateField
              label="From"
              value={value.from}
              maximumDate={value.to || undefined}
              onChange={(from) => onChange({ ...value, from })}
            />
          </View>
          <View style={styles.flex}>
            <DateField
              label="To"
              value={value.to}
              minimumDate={value.from || undefined}
              onChange={(to) => onChange({ ...value, to })}
            />
          </View>
        </View>
      ) : null}
      {invalid ? (
        <Text variant="small" tone="destructive" accessibilityRole="alert">
          The start date must be on or before the end date.
        </Text>
      ) : null}
    </View>
  )
}

/** One headline number with an optional change against a previous period. */
export function StatTile({
  label,
  value,
  loading,
  delta,
  deltaLabel,
  riseIsGood = true,
  tone = 'default',
  href,
  hrefLabel,
  locale,
  footnote,
}: {
  label: string
  value: string
  loading?: boolean
  /** Change in percent (display only); null for "no comparison". */
  delta?: number | null
  deltaLabel?: string
  riseIsGood?: boolean
  tone?: 'default' | 'positive' | 'negative'
  /** A web-style in-app link, e.g. "/transactions?type=expense". */
  href?: string
  hrefLabel?: string
  locale?: string
  footnote?: string
}) {
  const c = useColors()
  const hasDelta = delta !== undefined
  const up = (delta ?? 0) > 0
  const good = delta === null || delta === undefined || delta === 0 ? null : up === riseIsGood
  const Arrow = up ? ArrowUpRight : ArrowDownRight
  const deltaText =
    delta === null
      ? 'No data to compare'
      : `${formatDelta(delta ?? null, locale)} ${deltaLabel ?? ''}`
  const deltaColor = good === null ? c.mutedForeground : good ? c.success : c.destructive
  const body = (
    <>
      <Text variant="small" tone="muted">
        {label}
      </Text>
      {loading ? (
        <View style={[styles.skeleton, { backgroundColor: c.muted }]} />
      ) : (
        <Text
          variant="heading"
          tabular
          numberOfLines={1}
          adjustsFontSizeToFit
          tone={tone === 'positive' ? 'success' : tone === 'negative' ? 'destructive' : 'default'}
        >
          {value}
        </Text>
      )}
      {hasDelta && !loading ? (
        <View style={styles.delta}>
          {delta !== null && delta !== 0 ? <Arrow size={14} color={deltaColor} /> : null}
          <Text variant="caption" style={[styles.flex, { color: deltaColor }]}>
            {deltaText}
          </Text>
        </View>
      ) : null}
      {footnote && !loading ? (
        <Text variant="caption" tone="muted">
          {footnote}
        </Text>
      ) : null}
      {href ? (
        <Text variant="caption" weight="600" style={styles.link}>
          {hrefLabel ?? 'View transactions'}
        </Text>
      ) : null}
    </>
  )
  const box = [styles.tile, { borderColor: c.border, backgroundColor: c.card }]
  if (!href) return <View style={box}>{body}</View>
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${label}: ${loading ? 'loading' : value}${hasDelta && !loading ? `, ${deltaText}` : ''}. ${hrefLabel ?? 'View transactions'}`}
      onPress={() => openLink(href)}
      style={({ pressed }) => [box, pressed && { backgroundColor: c.accent }]}
    >
      {body}
    </Pressable>
  )
}

/** Two tiles per row. */
export function TileGrid({ children }: { children: ReactNode }) {
  return <View style={styles.grid}>{children}</View>
}

/** A compact list of transactions; each row opens the edit sheet. */
export function TxMiniList({
  label,
  transactions,
  accounts,
  categories,
  locale,
  max = 50,
}: {
  label: string
  transactions: readonly Transaction[]
  accounts: ReadonlyMap<string, Account>
  categories: ReadonlyMap<string, Category>
  locale?: string
  max?: number
}) {
  const c = useColors()
  const dispatch = useAppDispatch()
  const shown = transactions.slice(0, max)
  return (
    <View style={styles.mini}>
      <ListBox label={label}>
        {shown.map((tx) => {
          const { title, subtitle } = describeTransaction(tx, accounts, categories)
          const signed = tx.type === 'expense' ? -tx.amount : tx.amount
          const amount = formatMoney(signed, tx.currency, locale, {
            signDisplay: tx.type === 'income' ? 'always' : 'auto',
          })
          const day = formatCalendarDate(calendarDate(tx.date), locale, {
            day: 'numeric',
            month: 'short',
          })
          return (
            <Pressable
              key={tx.id}
              accessibilityRole="button"
              accessibilityLabel={`${title}, ${amount}, ${day}. Edit`}
              onPress={() => dispatch(dialogOpened({ kind: 'edit-transaction', transaction: tx }))}
              style={({ pressed }) => [styles.miniRow, pressed && { backgroundColor: c.accent }]}
            >
              <Text variant="caption" tone="muted" tabular style={styles.day}>
                {day}
              </Text>
              <View style={styles.flex}>
                <Text variant="small" weight="600" numberOfLines={1}>
                  {title}
                </Text>
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {subtitle}
                </Text>
              </View>
              <Text
                variant="small"
                weight="600"
                tabular
                tone={tx.type === 'income' ? 'success' : 'default'}
              >
                {amount}
              </Text>
            </Pressable>
          )
        })}
      </ListBox>
      {transactions.length > shown.length ? (
        <Text variant="caption" tone="muted">
          Showing {shown.length} of {transactions.length}.
        </Text>
      ) : null}
    </View>
  )
}

/** A text link to another screen, e.g. "All budgets". */
export function LinkText({ title, href }: { title: string; href: string }) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => openLink(href)}
      hitSlop={8}
      style={styles.linkTap}
    >
      <Text variant="small" weight="600" style={styles.link}>
        {title}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  range: { gap: 8 },
  dates: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1, minWidth: 0 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    minWidth: 0,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 12,
    gap: 4,
  },
  skeleton: { height: 26, width: '70%', borderRadius: radius.sm },
  delta: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  link: { textDecorationLine: 'underline' },
  linkTap: { alignSelf: 'flex-start' },
  mini: { gap: 6 },
  miniRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  day: { width: 48 },
})
