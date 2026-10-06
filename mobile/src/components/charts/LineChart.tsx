import { useState } from 'react'
import { StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native'
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg'
import { useColors } from '@m/theme/ThemeProvider'
import { Text } from '../ui/Text'
import { labelEvery, niceScale, yOf } from './scale'

export interface LinePoint {
  key: string
  label: string
  longLabel?: string
  value: number
}

const AXIS_WIDTH = 44
const LABEL_HEIGHT = 18

/** One line over time with a dashed zero line. Touch and drag to read a point. */
export function LineChart({
  points,
  color,
  height = 200,
  formatTick,
  formatValue,
  valueName,
  accessibilityLabel,
  maxLabels = 5,
}: {
  points: readonly LinePoint[]
  color: string
  height?: number
  formatTick: (value: number) => string
  formatValue: (value: number) => string
  valueName: string
  accessibilityLabel: string
  maxLabels?: number
}) {
  const c = useColors()
  const [width, setWidth] = useState(0)
  const [index, setIndex] = useState<number | null>(null)
  const values = points.map((p) => p.value)
  const scale = niceScale(Math.min(0, ...values), Math.max(0, ...values))
  const plotHeight = height - LABEL_HEIGHT
  const plotWidth = Math.max(0, width - AXIS_WIDTH - 8)
  const step = points.length > 1 ? plotWidth / (points.length - 1) : 0
  const xOf = (i: number) => AXIS_WIDTH + (points.length > 1 ? i * step : plotWidth / 2)
  const d = points
    .map(
      (p, i) =>
        `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(p.value, scale, plotHeight).toFixed(1)}`,
    )
    .join(' ')
  const every = labelEvery(points.length, maxLabels)
  const current = index === null ? undefined : points[index]

  function pick(e: GestureResponderEvent) {
    if (points.length === 0) return
    const x = e.nativeEvent.locationX - AXIS_WIDTH
    const i = step > 0 ? Math.round(x / step) : 0
    setIndex(Math.min(points.length - 1, Math.max(0, i)))
  }

  return (
    <View style={styles.wrap}>
      <Text variant="small" tone={current ? 'default' : 'muted'} accessibilityLiveRegion="polite">
        {current
          ? `${current.longLabel ?? current.label}: ${valueName} ${formatValue(current.value)}`
          : 'Touch the chart to read a day.'}
      </Text>
      <View
        style={{ height }}
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={pick}
        onResponderMove={pick}
        accessible
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel}
      >
        {width > 0 ? (
          <Svg width={width} height={height}>
            {scale.ticks.map((t) => {
              const y = yOf(t, scale, plotHeight)
              return (
                <G key={t}>
                  <Line
                    x1={AXIS_WIDTH}
                    x2={width}
                    y1={y}
                    y2={y}
                    stroke={c.border}
                    strokeWidth={1}
                    strokeDasharray={t === 0 ? '4 4' : undefined}
                  />
                  <SvgText
                    x={AXIS_WIDTH - 6}
                    y={y + 4}
                    fontSize={10}
                    fill={c.mutedForeground}
                    textAnchor="end"
                  >
                    {formatTick(t)}
                  </SvgText>
                </G>
              )
            })}
            <Path d={d} stroke={color} strokeWidth={2} fill="none" />
            {points.map((p, i) =>
              i % every === 0 ? (
                <SvgText
                  key={p.key}
                  x={xOf(i)}
                  y={height - 4}
                  fontSize={10}
                  fill={c.mutedForeground}
                  textAnchor="middle"
                >
                  {p.label}
                </SvgText>
              ) : null,
            )}
            {current && index !== null ? (
              <G>
                <Line
                  x1={xOf(index)}
                  x2={xOf(index)}
                  y1={0}
                  y2={plotHeight}
                  stroke={c.mutedForeground}
                  strokeWidth={1}
                />
                <Circle
                  cx={xOf(index)}
                  cy={yOf(current.value, scale, plotHeight)}
                  r={4}
                  fill={color}
                />
              </G>
            ) : null}
          </Svg>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
})
