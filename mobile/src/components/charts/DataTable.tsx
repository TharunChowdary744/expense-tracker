import type { ReactNode } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { useColors } from '@m/theme/ThemeProvider'
import { Text } from '../ui/Text'

export interface Column<Row> {
  header: string
  cell: (row: Row) => ReactNode
  /** Right-aligned numeric column. */
  numeric?: boolean
  /** Relative width (default 1; the first column defaults to 1.6). */
  flex?: number
}

/** A plain table used as the alternative view for charts; scrolls sideways when narrow. */
export function DataTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
  minWidth = 0,
  footer,
}: {
  caption: string
  columns: readonly Column<Row>[]
  rows: readonly Row[]
  rowKey: (row: Row) => string
  minWidth?: number
  footer?: ReactNode
}) {
  const c = useColors()
  const cell = (col: Column<Row>, i: number, content: ReactNode, header = false) => (
    <View key={col.header} style={[styles.cell, { flex: col.flex ?? (i === 0 ? 1.6 : 1) }]}>
      {typeof content === 'string' || typeof content === 'number' ? (
        <Text
          variant="small"
          tone={header ? 'muted' : 'default'}
          weight={header ? '600' : undefined}
          align={col.numeric ? 'right' : 'left'}
          tabular={col.numeric}
        >
          {content}
        </Text>
      ) : (
        content
      )}
    </View>
  )
  return (
    <ScrollView horizontal={minWidth > 0} accessibilityLabel={caption}>
      <View style={{ minWidth, flexGrow: 1 }}>
        <View style={[styles.row, { borderBottomColor: c.border }]} accessibilityRole="header">
          {columns.map((col, i) => cell(col, i, col.header, true))}
        </View>
        {rows.map((row) => (
          <View key={rowKey(row)} style={[styles.row, { borderBottomColor: c.border }]} accessible>
            {columns.map((col, i) => cell(col, i, col.cell(row)))}
          </View>
        ))}
        {footer}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
  },
  cell: { paddingHorizontal: 4, justifyContent: 'center' },
})
