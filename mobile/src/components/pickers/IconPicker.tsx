import { createElement } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { ICON_NAMES, getIcon, iconLabel } from '@/components/icons'
import { useColors } from '@m/theme/ThemeProvider'
import { radius } from '@m/theme/colors'
import { FieldShell } from '../ui/Field'

/** The selectable icons as a radio grid, drawn in the item's colour. */
export function IconPicker({
  label,
  value,
  onChange,
  color,
  error,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  color: string
  error?: string
}) {
  const c = useColors()
  return (
    <FieldShell label={label} error={error}>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.grid}>
        {ICON_NAMES.map((name) => {
          const selected = value === name
          return (
            <Pressable
              key={name}
              accessibilityRole="radio"
              accessibilityLabel={iconLabel(name)}
              accessibilityState={{ checked: selected }}
              onPress={() => onChange(name)}
              style={[
                styles.cell,
                { borderColor: selected ? color : c.border },
                selected && { backgroundColor: color },
              ]}
            >
              {createElement(getIcon(name), { size: 20, color: selected ? '#fff' : c.foreground })}
            </Pressable>
          )
        })}
      </View>
    </FieldShell>
  )
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
