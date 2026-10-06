import { skipToken } from '@reduxjs/toolkit/query/react'
import { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { useGetTransactionsInRangeQuery } from '@/features/reports/api'
import { totals } from '@/features/reports/utils'
import { matchesQuery, type TxQuery } from '@/features/transactions/filters'
import type { Transaction } from '@/features/transactions/types'
import { calendarDate } from '@/utils/dates'
import { formatMoney } from '@/utils/money'
import { Text } from '@m/components/ui/Text'
import { radius } from '@m/theme/colors'
import { useColors } from '@m/theme/ThemeProvider'

/**
 * Income, spending and net for everything matching the filters (transfers left out). With a
 * date range the whole range is read at once; otherwise the list is totalled once every page
 * has loaded.
 */
export function FilterTotals({
  uid,
  query,
  loaded,
  complete,
  baseCurrency,
  locale,
}: {
  uid: string
  query: TxQuery
  loaded: readonly Transaction[]
  complete: boolean
  baseCurrency: string
  locale?: string
}) {
  const c = useColors()
  const ranged = query.start !== null && query.end !== null
  const rangeQuery = useGetTransactionsInRangeQuery(
    ranged
      ? { uid, start: calendarDate(query.start as string), end: calendarDate(query.end as string) }
      : skipToken,
  )
  const sum = useMemo(() => {
    if (ranged)
      return rangeQuery.data ? totals(rangeQuery.data.filter((t) => matchesQuery(t, query))) : null
    return complete ? totals(loaded) : null
  }, [ranged, rangeQuery.data, query, complete, loaded])
  if (!sum) return null
  const money = (v: number) => formatMoney(v, baseCurrency, locale)
  return (
    <View
      accessibilityLabel={`Totals for these filters: income ${money(sum.income)}, spending ${money(sum.expense)}, net ${money(sum.net)}`}
      accessible
      style={[styles.box, { borderColor: c.border, backgroundColor: c.card }]}
    >
      <Item label="Income" value={money(sum.income)} tone="success" />
      <Item label="Spending" value={money(sum.expense)} />
      <Item label="Net" value={money(sum.net)} />
    </View>
  )
}

function Item({ label, value, tone }: { label: string; value: string; tone?: 'success' }) {
  return (
    <View style={styles.item}>
      <Text variant="small" tone="muted">
        {label}
      </Text>
      <Text variant="small" weight="600" tone={tone} tabular>
        {value}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 16,
    rowGap: 4,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  item: { flexDirection: 'row', gap: 6 },
})
