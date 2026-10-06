import { View } from 'react-native'
import { useColors } from '@m/theme/ThemeProvider'

/** A horizontal bar; `value` is 0–1 (values above 1 fill the bar). */
export function ProgressBar({
  value,
  color,
  height = 8,
  label,
}: {
  value: number
  color?: string
  height?: number
  label?: string
}) {
  const c = useColors()
  const pct = Math.max(0, Math.min(1, value)) * 100
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
      style={{ height, borderRadius: height, backgroundColor: c.muted, overflow: 'hidden' }}
    >
      <View style={{ width: `${pct}%`, height, backgroundColor: color ?? c.primary }} />
    </View>
  )
}
