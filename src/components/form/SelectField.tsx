import { useId, type ComponentProps, type ReactNode } from 'react'
import { cn } from '@/utils/cn'

interface Props extends Omit<ComponentProps<'select'>, 'id'> {
  label: string
  error?: string
  hint?: string
  children: ReactNode
}

/** Labelled native select (best keyboard and mobile support) for react-hook-form `register`. */
export function SelectField({ label, error, hint, className, children, ...selectProps }: Props) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          'flex h-9 w-full rounded-md border bg-background px-3 py-1 text-base shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive md:text-sm',
          className,
        )}
        {...selectProps}
      >
        {children}
      </select>
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
