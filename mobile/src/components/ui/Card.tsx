import type { ReactNode } from 'react'
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { useColors } from '@m/theme/ThemeProvider'
import { radius } from '@m/theme/colors'
import { Text } from './Text'

export function Card({
  children,
  style,
  onPress,
  accessibilityLabel,
}: {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  onPress?: () => void
  accessibilityLabel?: string
}) {
  const c = useColors()
  const base = [styles.card, { backgroundColor: c.card, borderColor: c.border }, style]
  if (!onPress) return <View style={base}>{children}</View>
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [base, pressed && { opacity: 0.85 }]}
    >
      {children}
    </Pressable>
  )
}

export function CardHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={styles.header}>
      <Text variant="subheading" accessibilityRole="header" style={{ flexShrink: 1 }}>
        {title}
      </Text>
      {action}
    </View>
  )
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.lg, padding: 14, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
})
