import { forwardRef, type ReactNode } from 'react'
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native'
import { useColors } from '@m/theme/ThemeProvider'
import { radius } from '@m/theme/colors'
import { Text } from './Text'

/** Label, control, hint and error for one form field. */
export function FieldShell({
  label,
  hint,
  error,
  children,
  right,
}: {
  label?: string
  hint?: string
  error?: string
  children: ReactNode
  right?: ReactNode
}) {
  return (
    <View style={styles.field}>
      {label || right ? (
        <View style={styles.labelRow}>
          {label ? (
            <Text variant="small" weight="600">
              {label}
            </Text>
          ) : (
            <View />
          )}
          {right}
        </View>
      ) : null}
      {children}
      {error ? (
        <Text variant="small" tone="destructive" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="small" tone="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  )
}

export interface TextFieldProps extends TextInputProps {
  label?: string
  hint?: string
  error?: string
  right?: ReactNode
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, hint, error, right, style, editable = true, ...rest },
  ref,
) {
  const c = useColors()
  return (
    <FieldShell label={label} hint={hint} error={error} right={right}>
      <TextInput
        ref={ref}
        accessibilityLabel={label ?? rest.placeholder}
        accessibilityHint={error ?? hint}
        placeholderTextColor={c.mutedForeground}
        editable={editable}
        style={[
          styles.input,
          {
            color: c.foreground,
            borderColor: error ? c.destructive : c.input,
            backgroundColor: editable ? c.card : c.muted,
          },
          rest.multiline ? styles.multiline : null,
          style,
        ]}
        {...rest}
      />
    </FieldShell>
  )
})

const styles = StyleSheet.create({
  field: { gap: 6 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  multiline: { minHeight: 84, textAlignVertical: 'top' },
})
