import { View } from 'react-native'
import { useColors } from '@m/theme/ThemeProvider'

/** A thin horizontal bar: `value / max` of the track. Decorative; the number is shown as text. */
export function Meter({ value, max, color }: { value: number; max: number; color: string }) {
  const c = useColors()
  const width = max > 0 ? Math.max(1, Math.round((value / max) * 100)) : 0
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ height: 8, borderRadius: 4, backgroundColor: c.muted, overflow: 'hidden' }}
    >
      <View
        style={{ width: `${width}%`, height: '100%', borderRadius: 4, backgroundColor: color }}
      />
    </View>
  )
}
