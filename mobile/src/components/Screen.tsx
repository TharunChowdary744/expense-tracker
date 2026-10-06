import type { ReactNode } from 'react'
import { RefreshControl, ScrollView, StyleSheet, View, type ScrollViewProps } from 'react-native'
import { useColors } from '@m/theme/ThemeProvider'

/** A scrolling screen body with the standard padding and room for the "+" button. */
export function Screen({
  children,
  scroll = true,
  refreshing,
  onRefresh,
  contentStyle,
  ...rest
}: {
  children: ReactNode
  scroll?: boolean
  refreshing?: boolean
  onRefresh?: () => void
  contentStyle?: ScrollViewProps['contentContainerStyle']
} & Omit<ScrollViewProps, 'children'>) {
  const c = useColors()
  if (!scroll) {
    return <View style={[styles.flex, { backgroundColor: c.background }]}>{children}</View>
  }
  return (
    <ScrollView
      style={[styles.flex, { backgroundColor: c.background }]}
      contentContainerStyle={[styles.content, contentStyle]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.primary} />
        ) : undefined
      }
      {...rest}
    >
      {children}
    </ScrollView>
  )
}

export const screenPadding = { padding: 16, paddingBottom: 112, gap: 16 } as const

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: screenPadding,
})
