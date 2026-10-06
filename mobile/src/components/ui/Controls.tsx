import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker'
import { Calendar, Check, X } from 'lucide-react-native'
import { useState, type ReactNode } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native'
import { formatCalendarDate } from '@/utils/dates'
import { useColors, useTheme } from '@m/theme/ThemeProvider'
import { radius } from '@m/theme/colors'
import { Button } from './Button'
import { Dialog } from './Dialog'
import { FieldShell } from './Field'
import { Text } from './Text'

/** A row of mutually exclusive options (tabs or a segmented switch). */
export function Segmented<V extends string>({
  value,
  options,
  onChange,
  label,
  scrollable,
}: {
  value: V
  options: { value: V; label: string; badge?: number }[]
  onChange: (value: V) => void
  label?: string
  scrollable?: boolean
}) {
  const c = useColors()
  const items = options.map((o) => {
    const active = o.value === value
    return (
      <Pressable
        key={o.value}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        accessibilityLabel={o.badge ? `${o.label}, ${o.badge}` : o.label}
        onPress={() => onChange(o.value)}
        style={[
          styles.segment,
          scrollable ? styles.segmentScroll : styles.segmentFill,
          active && { backgroundColor: c.card, borderColor: c.border },
        ]}
      >
        <Text variant="small" weight={active ? '700' : '500'} tone={active ? 'default' : 'muted'}>
          {o.label}
        </Text>
        {o.badge ? (
          <View style={[styles.badge, { backgroundColor: c.destructive }]}>
            <Text variant="caption" weight="700" style={{ color: c.destructiveForeground }}>
              {o.badge}
            </Text>
          </View>
        ) : null}
      </Pressable>
    )
  })
  return (
    <View accessibilityRole="tablist" accessibilityLabel={label}>
      {scrollable ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.track, { backgroundColor: c.muted }]}
        >
          {items}
        </ScrollView>
      ) : (
        <View style={[styles.track, { backgroundColor: c.muted }]}>{items}</View>
      )}
    </View>
  )
}

export function SwitchRow({
  label,
  description,
  value,
  onChange,
  disabled,
}: {
  label: string
  description?: string
  value: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}) {
  const c = useColors()
  return (
    <View style={styles.switchRow}>
      <View style={{ flex: 1 }}>
        <Text>{label}</Text>
        {description ? (
          <Text variant="small" tone="muted">
            {description}
          </Text>
        ) : null}
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: c.primary, false: c.input }}
        thumbColor={Platform.OS === 'android' ? c.card : undefined}
      />
    </View>
  )
}

export function Checkbox({
  checked,
  onChange,
  label,
  description,
  disabled,
  trailing,
  hideLabel,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
  disabled?: boolean
  trailing?: ReactNode
  /** Only screen readers get the label (the row next to the box already names it). */
  hideLabel?: boolean
}) {
  const c = useColors()
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: !!disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      style={[styles.checkRow, disabled && { opacity: 0.5 }]}
    >
      <View
        style={[
          styles.box,
          {
            borderColor: checked ? c.primary : c.input,
            backgroundColor: checked ? c.primary : 'transparent',
          },
        ]}
      >
        {checked ? <Check size={14} color={c.primaryForeground} strokeWidth={3} /> : null}
      </View>
      {hideLabel ? null : (
        <View style={{ flex: 1 }}>
          <Text>{label}</Text>
          {description ? (
            <Text variant="small" tone="muted">
              {description}
            </Text>
          ) : null}
        </View>
      )}
      {trailing}
    </Pressable>
  )
}

/** A removable pill (active filters, tags). */
export function Chip({
  label,
  onRemove,
  onPress,
  selected,
}: {
  label: string
  onRemove?: () => void
  onPress?: () => void
  selected?: boolean
}) {
  const c = useColors()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={onRemove ? `Remove ${label}` : label}
      accessibilityState={selected === undefined ? undefined : { selected }}
      onPress={onRemove ?? onPress}
      style={[
        styles.chip,
        {
          borderColor: selected ? c.primary : c.border,
          backgroundColor: selected ? c.accent : c.card,
        },
      ]}
    >
      <Text variant="small" weight={selected ? '600' : undefined}>
        {label}
      </Text>
      {onRemove ? <X size={14} color={c.mutedForeground} /> : null}
    </Pressable>
  )
}

function toDate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12)
}

function toCalendar(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** A yyyy-MM-dd date picked with the platform's date picker. */
export function DateField({
  label,
  value,
  onChange,
  error,
  hint,
  minimumDate,
  maximumDate,
  placeholder = 'Choose a date',
  clearable,
}: {
  label?: string
  value: string
  onChange: (value: string) => void
  error?: string
  hint?: string
  minimumDate?: string
  maximumDate?: string
  placeholder?: string
  clearable?: boolean
}) {
  const c = useColors()
  const { dark } = useTheme()
  const [iosOpen, setIosOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(value)
  const shown = valid
    ? formatCalendarDate(value, undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : undefined

  const open = () => {
    const current = valid ? toDate(value) : new Date()
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current,
        mode: 'date',
        minimumDate: minimumDate ? toDate(minimumDate) : undefined,
        maximumDate: maximumDate ? toDate(maximumDate) : undefined,
        onValueChange: (_e, date) => onChange(toCalendar(date)),
      })
    } else {
      setDraft(valid ? value : toCalendar(new Date()))
      setIosOpen(true)
    }
  }

  return (
    <FieldShell label={label} error={error} hint={hint}>
      <View style={styles.dateRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label ?? 'Date'}: ${shown ?? 'not set'}`}
          accessibilityHint="Opens a date picker"
          onPress={open}
          style={[
            styles.dateTrigger,
            { borderColor: error ? c.destructive : c.input, backgroundColor: c.card },
          ]}
        >
          <Calendar size={18} color={c.mutedForeground} />
          <Text tone={shown ? 'default' : 'muted'}>{shown ?? placeholder}</Text>
        </Pressable>
        {clearable && valid ? (
          <Button title="Clear" variant="ghost" size="sm" onPress={() => onChange('')} />
        ) : null}
      </View>
      {Platform.OS === 'ios' ? (
        <Dialog
          open={iosOpen}
          onClose={() => setIosOpen(false)}
          title={label ?? 'Choose a date'}
          actions={
            <>
              <Button title="Cancel" variant="secondary" onPress={() => setIosOpen(false)} />
              <Button
                title="Done"
                onPress={() => {
                  onChange(draft)
                  setIosOpen(false)
                }}
              />
            </>
          }
        >
          <DateTimePicker
            value={toDate(draft || toCalendar(new Date()))}
            mode="date"
            display="inline"
            themeVariant={dark ? 'dark' : 'light'}
            accentColor={c.primary}
            minimumDate={minimumDate ? toDate(minimumDate) : undefined}
            maximumDate={maximumDate ? toDate(maximumDate) : undefined}
            onValueChange={(_e, date) => setDraft(toCalendar(date))}
          />
        </Dialog>
      ) : null}
    </FieldShell>
  )
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', borderRadius: radius.md, padding: 3, gap: 3 },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 36,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  segmentFill: { flex: 1, paddingHorizontal: 6 },
  segmentScroll: { paddingHorizontal: 14 },
  badge: { minWidth: 18, borderRadius: 9, paddingHorizontal: 5, alignItems: 'center' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  box: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    minHeight: 34,
  },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateTrigger: {
    flex: 1,
    minHeight: 46,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
})
