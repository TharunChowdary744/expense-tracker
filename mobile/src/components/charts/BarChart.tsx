import { useState } from 'react'
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native'
import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg'
import { useColors } from '@m/theme/ThemeProvider'
import { Text } from '../ui/Text'
import { labelEvery, niceScale, yOf } from './scale'

export interface BarSeries {
  name: string
  color: string
}

export interface BarGroup {
  key: string
  /** Short label under the bar(s). */
  label: string
  /** Longer label for the selection line and screen readers. */
  longLabel?: string
  /** One value per series. */
  values: number[]
}

const AXIS_WIDTH = 44
const LABEL_HEIGHT = 18

/**
 * Bars per group (one per series), with a y axis of compact labels and an optional dashed
 * guide line. Tapping a group shows its exact values above the chart.
 */
export function BarChart({
  data,
  series,
  height = 200,
  formatTick,
  formatValue,
  guide,
  accessibilityLabel,
  maxLabels = 7,
}: {
  data: readonly BarGroup[]
  series: readonly BarSeries[]
  height?: number
  formatTick: (value: number) => string
  formatValue: (value: number) => string
  /** A dashed horizontal line, e.g. an even daily share of a budget. */
  guide?: number
  accessibilityLabel: string
  maxLabels?: number
}) {
  const c = useColors()
  const [width, setWidth] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const all = data.flatMap((g) => g.values)
  const scale = niceScale(Math.min(0, ...all), Math.max(0, guide ?? 0, ...all))
  const plotHeight = height - LABEL_HEIGHT
  const plotWidth = Math.max(0, width - AXIS_WIDTH)
  const slot = data.length > 0 ? plotWidth / data.length : 0
  const groupGap = Math.min(8, slot * 0.25)
  const barWidth = Math.max(1, Math.min(28, (slot - groupGap) / Math.max(1, series.length)))
  const every = labelEvery(data.length, maxLabels)
  const zero = yOf(0, scale, plotHeight)
  const current = data.find((g) => g.key === selected)

  return (
    <View style={styles.wrap}>
      <View style={styles.legend}>
        {series.length > 1
          ? series.map((s) => (
              <View key={s.name} style={styles.legendItem}>
                <View style={[styles.swatch, { backgroundColor: s.color }]} />
                <Text variant="caption" tone="muted">
                  {s.name}
                </Text>
              </View>
            ))
          : null}
      </View>
      <Text variant="small" tone={current ? 'default' : 'muted'} accessibilityLiveRegion="polite">
        {current
          ? `${current.longLabel ?? current.label}: ${series
              .map(
                (s, i) =>
                  `${series.length > 1 ? `${s.name} ` : ''}${formatValue(current.values[i] ?? 0)}`,
              )
              .join(' · ')}`
          : 'Tap a bar to see its amount.'}
      </Text>
      <View
        style={{ height }}
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
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
            {data.map((g, gi) => {
              const x0 = AXIS_WIDTH + gi * slot + (slot - barWidth * series.length) / 2
              const dim = selected !== null && selected !== g.key
              return (
                <G key={g.key} opacity={dim ? 0.45 : 1}>
                  {series.map((s, si) => {
                    const v = g.values[si] ?? 0
                    const y = yOf(Math.max(0, v), scale, plotHeight)
                    const h = Math.abs(yOf(v, scale, plotHeight) - zero)
                    return (
                      <Rect
                        key={s.name}
                        x={x0 + si * barWidth}
                        y={v >= 0 ? y : zero}
                        width={Math.max(1, barWidth - 1)}
                        height={Math.max(v === 0 ? 0 : 1, h)}
                        rx={Math.min(3, barWidth / 3)}
                        fill={s.color}
                      />
                    )
                  })}
                  {gi % every === 0 ? (
                    <SvgText
                      x={AXIS_WIDTH + gi * slot + slot / 2}
                      y={height - 4}
                      fontSize={10}
                      fill={c.mutedForeground}
                      textAnchor="middle"
                    >
                      {g.label}
                    </SvgText>
                  ) : null}
                </G>
              )
            })}
            {guide !== undefined && guide > 0 ? (
              <Line
                x1={AXIS_WIDTH}
                x2={width}
                y1={yOf(guide, scale, plotHeight)}
                y2={yOf(guide, scale, plotHeight)}
                stroke={c.mutedForeground}
                strokeDasharray="4 4"
                strokeWidth={1}
              />
            ) : null}
          </Svg>
        ) : null}
        {/* Touch targets over each group (the SVG itself is not focusable). */}
        <View style={[StyleSheet.absoluteFill, styles.hits, { left: AXIS_WIDTH }]}>
          {data.map((g) => (
            <Pressable
              key={g.key}
              accessible={false}
              importantForAccessibility="no"
              style={{ width: slot, height: '100%' }}
              onPress={() => setSelected((s) => (s === g.key ? null : g.key))}
            />
          ))}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  legend: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  hits: { flexDirection: 'row' },
})
