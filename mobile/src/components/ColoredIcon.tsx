import { createElement } from 'react'
import { View } from 'react-native'
import { getIcon } from '@/components/icons'

/** A round badge with a white icon on the item's colour. Decorative: the name is shown next to it. */
export function ColoredIcon({ icon, color, size = 36 }: { icon: string; color: string; size?: number }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {createElement(getIcon(icon), { size: Math.round(size * 0.45), color: '#ffffff' })}
    </View>
  )
}
