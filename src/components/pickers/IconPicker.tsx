import { useId } from 'react'
import { ICON_NAMES, getIcon, iconLabel } from '@/components/icons'
import { cn } from '@/utils/cn'

interface Props {
  label: string
  value: string
  onChange: (value: string) => void
  color?: string
  error?: string
}

/**
 * Icon choice as a native radio group: Tab moves into the group, arrow keys move between
 * icons, and every option has an accessible name.
 */
export function IconPicker({ label, value, onChange, color, error }: Props) {
  const name = useId()
  const errorId = `${name}-error`
  return (
    <fieldset className="space-y-1.5" aria-describedby={error ? errorId : undefined}>
      <legend className="text-sm font-medium">{label}</legend>
      <div className="grid max-h-40 grid-cols-8 gap-1 overflow-y-auto rounded-md border p-2">
        {ICON_NAMES.map((icon) => {
          const Icon = getIcon(icon)
          const selected = value === icon
          return (
            <label
              key={icon}
              title={iconLabel(icon)}
              className={cn(
                'relative flex aspect-square cursor-pointer items-center justify-center rounded-md border border-transparent has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50',
                selected ? 'text-white' : 'hover:bg-accent',
              )}
              style={selected ? { backgroundColor: color ?? 'var(--primary)' } : undefined}
            >
              <input
                type="radio"
                name={name}
                value={icon}
                checked={selected}
                onChange={() => onChange(icon)}
                aria-label={iconLabel(icon)}
                className="sr-only"
              />
              <Icon className="size-4" aria-hidden />
            </label>
          )
        })}
      </div>
      {error && (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  )
}
