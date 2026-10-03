import { useId } from 'react'
import {
  Controller,
  useWatch,
  type Control,
  type FieldErrors,
  type UseFormRegister,
} from 'react-hook-form'
import { SelectField } from '@/components/form/SelectField'
import { TextField } from '@/components/form/TextField'
import type { TransactionFormInput, TransactionFormValues } from '@/features/transactions/schemas'
import { cn } from '@/utils/cn'
import { addCalendarDays, calendarWeekday, formatCalendarDate, isCalendarDate } from '@/utils/dates'
import { FREQUENCIES } from '../engine'
import {
  FREQUENCY_LABELS,
  FREQUENCY_UNITS,
  RECURRING_MODES,
  RECURRING_MODE_LABELS,
} from '../recurrence'

const MODE_HINTS = {
  auto: 'Each one is added on its date, including any missed while the app was closed.',
  remind: 'Each one waits in "Upcoming & due" until you confirm or skip it.',
} as const

/** Monday first. 2023-01-02 was a Monday. */
const WEEK = [1, 2, 3, 4, 5, 6, 0]

function ordinal(n: number): string {
  const rule = new Intl.PluralRules('en', { type: 'ordinal' }).select(n)
  return `${n}${{ one: 'st', two: 'nd', few: 'rd' }[rule as 'one'] ?? 'th'}`
}

interface Props {
  control: Control<TransactionFormInput, unknown, TransactionFormValues>
  register: UseFormRegister<TransactionFormInput>
  errors: FieldErrors<TransactionFormInput>
  locale?: string
}

/** The repeat section of the transaction form ("Make recurring"). */
export function RecurrenceFields({ control, register, errors, locale }: Props) {
  const id = useId()
  const frequency = useWatch({ control, name: 'recurrence.frequency' })
  const interval = useWatch({ control, name: 'recurrence.interval' })
  const ends = useWatch({ control, name: 'recurrence.ends' })
  const monthDay = useWatch({ control, name: 'recurrence.monthDay' })
  const startDate = useWatch({ control, name: 'date' })
  const validStart = isCalendarDate(startDate)
  const startDay = validStart ? Number(startDate.slice(8, 10)) : null
  const e = errors.recurrence
  const unit = frequency ? FREQUENCY_UNITS[frequency] : 'month'
  const plural = interval === '1' ? unit : `${unit}s`
  const weekdayName = (day: number, width: 'short' | 'long') =>
    formatCalendarDate(addCalendarDays('2023-01-01', day), locale, { weekday: width })
  const dayNumber = monthDay === 'start' ? startDay : monthDay === 'last' ? 31 : Number(monthDay)

  return (
    <fieldset className="space-y-4 rounded-lg border bg-muted/40 p-3">
      <legend className="sr-only">Repeat</legend>
      <div className="grid grid-cols-2 gap-3">
        <SelectField label="Repeats" {...register('recurrence.frequency')}>
          {FREQUENCIES.map((f) => (
            <option key={f} value={f}>
              {FREQUENCY_LABELS[f]}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Interval"
          inputMode="numeric"
          autoComplete="off"
          error={e?.interval?.message}
          hint={`Every ${interval || 'N'} ${plural}`}
          {...register('recurrence.interval')}
        />
      </div>

      {frequency === 'weekly' && (
        <Controller
          control={control}
          name="recurrence.byWeekday"
          render={({ field }) => {
            const selected = field.value ?? []
            return (
              <div className="space-y-1.5">
                <p id={`${id}-days`} className="text-sm font-medium">
                  On
                </p>
                <div role="group" aria-labelledby={`${id}-days`} className="flex flex-wrap gap-1.5">
                  {WEEK.map((day) => {
                    const on = selected.includes(day)
                    return (
                      <button
                        key={day}
                        type="button"
                        aria-pressed={on}
                        aria-label={weekdayName(day, 'long')}
                        onClick={() =>
                          field.onChange(
                            on ? selected.filter((d) => d !== day) : [...selected, day],
                          )
                        }
                        className={cn(
                          'h-9 min-w-11 rounded-md border px-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                          on
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'bg-background',
                        )}
                      >
                        {weekdayName(day, 'short')}
                      </button>
                    )
                  })}
                </div>
                {selected.length === 0 && validStart && (
                  <p className="text-xs text-muted-foreground">
                    None picked: every {weekdayName(calendarWeekday(startDate), 'long')}, like the
                    start date.
                  </p>
                )}
              </div>
            )
          }}
        />
      )}

      {frequency === 'monthly' && (
        <SelectField
          label="On"
          error={e?.monthDay?.message}
          hint={
            dayNumber !== null && dayNumber > 28
              ? 'In shorter months it falls on the last day (for example 28 or 29 Feb, 30 Apr).'
              : undefined
          }
          {...register('recurrence.monthDay')}
        >
          <option value="start">
            {startDay ? `The ${ordinal(startDay)} (like the start date)` : 'The start date’s day'}
          </option>
          {Array.from({ length: 31 }, (_, i) => (
            <option key={i + 1} value={String(i + 1)}>
              The {ordinal(i + 1)}
            </option>
          ))}
          <option value="last">The last day of the month</option>
        </SelectField>
      )}

      <div className="grid grid-cols-2 gap-3">
        <SelectField label="Ends" {...register('recurrence.ends')}>
          <option value="never">Never</option>
          <option value="on">On a date</option>
          <option value="after">After a number of times</option>
        </SelectField>
        {ends === 'on' && (
          <TextField
            label="End date"
            type="date"
            error={e?.endDate?.message}
            {...register('recurrence.endDate')}
          />
        )}
        {ends === 'after' && (
          <TextField
            label="Times"
            inputMode="numeric"
            autoComplete="off"
            error={e?.count?.message}
            hint="Counted from the start date."
            {...register('recurrence.count')}
          />
        )}
      </div>

      <div role="radiogroup" aria-labelledby={`${id}-mode`} className="space-y-2">
        <p id={`${id}-mode`} className="text-sm font-medium">
          When one is due
        </p>
        {RECURRING_MODES.map((mode) => (
          <label
            key={mode}
            className="flex cursor-pointer items-start gap-2 rounded-md border bg-background p-2.5 text-sm has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50"
          >
            <input
              type="radio"
              value={mode}
              className="mt-0.5 accent-[var(--primary)]"
              {...register('recurrence.mode')}
            />
            <span>
              <span className="font-medium">{RECURRING_MODE_LABELS[mode]}</span>
              <span className="block text-xs text-muted-foreground">{MODE_HINTS[mode]}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
