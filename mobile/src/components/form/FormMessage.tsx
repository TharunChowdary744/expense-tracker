import { View } from 'react-native'
import { useColors } from '@m/theme/ThemeProvider'
import { radius } from '@m/theme/colors'
import { Text } from '../ui/Text'

/** A form-level error or success message. */
export function FormMessage({
  kind,
  children,
}: {
  kind: 'error' | 'success' | 'info'
  children: string
}) {
  const c = useColors()
  const color =
    kind === 'error' ? c.destructive : kind === 'success' ? c.success : c.mutedForeground
  return (
    <View
      accessibilityRole={kind === 'error' ? 'alert' : 'text'}
      accessibilityLiveRegion="polite"
      style={{ borderWidth: 1, borderColor: color, borderRadius: radius.md, padding: 12 }}
    >
      <Text variant="small" style={{ color }}>
        {children}
      </Text>
    </View>
  )
}
