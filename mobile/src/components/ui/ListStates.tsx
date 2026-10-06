import { CircleAlert, type LucideIcon } from 'lucide-react-native'
import { useEffect, useState, type ReactNode } from 'react'
import { Animated, StyleSheet, View } from 'react-native'
import { useColors } from '@m/theme/ThemeProvider'
import { radius } from '@m/theme/colors'
import { Button } from './Button'
import { Text } from './Text'

function Bone({
  width,
  height,
  round,
}: {
  width: number | `${number}%`
  height: number
  round?: boolean
}) {
  const c = useColors()
  const [pulse] = useState(() => new Animated.Value(0.5))
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [pulse])
  return (
    <Animated.View
      style={{
        width,
        height,
        borderRadius: round ? height / 2 : 6,
        backgroundColor: c.muted,
        opacity: pulse,
      }}
    />
  )
}

/** Loading placeholder for a list of rows. */
export function ListSkeleton({ rows = 4, label = 'Loading' }: { rows?: number; label?: string }) {
  const c = useColors()
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} style={{ gap: 8 }}>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={[styles.skeletonRow, { borderColor: c.border }]}>
          <Bone width={36} height={36} round />
          <View style={{ flex: 1, gap: 8 }}>
            <Bone width="70%" height={14} />
            <Bone width="40%" height={11} />
          </View>
          <Bone width={64} height={14} />
        </View>
      ))}
    </View>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon
  title: string
  description?: string
  action?: ReactNode
}) {
  const c = useColors()
  return (
    <View style={[styles.box, { borderColor: c.border, borderStyle: 'dashed' }]}>
      <Icon size={40} color={c.mutedForeground} />
      <Text weight="600" align="center">
        {title}
      </Text>
      {description ? (
        <Text variant="small" tone="muted" align="center">
          {description}
        </Text>
      ) : null}
      {action}
    </View>
  )
}

export function ErrorState({
  title = 'Could not load',
  message,
  onRetry,
}: {
  title?: string
  message: string
  onRetry: () => void
}) {
  const c = useColors()
  return (
    <View accessibilityRole="alert" style={[styles.box, { borderColor: c.destructive }]}>
      <CircleAlert size={32} color={c.destructive} />
      <Text weight="600">{title}</Text>
      <Text variant="small" tone="muted" align="center">
        {message}
      </Text>
      <Button title="Try again" variant="outline" onPress={onRetry} />
    </View>
  )
}

/** Picks skeleton, error, empty or content for an RTK Query result. */
export function QueryStates({
  isLoading,
  error,
  onRetry,
  isEmpty,
  empty,
  children,
  rows,
}: {
  isLoading: boolean
  error: unknown
  onRetry: () => void
  isEmpty?: boolean
  empty?: ReactNode
  children: ReactNode
  rows?: number
}) {
  if (isLoading) return <ListSkeleton rows={rows} />
  if (error)
    return (
      <ErrorState
        message={typeof error === 'string' ? error : 'Something went wrong. Try again.'}
        onRetry={onRetry}
      />
    )
  if (isEmpty) return <>{empty}</>
  return <>{children}</>
}

const styles = StyleSheet.create({
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 12,
  },
  box: {
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 28,
  },
})
