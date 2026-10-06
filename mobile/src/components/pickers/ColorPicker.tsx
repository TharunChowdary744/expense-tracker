import { Check } from 'lucide-react-native'
import { Pressable, StyleSheet, View } from 'react-native'
import { COLORS } from '@/components/icons'
import { useColors } from '@m/theme/ThemeProvider'
import { FieldShell } from '../ui/Field'

/** Colour swatches as a radio group. */
export function ColorPicker({
  label,
  value,
  onChange,
  error,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
}) {
  const c = useColors()
  return (
    <FieldShell label={label} error={error}>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.wrap}>
        {COLORS.map((color) => {
          const selected = value.toLowerCase() === color.value
          return (
            <Pressable
              key={color.value}
              accessibilityRole="radio"
              accessibilityLabel={color.label}
              accessibilityState={{ checked: selected }}
              onPress={() => onChange(color.value)}
              style={[
                styles.swatch,
                { backgroundColor: color.value },
                selected && { borderColor: c.foreground, borderWidth: 3 },
              ]}
            >
              {selected ? <Check size={16} color="#fff" /> : null}
            </Pressable>
          )
        })}
      </View>
    </FieldShell>
  )
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
