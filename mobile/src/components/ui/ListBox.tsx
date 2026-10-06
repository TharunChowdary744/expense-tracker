import { Children, Fragment, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { useColors } from '@m/theme/ThemeProvider'
import { radius } from '@m/theme/colors'
import { Text } from './Text'

/** A bordered card of rows with hairline dividers (the web app's `divide-y rounded-lg border`). */
export function ListBox({ children, label }: { children: ReactNode; label?: string }) {
  const c = useColors()
  const items = Children.toArray(children).filter(Boolean)
  return (
    <View
      accessibilityLabel={label}
      style={[styles.box, { borderColor: c.border, backgroundColor: c.card }]}
    >
      {items.map((child, i) => (
        <Fragment key={i}>
          {i > 0 ? <View style={[styles.divider, { backgroundColor: c.border }]} /> : null}
          {child}
        </Fragment>
      ))}
    </View>
  )
}

/** A small muted heading above a list section. */
export function SectionTitle({ children, action }: { children: string; action?: ReactNode }) {
  return (
    <View style={styles.titleRow}>
      <Text
        variant="small"
        weight="600"
        tone="muted"
        accessibilityRole="header"
        style={styles.title}
      >
        {children}
      </Text>
      {action}
    </View>
  )
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden' },
  divider: { height: StyleSheet.hairlineWidth },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { flexShrink: 1 },
})
