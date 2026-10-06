import { Controller, useWatch, type Control } from 'react-hook-form'
import { Pressable, StyleSheet, View } from 'react-native'
import { FREQUENCIES } from '@/features/recurring/engine'
import {
  FREQUENCY_LABELS,
  FREQUENCY_UNITS,
  RECURRING_MODES,
  RECURRING_MODE_LABELS,
} from '@/features/recurring/recurrence'
import type { TransactionFormInput, TransactionFormValues } from '@/features/transactions/schemas'
import { addCalendarDays, calendarWeekday, formatCalendarDate, isCalendarDate } from '@/utils/dates'
import { FormDateField, FormSelectField, FormTextField } from '@m/components/form/Controlled'
import { FieldShell } from '@m/components/ui/Field'
import { Text } from '@m/components/ui/Text'
import { useColors } from '@m/theme/ThemeProvider'
import { radius } from '@m/theme/colors'

const MODE_HINTS = {
  auto: 'Each one is added on its date, including any missed while the app was closed.',
  remind: 'Each one waits in "Upcoming & due" until you confirm or skip it.',
} as const

/** Monday first. */
const WEEK = [1, 2, 3, 4, 5, 6, 0]

export function ordinal(n: number): string {
  const rule = new Intl.PluralRules('en', { type: 'ordinal' }).select(n)
  return `${n}${{ one: 'st', two: 'nd', few: 'rd' }[rule as 'one'] ?? 'th'}`
}

type FormControl = Control<TransactionFormInput, unknown, TransactionFormValues>

/** The repeat section of the transaction form ("Make recurring"). */
export function RecurrenceFields({ control, locale }: { control: FormControl; locale?: string }) {
  const c = useColors()
  const frequency = useWatch({ control, name: 'recurrence.frequency' })
  const interval = useWatch({ control, name: 'recurrence.interval' })
  const ends = useWatch({ control, name: 'recurrence.ends' })
  const monthDay = useWatch({ control, name: 'recurrence.monthDay' })
  const startDate = useWatch({ control, name: 'date' })
  const validStart = isCalendarDate(startDate)
  const startDay = validStart ? Number(startDate.slice(8, 10)) : null
  const unit = frequency ? FREQUENCY_UNITS[frequency] : 'month'
  const plural = interval === '1' ? unit : `${unit}s`
  const weekdayName = (day: number, width: 'short' | 'long') =>
    formatCalendarDate(addCalendarDays('2023-01-01', day), locale, { weekday: width })
  const dayNumber = monthDay === 'start' ? startDay : monthDay === 'last' ? 31 : Number(monthDay)

  return (
    <View style={[styles.box, { borderColor: c.border, backgroundColor: c.muted }]}>
      <FormSelectField
        control={control}
        name="recurrence.frequency"
        label="Repeats"
        options={FREQUENCIES.map((f) => ({ value: f, label: FREQUENCY_LABELS[f] }))}
      />
      <FormTextField
        control={control}
        name="recurrence.interval"
        label="Interval"
        keyboardType="number-pad"
        hint={`Every ${interval || 'N'} ${plural}`}
      />

      {frequency === 'weekly' ? (
        <Controller
          control={control}
          name="recurrence.byWeekday"
          render={({ field }) => {
            const selected = field.value ?? []
            return (
              <FieldShell
                label="On"
                hint={
                  selected.length === 0 && validStart
                    ? `None picked: every ${weekdayName(calendarWeekday(startDate), 'long')}, like the start date.`
                    : undefined
                }
              >
                <View style={styles.days}>
                  {WEEK.map((day) => {
                    const on = selected.includes(day)
                    return (
                      <Pressable
                        key={day}
                        accessibilityRole="togglebutton"
                        accessibilityState={{ checked: on }}
                        accessibilityLabel={weekdayName(day, 'long')}
                        onPress={() => field.onChange(on ? selected.filter((d) => d !== day) : [...selected, day])}
                        style={[
                          styles.day,
                          { borderColor: on ? c.primary : c.input, backgroundColor: on ? c.primary : c.card },
                        ]}
                      >
                        <Text variant="small" style={{ color: on ? c.primaryForeground : c.foreground }}>
                          {weekdayName(day, 'short')}
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>
              </FieldShell>
            )
          }}
        />
      ) : null}

      {frequency === 'monthly' ? (
        <FormSelectField
          control={control}
          name="recurrence.monthDay"
          label="On"
          hint={
            dayNumber !== null && dayNumber > 28
              ? 'In shorter months it falls on the last day (for example 28 or 29 Feb, 30 Apr).'
              : undefined
          }
          options={[
            {
              value: 'start',
              label: startDay ? `The ${ordinal(startDay)} (like the start date)` : 'The start date’s day',
            },
            ...Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: `The ${ordinal(i + 1)}` })),
            { value: 'last', label: 'The last day of the month' },
          ]}
        />
      ) : null}

      <FormSelectField
        control={control}
        name="recurrence.ends"
        label="Ends"
        options={[
          { value: 'never', label: 'Never' },
          { value: 'on', label: 'On a date' },
          { value: 'after', label: 'After a number of times' },
        ]}
      />
      {ends === 'on' ? <FormDateField control={control} name="recurrence.endDate" label="End date" /> : null}
      {ends === 'after' ? (
        <FormTextField
          control={control}
          name="recurrence.count"
          label="Times"
          keyboardType="number-pad"
          hint="Counted from the start date."
        />
      ) : null}

      <Controller
        control={control}
        name="recurrence.mode"
        render={({ field }) => (
          <FieldShell label="When one is due">
            <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
              {RECURRING_MODES.map((mode) => {
                const on = field.value === mode
                return (
                  <Pressable
                    key={mode}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={`${RECURRING_MODE_LABELS[mode]}. ${MODE_HINTS[mode]}`}
                    onPress={() => field.onChange(mode)}
                    style={[styles.mode, { borderColor: on ? c.primary : c.border, backgroundColor: c.card }]}
                  >
                    <View style={[styles.radio, { borderColor: on ? c.primary : c.input }]}>
                      {on ? <View style={[styles.dot, { backgroundColor: c.primary }]} /> : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text weight="600">{RECURRING_MODE_LABELS[mode]}</Text>
                      <Text variant="small" tone="muted">
                        {MODE_HINTS[mode]}
                      </Text>
                    </View>
                  </Pressable>
                )
              })}
            </View>
          </FieldShell>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  box: { gap: 14, borderWidth: 1, borderRadius: radius.lg, padding: 12 },
  days: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  day: { minWidth: 44, height: 38, borderWidth: 1, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  mode: { flexDirection: 'row', gap: 10, borderWidth: 1, borderRadius: radius.md, padding: 10, alignItems: 'flex-start' },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  dot: { width: 10, height: 10, borderRadius: 5 },
})
