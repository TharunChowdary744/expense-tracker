import { BarChart3, Table2 } from 'lucide-react-native'
import { useState, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Text } from '../ui/Text'

/** A report section with a "Show table" / "Show chart" toggle, so every chart has a table. */
export function ChartCard({
  title,
  description,
  chart,
  table,
  actions,
  empty,
}: {
  title: string
  description?: string
  chart: ReactNode
  /** The same data as a table: the accessible alternative. */
  table: ReactNode
  actions?: ReactNode
  /** Shown instead of chart and table when there is nothing to plot. */
  empty?: string | null
}) {
  const [showTable, setShowTable] = useState(false)
  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titles}>
          <Text variant="subheading" accessibilityRole="header">
            {title}
          </Text>
          {description ? (
            <Text variant="small" tone="muted">
              {description}
            </Text>
          ) : null}
        </View>
        {!empty ? (
          <Button
            size="sm"
            variant="outline"
            icon={showTable ? BarChart3 : Table2}
            title={showTable ? 'Chart' : 'Table'}
            accessibilityLabel={showTable ? `Show ${title} as a chart` : `Show ${title} as a table`}
            accessibilityState={{ selected: showTable }}
            onPress={() => setShowTable((v) => !v)}
          />
        ) : null}
      </View>
      {actions}
      {empty ? (
        <Text variant="small" tone="muted" align="center" style={styles.empty}>
          {empty}
        </Text>
      ) : showTable ? (
        table
      ) : (
        chart
      )}
    </Card>
  )
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  titles: { flex: 1, minWidth: 0 },
  empty: { paddingVertical: 24 },
})
