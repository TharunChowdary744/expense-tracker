import { usePathname } from 'expo-router'
import { Plus } from 'lucide-react-native'
import { Pressable, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAppDispatch } from '@/app/hooks'
import { dialogOpened } from '@/features/ui/slice'
import { useColors } from '@m/theme/ThemeProvider'
import { TAB_PATHS, quickAddDialog, showsQuickAdd } from './quickAdd'

/** Floating "+": opens the transaction sheet, or the add-expense sheet on a group's page. */
export function QuickAddButton() {
  const c = useColors()
  const dispatch = useAppDispatch()
  const pathname = usePathname()
  const insets = useSafeAreaInsets()
  if (!showsQuickAdd(pathname)) return null
  const dialog = quickAddDialog(pathname)
  const onTabs = TAB_PATHS.includes(pathname)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        dialog.kind === 'group-expense' ? 'Add group expense' : 'Quick add transaction'
      }
      onPress={() => dispatch(dialogOpened(dialog))}
      style={({ pressed }) => [
        styles.fab,
        {
          backgroundColor: c.primary,
          bottom: (onTabs ? 64 : 16) + insets.bottom,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Plus size={28} color={c.primaryForeground} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 20,
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
})
