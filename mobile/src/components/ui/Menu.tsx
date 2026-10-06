import { EllipsisVertical, type LucideIcon } from 'lucide-react-native'
import { useState } from 'react'
import { Modal, Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useColors } from '@m/theme/ThemeProvider'
import { radius } from '@m/theme/colors'
import { IconButton } from './Button'
import { Text } from './Text'

export interface MenuAction {
  label: string
  icon?: LucideIcon
  onPress: () => void
  destructive?: boolean
  disabled?: boolean
}

/** A "⋮" button that opens an action sheet of row actions. */
export function ActionMenu({ label, actions, title }: { label: string; actions: MenuAction[]; title?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <IconButton icon={EllipsisVertical} label={label} onPress={() => setOpen(true)} />
      <ActionSheet open={open} onClose={() => setOpen(false)} title={title} actions={actions} />
    </>
  )
}

export function ActionSheet({
  open,
  onClose,
  title,
  actions,
}: {
  open: boolean
  onClose: () => void
  title?: string
  actions: MenuAction[]
}) {
  const c = useColors()
  const insets = useSafeAreaInsets()
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={[styles.backdrop, { backgroundColor: c.overlay }]}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close menu"
      />
      <View
        accessibilityViewIsModal
        style={[
          styles.sheet,
          { backgroundColor: c.card, borderColor: c.border, paddingBottom: insets.bottom + 8 },
        ]}
      >
        {title ? (
          <Text variant="small" tone="muted" weight="600" style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        ) : null}
        {actions.map((action) => {
          const color = action.destructive ? c.destructive : c.foreground
          const Icon = action.icon
          return (
            <Pressable
              key={action.label}
              accessibilityRole="menuitem"
              accessibilityState={{ disabled: !!action.disabled }}
              disabled={action.disabled}
              onPress={() => {
                onClose()
                action.onPress()
              }}
              style={({ pressed }) => [
                styles.item,
                pressed && { backgroundColor: c.accent },
                action.disabled && { opacity: 0.4 },
              ]}
            >
              {Icon ? <Icon size={20} color={color} /> : null}
              <Text style={{ color }}>{action.label}</Text>
            </Pressable>
          )
        })}
        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          style={({ pressed }) => [styles.item, styles.cancel, pressed && { backgroundColor: c.accent }]}
        >
          <Text weight="600">Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    paddingTop: 8,
  },
  title: { paddingHorizontal: 20, paddingVertical: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, minHeight: 50 },
  cancel: { justifyContent: 'center' },
})
