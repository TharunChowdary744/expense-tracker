import { X } from 'lucide-react-native'
import { useEffect } from 'react'
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { toastDismissed } from '@/features/ui/slice'
import type { Toast } from '@/features/ui/types'
import { useColors } from '@m/theme/ThemeProvider'
import { radius } from '@m/theme/colors'
import { Text } from './ui/Text'

const DURATION_MS = 5000
const VISIBLE = 3

function ToastCard({ toast }: { toast: Toast }) {
  const c = useColors()
  const dispatch = useAppDispatch()
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(
      toast.description ? `${toast.title}. ${toast.description}` : toast.title,
    )
    const timer = setTimeout(() => dispatch(toastDismissed(toast.id)), DURATION_MS)
    return () => clearTimeout(timer)
  }, [toast.id, toast.title, toast.description, dispatch])
  const border = { default: c.border, success: c.success, error: c.destructive }[toast.variant]
  return (
    <View
      accessibilityRole="alert"
      style={[styles.toast, { backgroundColor: c.card, borderColor: border }]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="small" weight="600">
          {toast.title}
        </Text>
        {toast.description ? (
          <Text variant="small" tone="muted">
            {toast.description}
          </Text>
        ) : null}
        {toast.action ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={toast.action.altText}
            onPress={() => {
              if (toast.action) dispatch(toast.action.onAction)
              dispatch(toastDismissed(toast.id))
            }}
            style={[styles.action, { borderColor: c.border }]}
          >
            <Text variant="small" weight="600">
              {toast.action.label}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss notification"
        hitSlop={8}
        onPress={() => dispatch(toastDismissed(toast.id))}
      >
        <X size={16} color={c.mutedForeground} />
      </Pressable>
    </View>
  )
}

/** Shows the ui slice's toasts above the tab bar; each closes after 5 seconds. */
export function Toaster() {
  const toasts = useAppSelector((s) => s.ui.toasts)
  const insets = useSafeAreaInsets()
  if (toasts.length === 0) return null
  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom: insets.bottom + 76 }]}>
      {toasts.slice(-VISIBLE).map((t) => (
        <ToastCard key={t.id} toast={t} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 12, right: 12, gap: 8 },
  toast: {
    flexDirection: 'row',
    gap: 10,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  action: {
    alignSelf: 'flex-start',
    marginTop: 6,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
})
