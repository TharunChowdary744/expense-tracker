import type { LucideIcon } from 'lucide-react-native'
import type { ReactNode } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { useColors } from '@m/theme/ThemeProvider'
import { radius } from '@m/theme/colors'
import { Text } from './Text'

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive'
type Size = 'sm' | 'md' | 'lg'

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  title?: string
  children?: ReactNode
  variant?: Variant
  size?: Size
  icon?: LucideIcon
  /** Drawn before the title, e.g. a brand mark. */
  leading?: ReactNode
  loading?: boolean
  block?: boolean
  style?: StyleProp<ViewStyle>
}

export function Button({
  title,
  children,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  leading,
  loading,
  block,
  disabled,
  style,
  accessibilityLabel,
  ...rest
}: ButtonProps) {
  const c = useColors()
  const palette = {
    primary: { bg: c.primary, fg: c.primaryForeground, border: c.primary },
    secondary: { bg: c.secondary, fg: c.secondaryForeground, border: c.secondary },
    outline: { bg: 'transparent', fg: c.foreground, border: c.border },
    ghost: { bg: 'transparent', fg: c.foreground, border: 'transparent' },
    destructive: { bg: c.destructive, fg: c.destructiveForeground, border: c.destructive },
  }[variant]
  const height = { sm: 36, md: 44, lg: 52 }[size]
  const inactive = disabled || loading
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      hitSlop={size === 'sm' ? 4 : 0}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: height,
          paddingHorizontal: size === 'sm' ? 12 : 16,
          backgroundColor: palette.bg,
          borderColor: palette.border,
          opacity: inactive ? 0.55 : pressed ? 0.8 : 1,
        },
        block && styles.block,
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} size="small" />
      ) : Icon ? (
        <Icon size={size === 'sm' ? 16 : 18} color={palette.fg} />
      ) : (
        leading
      )}
      {title ? (
        <Text variant={size === 'sm' ? 'small' : 'body'} weight="600" style={{ color: palette.fg }}>
          {title}
        </Text>
      ) : null}
      {children}
    </Pressable>
  )
}

export function IconButton({
  icon: Icon,
  label,
  onPress,
  color,
  size = 40,
  disabled,
  variant = 'ghost',
}: {
  icon: LucideIcon
  label: string
  onPress: () => void
  color?: string
  size?: number
  disabled?: boolean
  variant?: 'ghost' | 'secondary'
}) {
  const c = useColors()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={({ pressed }) => [
        styles.icon,
        {
          width: size,
          height: size,
          backgroundColor: variant === 'secondary' ? c.secondary : 'transparent',
          opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
        },
      ]}
    >
      <View pointerEvents="none">
        <Icon size={Math.round(size * 0.5)} color={color ?? c.foreground} />
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  block: { alignSelf: 'stretch' },
  icon: { alignItems: 'center', justifyContent: 'center', borderRadius: radius.full },
})
