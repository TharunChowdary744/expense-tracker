import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native'
import { useColors } from '@m/theme/ThemeProvider'

type Variant = 'title' | 'heading' | 'subheading' | 'body' | 'small' | 'caption'
type Tone =
  | 'default'
  | 'muted'
  | 'primary'
  | 'destructive'
  | 'success'
  | 'warning'
  | 'inverse'
  | 'income'
  | 'expense'

const VARIANTS: Record<Variant, TextStyle> = {
  title: { fontSize: 26, fontWeight: '700', lineHeight: 32 },
  heading: { fontSize: 19, fontWeight: '600', lineHeight: 25 },
  subheading: { fontSize: 16, fontWeight: '600', lineHeight: 22 },
  body: { fontSize: 15, lineHeight: 21 },
  small: { fontSize: 13, lineHeight: 18 },
  caption: { fontSize: 11.5, lineHeight: 15 },
}

export interface TextProps extends RNTextProps {
  variant?: Variant
  tone?: Tone
  weight?: TextStyle['fontWeight']
  align?: TextStyle['textAlign']
  tabular?: boolean
}

export function Text({
  variant = 'body',
  tone = 'default',
  weight,
  align,
  tabular,
  style,
  ...rest
}: TextProps) {
  const c = useColors()
  const color = {
    default: c.foreground,
    muted: c.mutedForeground,
    primary: c.primary,
    destructive: c.destructive,
    success: c.success,
    warning: c.warning,
    inverse: c.primaryForeground,
    income: c.success,
    expense: c.foreground,
  }[tone]
  return (
    <RNText
      maxFontSizeMultiplier={1.6}
      {...rest}
      style={[
        VARIANTS[variant],
        { color },
        weight ? { fontWeight: weight } : null,
        align ? { textAlign: align } : null,
        tabular ? { fontVariant: ['tabular-nums'] } : null,
        style,
      ]}
    />
  )
}
