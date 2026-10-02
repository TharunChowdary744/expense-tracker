import { Check } from 'lucide-react'
import { useId } from 'react'
import { COLORS } from '@/components/icons'
import { cn } from '@/utils/cn'

interface Props {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
}

/** Colour swatches as a native radio group (keyboard and screen-reader friendly). */
export function ColorPicker({ label, value, onChange, error }: Props) {
  const name = useId()
  const errorId = `${name}-error`
  return (
    <fieldset className="space-y-1.5" aria-describedby={error ? errorId : undefined}>
      <legend className="text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {COLORS.map((color) => {
          const selected = value.toLowerCase() === color.value
          return (
            <label
              key={color.value}
              title={color.label}
              className={cn(
                'relative flex size-8 cursor-pointer items-center justify-center rounded-full ring-offset-2 ring-offset-background has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring',
                selected && 'ring-2 ring-foreground',
              )}
              style={{ backgroundColor: color.value }}
            >
              <input
                type="radio"
                name={name}
                value={color.value}
                checked={selected}
                onChange={() => onChange(color.value)}
                aria-label={color.label}
                className="sr-only"
              />
              {selected && <Check className="size-4 text-white" aria-hidden />}
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
