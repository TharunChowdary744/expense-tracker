import { X } from 'lucide-react'
import { useId, useState, type KeyboardEvent } from 'react'
import { Input } from '@/components/ui/input'
import { TAGS_MAX, normalizeTag } from '../schemas'

interface Props {
  label: string
  value: string[]
  onChange: (tags: string[]) => void
  suggestions?: readonly string[]
  error?: string
  hint?: string
  max?: number
}

/** Chips input: type a tag and press Enter or comma to add it (new tags are created on the fly). */
export function TagInput({
  label,
  value,
  onChange,
  suggestions = [],
  error,
  hint = 'Press Enter or comma to add a tag.',
  max = TAGS_MAX,
}: Props) {
  const id = useId()
  const listId = `${id}-list`
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const [draft, setDraft] = useState('')

  function add(raw: string) {
    const tag = normalizeTag(raw)
    setDraft('')
    if (!tag || value.includes(tag) || value.length >= max) return
    onChange([...value, tag])
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      if (draft.trim()) {
        e.preventDefault()
        add(draft)
      } else if (e.key === ',') e.preventDefault()
    } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  const options = suggestions.filter((s) => !value.includes(s)).slice(0, 50)

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={`Selected ${label.toLowerCase()}`}>
          {value.map((tag) => (
            <li
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-secondary py-0.5 pr-1 pl-2.5 text-xs font-medium"
            >
              #{tag}
              <button
                type="button"
                aria-label={`Remove tag ${tag}`}
                onClick={() => onChange(value.filter((t) => t !== tag))}
                className="rounded-full p-0.5 hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Input
        id={id}
        list={listId}
        value={draft}
        autoComplete="off"
        disabled={value.length >= max}
        placeholder={value.length >= max ? `Up to ${max} tags` : 'Add a tag'}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hintId}
        onChange={(e) => {
          const next = e.target.value
          // Picking a datalist suggestion replaces the text in one go (no typed inputType).
          const native = e.nativeEvent as InputEvent
          const picked = !native.inputType || native.inputType === 'insertReplacementText'
          if (picked && options.includes(next)) add(next)
          else setDraft(next)
        }}
        onKeyDown={onKeyDown}
        onBlur={() => draft.trim() && add(draft)}
      />
      <datalist id={listId}>
        {options.map((tag) => (
          <option key={tag} value={tag} />
        ))}
      </datalist>
      {error ? (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      ) : (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  )
}
