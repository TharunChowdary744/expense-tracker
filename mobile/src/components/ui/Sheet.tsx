import { X } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useColors } from '@m/theme/ThemeProvider'
import { IconButton } from './Button'
import { Text } from './Text'

/**
 * A full-height modal sheet with a title bar, a scrolling body and an optional sticky footer.
 * Android's back button and iOS's swipe-down close it through `onClose`.
 */
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  scroll = true,
  headerRight,
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
  scroll?: boolean
  headerRight?: ReactNode
}) {
  const c = useColors()
  return (
    <Modal
      visible={open}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={onClose}
    >
      <SafeAreaView
        style={[styles.root, { backgroundColor: c.background }]}
        edges={Platform.OS === 'ios' ? ['bottom'] : ['top', 'bottom']}
      >
        <View style={[styles.header, { borderBottomColor: c.border }]}>
          <IconButton icon={X} label="Close" onPress={onClose} />
          <View style={styles.titles}>
            <Text variant="subheading" accessibilityRole="header" numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text variant="small" tone="muted" numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          <View style={styles.right}>{headerRight}</View>
        </View>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {scroll ? (
            <ScrollView
              style={styles.flex}
              contentContainerStyle={styles.body}
              keyboardShouldPersistTaps="handled"
            >
              {children}
            </ScrollView>
          ) : (
            <View style={styles.flex}>{children}</View>
          )}
          {footer ? (
            <View style={[styles.footer, { borderTopColor: c.border, backgroundColor: c.card }]}>
              {footer}
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  titles: { flex: 1, alignItems: 'center' },
  right: { minWidth: 40, alignItems: 'flex-end' },
  body: { padding: 16, gap: 16, paddingBottom: 32 },
  footer: {
    padding: 12,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
})
