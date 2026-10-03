import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { FormMessage } from '@/components/form/FormMessage'
import { SelectField } from '@/components/form/SelectField'
import { TextField } from '@/components/form/TextField'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useUserSettings } from '@/features/settings/hooks'
import { useToast } from '@/features/ui/hooks'
import { calendarDate, deviceTimeZone, zonedTime } from '@/utils/dates'
import { formatMoney, fromMinor } from '@/utils/money'
import { useRecordSettlementMutation } from '../api'
import type { Debt } from '../balances'
import { useActor } from '../hooks/useActor'
import {
  SETTLEMENT_NOTE_MAX,
  settlementFormSchema,
  type SettlementFormInput,
  type SettlementFormValues,
} from '../schemas'
import type { Group } from '../types'
import { activity, memberLabel, memberName, orderedMemberIds } from '../utils'
import { actorName } from '../writes'

interface Props {
  group: Group
  /** Prefill from a suggested payment; null when closed. `{}` opens an empty form. */
  initial: Partial<Debt> | null
  /** Outstanding debts, to show how much is owed for the chosen pair. */
  debts: readonly Debt[]
  onOpenChange: (open: boolean) => void
}

export function SettlementDialog({ group, initial, debts, onOpenChange }: Props) {
  return (
    <Dialog open={initial !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogTitle className="text-lg font-semibold">Record a payment</DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          Money one member paid another outside Ledgerly. Pay part or all of what is owed.
        </DialogDescription>
        {initial !== null && (
          <SettlementForm
            group={group}
            initial={initial}
            debts={debts}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function SettlementForm({
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
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
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

  async function submit(values: SettlementFormValues) {
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
  }

  return (
    <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
      {error && <FormMessage kind="error">{error}</FormMessage>}
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Who paid" error={errors.fromUid?.message} {...register('fromUid')}>
          {members.map((id) => (
            <option key={id} value={id}>
              {memberLabel(group, id, actor.uid)}
            </option>
          ))}
        </SelectField>
        <SelectField label="Paid to" error={errors.toUid?.message} {...register('toUid')}>
          {members.map((id) => (
            <option key={id} value={id}>
              {memberLabel(group, id, actor.uid)}
            </option>
          ))}
        </SelectField>
      </div>
      <TextField
        label={`Amount (${group.currency})`}
        inputMode="decimal"
        autoComplete="off"
        hint={
          owed > 0
            ? `Owed: ${money(owed)}. Enter less to record a partial payment.`
            : from && to && from !== to
              ? 'Nothing is owed between them right now.'
              : undefined
        }
        error={errors.amount?.message}
        {...register('amount')}
      />
      <TextField label="Date" type="date" error={errors.date?.message} {...register('date')} />
      <TextField
        label="Note"
        autoComplete="off"
        maxLength={SETTLEMENT_NOTE_MAX}
        placeholder="e.g. UPI"
        error={errors.note?.message}
        {...register('note')}
      />
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Record payment'}
        </Button>
      </div>
    </form>
  )
}
