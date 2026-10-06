import { Delete } from 'lucide-react-native'
import { Pressable, StyleSheet, View } from 'react-native'
import { useColors } from '@m/theme/ThemeProvider'
import { radius } from '@m/theme/colors'
import { Text } from '@m/components/ui/Text'

const KEYS: { key: string; label: string; a11y?: string; op?: boolean }[] = [
  { key: '7', label: '7' },
  { key: '8', label: '8' },
  { key: '9', label: '9' },
  { key: '÷', label: '÷', a11y: 'Divide', op: true },
  { key: '4', label: '4' },
  { key: '5', label: '5' },
  { key: '6', label: '6' },
  { key: '×', label: '×', a11y: 'Multiply', op: true },
  { key: '1', label: '1' },
  { key: '2', label: '2' },
  { key: '3', label: '3' },
  { key: '−', label: '−', a11y: 'Minus', op: true },
  { key: '.', label: '.', a11y: 'Decimal point' },
  { key: '0', label: '0' },
  { key: 'back', label: '', a11y: 'Delete last character. Long press to clear.' },
  { key: '+', label: '+', a11y: 'Plus', op: true },
]

/** Calculator keypad for amounts (it replaces the system keyboard, like the web app on phones). */
export function AmountKeypad({ onKey }: { onKey: (key: string) => void }) {
  const c = useColors()
  return (
    <View accessibilityLabel="Amount keypad" style={styles.grid}>
      {KEYS.map(({ key, label, a11y, op }) => (
        <Pressable
          key={key}
          accessibilityRole="button"
          accessibilityLabel={a11y ?? label}
          onPress={() => onKey(key)}
          onLongPress={key === 'back' ? () => onKey('clear') : undefined}
          style={({ pressed }) => [
            styles.key,
            { backgroundColor: op ? c.secondary : c.muted },
            pressed && { backgroundColor: c.accent },
          ]}
        >
          {key === 'back' ? (
            <Delete size={22} color={c.foreground} />
          ) : (
            <Text variant="heading" weight="500" tone={op ? 'primary' : 'default'}>
              {label}
            </Text>
          )}
        </Pressable>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  key: {
    width: '23.5%',
    flexGrow: 1,
    height: 50,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
