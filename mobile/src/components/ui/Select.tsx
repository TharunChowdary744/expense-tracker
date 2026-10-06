import { Check, ChevronDown, Search } from 'lucide-react-native'
import { useMemo, useState, type ReactNode } from 'react'
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native'
import { useColors } from '@m/theme/ThemeProvider'
import { radius } from '@m/theme/colors'
import { Button } from './Button'
import { FieldShell } from './Field'
import { Sheet } from './Sheet'
import { Text } from './Text'

export interface SelectOption<V extends string = string> {
  value: V
  label: string
  description?: string
  /** Shown left of the label, e.g. a coloured category icon. */
  leading?: ReactNode
  /** Indents subcategories under their parent. */
  depth?: number
  /** A non-selectable heading row. */
  heading?: boolean
  disabled?: boolean
}

function OptionRow({
  option,
  selected,
  onPress,
  multi,
}: {
  option: SelectOption
  selected: boolean
  onPress: () => void
  multi?: boolean
}) {
  const c = useColors()
  if (option.heading) {
    return (
      <Text variant="caption" tone="muted" weight="700" style={styles.heading}>
        {option.label.toUpperCase()}
      </Text>
    )
  }
  return (
    <Pressable
      accessibilityRole={multi ? 'checkbox' : 'radio'}
      accessibilityState={{ checked: selected, disabled: !!option.disabled }}
      accessibilityLabel={option.label}
      disabled={option.disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        { paddingLeft: 12 + (option.depth ?? 0) * 20, opacity: option.disabled ? 0.45 : 1 },
        (pressed || selected) && { backgroundColor: c.accent },
      ]}
    >
      {option.leading}
      <View style={{ flex: 1 }}>
        <Text weight={selected ? '600' : undefined}>{option.label}</Text>
        {option.description ? (
          <Text variant="small" tone="muted">
            {option.description}
          </Text>
        ) : null}
      </View>
      {selected ? <Check size={18} color={c.primary} /> : null}
    </Pressable>
  )
}

function OptionList({
  options,
  isSelected,
  onPick,
  searchable,
  multi,
  empty,
}: {
  options: SelectOption[]
  isSelected: (v: string) => boolean
  onPick: (v: string) => void
  searchable: boolean
  multi?: boolean
  empty?: string
}) {
  const c = useColors()
  const [query, setQuery] = useState('')
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => !o.heading && o.label.toLowerCase().includes(q))
  }, [options, query])
  return (
    <View style={{ flex: 1 }}>
      {searchable ? (
        <View style={[styles.search, { borderColor: c.input, backgroundColor: c.card }]}>
          <Search size={16} color={c.mutedForeground} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search"
            placeholderTextColor={c.mutedForeground}
            accessibilityLabel="Search options"
            style={[styles.searchInput, { color: c.foreground }]}
            autoCorrect={false}
          />
        </View>
      ) : null}
      <FlatList
        data={shown}
        keyExtractor={(o, i) => (o.heading ? `h-${i}-${o.label}` : o.value)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 24 }}
        ListEmptyComponent={
          <Text tone="muted" align="center" style={{ padding: 24 }}>
            {empty ?? 'Nothing to choose from.'}
          </Text>
        }
        renderItem={({ item }) => (
          <OptionRow
            option={item}
            multi={multi}
            selected={!item.heading && isSelected(item.value)}
            onPress={() => onPick(item.value)}
          />
        )}
      />
    </View>
  )
}

function Trigger({
  text,
  placeholder,
  onPress,
  error,
  label,
  disabled,
}: {
  text: string | undefined
  placeholder: string
  onPress: () => void
  error?: string
  label?: string
  disabled?: boolean
}) {
  const c = useColors()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label ?? placeholder}: ${text ?? 'none'}`}
      accessibilityHint="Opens a list to choose from"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.trigger,
        {
          borderColor: error ? c.destructive : c.input,
          backgroundColor: disabled ? c.muted : c.card,
        },
      ]}
    >
      <Text tone={text ? 'default' : 'muted'} numberOfLines={1} style={{ flex: 1 }}>
        {text ?? placeholder}
      </Text>
      <ChevronDown size={18} color={c.mutedForeground} />
    </Pressable>
  )
}

export function SelectField<V extends string>({
  label,
  value,
  options,
  onChange,
  placeholder = 'Choose…',
  error,
  hint,
  searchable,
  disabled,
  title,
  empty,
}: {
  label?: string
  value: V | null | undefined
  options: SelectOption<V>[]
  onChange: (value: V) => void
  placeholder?: string
  error?: string
  hint?: string
  searchable?: boolean
  disabled?: boolean
  title?: string
  empty?: string
}) {
  const [open, setOpen] = useState(false)
  const current = options.find((o) => !o.heading && o.value === value)
  return (
    <FieldShell label={label} hint={hint} error={error}>
      <Trigger
        text={current?.label}
        placeholder={placeholder}
        onPress={() => setOpen(true)}
        error={error}
        label={label}
        disabled={disabled}
      />
      <Sheet open={open} onClose={() => setOpen(false)} title={title ?? label ?? 'Choose'} scroll={false}>
        <OptionList
          options={options}
          searchable={searchable ?? options.length > 12}
          isSelected={(v) => v === value}
          empty={empty}
          onPick={(v) => {
            onChange(v as V)
            setOpen(false)
          }}
        />
      </Sheet>
    </FieldShell>
  )
}

export function MultiSelectField<V extends string>({
  label,
  values,
  options,
  onChange,
  placeholder = 'Any',
  hint,
  error,
  title,
  summary,
}: {
  label?: string
  values: readonly V[]
  options: SelectOption<V>[]
  onChange: (values: V[]) => void
  placeholder?: string
  hint?: string
  error?: string
  title?: string
  summary?: (selected: SelectOption<V>[]) => string
}) {
  const [open, setOpen] = useState(false)
  const selected = options.filter((o) => !o.heading && values.includes(o.value))
  const text =
    selected.length === 0
      ? undefined
      : summary
        ? summary(selected)
        : selected.length <= 2
          ? selected.map((o) => o.label).join(', ')
          : `${selected.length} selected`
  return (
    <FieldShell label={label} hint={hint} error={error}>
      <Trigger text={text} placeholder={placeholder} onPress={() => setOpen(true)} label={label} error={error} />
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={title ?? label ?? 'Choose'}
        scroll={false}
        footer={
          <>
            <Button title="Clear" variant="ghost" onPress={() => onChange([])} />
            <Button title="Done" onPress={() => setOpen(false)} />
          </>
        }
      >
        <OptionList
          multi
          options={options}
          searchable={options.length > 12}
          isSelected={(v) => values.includes(v as V)}
          onPick={(v) =>
            onChange(
              values.includes(v as V) ? values.filter((x) => x !== v) : [...values, v as V],
            )
          }
        />
      </Sheet>
    </FieldShell>
  )
}

const styles = StyleSheet.create({
  trigger: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingRight: 16,
    minHeight: 48,
  },
  heading: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  searchInput: { flex: 1, minHeight: 42, fontSize: 16 },
})
