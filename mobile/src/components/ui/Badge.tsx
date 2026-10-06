import { StyleSheet, View } from 'react-native'
import { useColors } from '@m/theme/ThemeProvider'
import { radius } from '@m/theme/colors'
import { Text } from './Text'

export function Badge({
  label,
  tone = 'default',
}: {
  label: string
  tone?: 'default' | 'primary' | 'destructive' | 'warning' | 'success'
}) {
  const c = useColors()
  const fg = {
    default: c.mutedForeground,
    primary: c.primary,
    destructive: c.destructive,
    warning: c.warning,
    success: c.success,
  }[tone]
  return (
    <View style={[styles.badge, { borderColor: fg }]}>
      <Text variant="caption" weight="600" style={{ color: fg }}>
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
})
