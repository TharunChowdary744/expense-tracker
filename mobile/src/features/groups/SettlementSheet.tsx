import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { StyleSheet, View } from 'react-native'
import { useRecordSettlementMutation } from '@/features/groups/api'
import type { Debt } from '@/features/groups/balances'
import { useActor } from '@/features/groups/hooks/useActor'
import {
  SETTLEMENT_NOTE_MAX,
  settlementFormSchema,
  type SettlementFormInput,
  type SettlementFormValues,
} from '@/features/groups/schemas'
import type { Group } from '@/features/groups/types'
import { activity, memberLabel, memberName, orderedMemberIds } from '@/features/groups/utils'
import { actorName } from '@/features/groups/writes'
import { useUserSettings } from '@/features/settings/hooks'
import { useToast } from '@/features/ui/hooks'
import { calendarDate, deviceTimeZone, zonedTime } from '@/utils/dates'
import { formatMoney, fromMinor } from '@/utils/money'
import { FormDateField, FormSelectField, FormTextField } from '@m/components/form/Controlled'
import { FormMessage } from '@m/components/form/FormMessage'
import { Button } from '@m/components/ui/Button'
import { Sheet } from '@m/components/ui/Sheet'

export function SettlementSheet({
  group,
  initial,
  debts,
  onClose,
}: {
  group: Group
  /** Prefill from a suggested payment; null when closed. `{}` opens an empty form. */
  initial: Partial<Debt> | null
  /** Outstanding debts, to show how much is owed for the chosen pair. */
  debts: readonly Debt[]
  onClose: () => void
}) {
  return (
    <Sheet
      open={initial !== null}
      onClose={onClose}
      title="Record a payment"
      subtitle="Money one member paid another outside Ledgerly."
    >
      {initial !== null ? (
        <SettlementForm group={group} initial={initial} debts={debts} onDone={onClose} />
      ) : null}
    </Sheet>
  )
}

export function SettlementForm({
  group,
  initial,
  debts,
  onDone,
}: {
  group: Group
  initial: Partial<Debt>
  debts: readonly Debt[]
  onDone: () => void
}) {
  const actor = useActor()
  const toast = useToast()
  const { locale } = useUserSettings()
  const [record] = useRecordSettlementMutation()
  const [error, setError] = useState<string | null>(null)
  const schema = useMemo(() => settlementFormSchema(group.currency), [group.currency])
  const members = orderedMemberIds(group)
  const money = (minor: number) => formatMoney(minor, group.currency, locale)
  const options = members.map((id) => ({ value: id, label: memberLabel(group, id, actor.uid) }))
  const {
    handleSubmit,
    control,
    formState: { isSubmitting },
  } = useForm<SettlementFormInput, unknown, SettlementFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      fromUid: initial.from ?? actor.uid,
      toUid: initial.to ?? members.find((id) => id !== (initial.from ?? actor.uid)) ?? '',
      amount: initial.amount ? fromMinor(initial.amount, group.currency) : '',
      date: calendarDate(new Date()),
      note: '',
    },
  })
  const from = useWatch({ control, name: 'fromUid' })
  const to = useWatch({ control, name: 'toUid' })
  const owed = debts.find((d) => d.from === from && d.to === to)?.amount ?? 0

  const submit = handleSubmit(async (values) => {
    setError(null)
    const result = await record({
      actor,
      groupId: group.id,
      fromUid: values.fromUid,
      toUid: values.toUid,
      amount: values.amount,
      dateIso: zonedTime(values.date, deviceTimeZone(), 12).toISOString(),
      note: values.note,
      summary: activity.settlement(
        actorName(actor),
        memberName(group, values.fromUid),
        memberName(group, values.toUid),
        money(values.amount),
      ),
    })
    if ('error' in result) {
      setError(String(result.error))
      return
    }
    toast({
      title: 'Payment recorded',
      description: `${memberLabel(group, values.fromUid, actor.uid)} paid ${memberLabel(group, values.toUid, actor.uid)} ${money(values.amount)}.`,
      variant: 'success',
    })
    onDone()
  })

  return (
    <View style={styles.form}>
      {error ? <FormMessage kind="error">{error}</FormMessage> : null}
      <FormSelectField control={control} name="fromUid" label="Who paid" options={options} />
      <FormSelectField control={control} name="toUid" label="Paid to" options={options} />
      <FormTextField
        control={control}
        name="amount"
        label={`Amount (${group.currency})`}
        keyboardType="decimal-pad"
        hint={
          owed > 0
            ? `Owed: ${money(owed)}. Enter less to record a partial payment.`
            : from && to && from !== to
              ? 'Nothing is owed between them right now.'
              : undefined
        }
      />
      <FormDateField control={control} name="date" label="Date" />
      <FormTextField
        control={control}
        name="note"
        label="Note"
        autoComplete="off"
        maxLength={SETTLEMENT_NOTE_MAX}
        placeholder="e.g. UPI"
      />
      <View style={styles.actions}>
        <Button title="Cancel" variant="ghost" onPress={onDone} />
        <Button
          title={isSubmitting ? 'Saving…' : 'Record payment'}
          loading={isSubmitting}
          onPress={() => void submit()}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  form: { gap: 16 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, paddingTop: 8 },
})
