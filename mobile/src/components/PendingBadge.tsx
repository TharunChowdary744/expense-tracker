import { CloudOff } from 'lucide-react-native'
import { View } from 'react-native'
import { useColors } from '@m/theme/ThemeProvider'
import { Text } from './ui/Text'

/** Marks an item whose latest change is saved on this device but not yet synced. */
export function PendingBadge() {
  const c = useColors()
  return (
    <View
      accessibilityLabel="Not synced. It will sync when you are back online."
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: c.muted,
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 2,
      }}
    >
      <CloudOff size={12} color={c.mutedForeground} />
      <Text variant="caption" tone="muted">
        Not synced
      </Text>
    </View>
  )
}
