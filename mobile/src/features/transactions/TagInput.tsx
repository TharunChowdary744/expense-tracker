import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import { TAGS_MAX, normalizeTag } from '@/features/transactions/schemas'
import { Chip } from '@m/components/ui/Controls'
import { TextField } from '@m/components/ui/Field'

/** Tags as chips: type one and press return (or a comma) to add it; tap a chip to remove it. */
export function TagInput({
  label,
  value,
  onChange,
  suggestions = [],
  error,
  hint = 'Press return or type a comma to add a tag.',
  max = TAGS_MAX,
}: {
  label: string
  value: string[]
  onChange: (tags: string[]) => void
  suggestions?: readonly string[]
  error?: string
  hint?: string
  max?: number
}) {
  const [draft, setDraft] = useState('')

  function add(raw: string) {
    const tag = normalizeTag(raw)
    setDraft('')
    if (!tag || value.includes(tag) || value.length >= max) return
    onChange([...value, tag])
  }

  const q = normalizeTag(draft)
  const options = suggestions
    .filter((s) => !value.includes(s) && (!q || s.includes(q)))
    .slice(0, 12)

  return (
    <View style={{ gap: 8 }}>
      <TextField
        label={label}
        value={draft}
        autoCapitalize="none"
        autoCorrect={false}
        editable={value.length < max}
        placeholder={value.length >= max ? `Up to ${max} tags` : 'Add a tag'}
        error={error}
        hint={hint}
        returnKeyType="done"
        submitBehavior="submit"
        onChangeText={(text) => {
          if (text.endsWith(',')) add(text.slice(0, -1))
          else setDraft(text)
        }}
        onSubmitEditing={() => draft.trim() && add(draft)}
        onBlur={() => draft.trim() && add(draft)}
      />
      {value.length > 0 ? (
        <View accessibilityLabel={`Selected ${label.toLowerCase()}`} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {value.map((tag) => (
            <Chip key={tag} label={`#${tag}`} onRemove={() => onChange(value.filter((t) => t !== tag))} />
          ))}
        </View>
      ) : null}
      {options.length > 0 && value.length < max ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {options.map((tag) => (
              <Chip key={tag} label={`+ #${tag}`} onPress={() => add(tag)} />
            ))}
          </View>
        </ScrollView>
      ) : null}
    </View>
  )
}
