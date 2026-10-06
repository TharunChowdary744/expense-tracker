import { StyleSheet, View } from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'
import { useColors } from '@m/theme/ThemeProvider'
import { Text } from '../ui/Text'

export interface DonutSlice {
  id: string
  value: number
  color: string
}

/** The SVG path of a ring segment from angle a0 to a1 (radians, 0 = 12 o'clock). */
export function arcPath(cx: number, cy: number, r: number, inner: number, a0: number, a1: number) {
  const pt = (radius: number, a: number) => [cx + radius * Math.sin(a), cy - radius * Math.cos(a)]
  const large = a1 - a0 > Math.PI ? 1 : 0
  const [x0, y0] = pt(r, a0)
  const [x1, y1] = pt(r, a1)
  const [x2, y2] = pt(inner, a1)
  const [x3, y3] = pt(inner, a0)
  return [
    `M${x0},${y0}`,
    `A${r},${r} 0 ${large} 1 ${x1},${y1}`,
    `L${x2},${y2}`,
    `A${inner},${inner} 0 ${large} 0 ${x3},${y3}`,
    'Z',
  ].join(' ')
}

/** A ring chart with the total in the middle. The legend next to it is the way to interact. */
export function Donut({
  slices,
  size = 180,
  selectedId,
  centerLabel,
  centerValue,
  accessibilityLabel,
}: {
  slices: readonly DonutSlice[]
  size?: number
  selectedId?: string | null
  centerLabel: string
  centerValue: string
  accessibilityLabel: string
}) {
  const c = useColors()
  const total = slices.reduce((sum, s) => sum + Math.max(0, s.value), 0)
  const r = size / 2
  const inner = r * 0.6
  const gap = slices.length > 1 ? 0.012 : 0
  let angle = 0
  return (
    <View
      style={{ width: size, height: size }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      <Svg width={size} height={size}>
        {total <= 0 ? (
          <Circle
            cx={r}
            cy={r}
            r={(r + inner) / 2}
            stroke={c.muted}
            strokeWidth={r - inner}
            fill="none"
          />
        ) : slices.length === 1 ? (
          <Circle
            cx={r}
            cy={r}
            r={(r + inner) / 2}
            stroke={slices[0]?.color}
            strokeWidth={r - inner}
            fill="none"
          />
        ) : (
          slices.map((s) => {
            const sweep = (Math.max(0, s.value) / total) * Math.PI * 2
            const a0 = angle + gap
            const a1 = angle + sweep - gap
            angle += sweep
            if (a1 <= a0) return null
            const dim = selectedId && selectedId !== s.id
            return (
              <Path
                key={s.id}
                d={arcPath(r, r, r - 1, inner, a0, a1)}
                fill={s.color}
                opacity={dim ? 0.4 : 1}
              />
            )
          })
        )}
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
        <Text variant="caption" tone="muted">
          {centerLabel}
        </Text>
        <Text variant="small" weight="700" tabular>
          {centerValue}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
})
