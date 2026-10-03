import { useId } from 'react'
import { Input } from '@/components/ui/input'
import { RANGE_PRESET_LABELS, type RangePreset } from '../utils'

export interface RangeValue {
  preset: RangePreset
  from: string
  to: string
}

interface Props {
  presets: readonly RangePreset[]
  value: RangeValue
  onChange: (next: RangeValue) => void
  /** Today (yyyy-MM-dd), used to fill an empty custom range. */
  today: string
}

const selectClass =
  'h-9 rounded-md border bg-background px-3 text-base shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm'

/** Period selector: a preset, or a custom from/to range (both days inclusive). */
export function RangePicker({ presets, value, onChange, today }: Props) {
  const id = useId()
  const invalid = value.preset === 'custom' && value.from && value.to && value.from > value.to
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1">
        <label htmlFor={`${id}-preset`} className="block text-xs font-medium text-muted-foreground">
          Period
        </label>
        <select
          id={`${id}-preset`}
          className={selectClass}
          value={value.preset}
          onChange={(e) => {
            const preset = e.target.value as RangePreset
            onChange(
              preset === 'custom' && (!value.from || !value.to)
                ? { preset, from: value.from || `${today.slice(0, 8)}01`, to: value.to || today }
                : { ...value, preset },
            )
          }}
        >
          {presets.map((p) => (
            <option key={p} value={p}>
              {RANGE_PRESET_LABELS[p]}
            </option>
          ))}
        </select>
      </div>
      {value.preset === 'custom' && (
        <>
          <div className="space-y-1">
            <label
              htmlFor={`${id}-from`}
              className="block text-xs font-medium text-muted-foreground"
            >
              From
            </label>
            <Input
              id={`${id}-from`}
              type="date"
              value={value.from}
              max={value.to || undefined}
              aria-invalid={invalid || undefined}
              onChange={(e) => onChange({ ...value, from: e.target.value })}
              className="w-40"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={`${id}-to`} className="block text-xs font-medium text-muted-foreground">
              To
            </label>
            <Input
              id={`${id}-to`}
              type="date"
              value={value.to}
              min={value.from || undefined}
              aria-invalid={invalid || undefined}
              onChange={(e) => onChange({ ...value, to: e.target.value })}
              className="w-40"
            />
          </div>
          {invalid && (
            <p role="alert" className="w-full text-sm text-destructive">
              The start date must be on or before the end date.
            </p>
          )}
        </>
      )}
    </div>
  )
}
