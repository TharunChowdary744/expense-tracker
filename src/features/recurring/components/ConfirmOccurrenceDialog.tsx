import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { FormMessage } from '@/components/form/FormMessage'
import { TextField } from '@/components/form/TextField'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useUid } from '@/features/auth/hooks'
import { useToast } from '@/features/ui/hooks'
import { formatCalendarDate } from '@/utils/dates'
import { formatMoney, fromMinor } from '@/utils/money'
import { useConfirmOccurrenceMutation } from '../api'
import { confirmFormSchema, type ConfirmFormInput, type ConfirmFormValues } from '../confirm'
import type { PendingOccurrence } from '../types'

interface Props {
  item: PendingOccurrence | null
  title: string
  baseCurrency: string
  locale?: string
  onOpenChange: (open: boolean) => void
}

/** Confirms a remind-mode occurrence: posts it, with the amount editable. */
export function ConfirmOccurrenceDialog({
  item,
  title,
  baseCurrency,
  locale,
  onOpenChange,
}: Props) {
  return (
    <Dialog open={item !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle className="text-lg font-semibold">Confirm {title}</DialogTitle>
        {item && (
          <ConfirmForm
            key={item.txId}
            item={item}
            title={title}
            baseCurrency={baseCurrency}
            locale={locale}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function ConfirmForm({
  item,
  title,
  baseCurrency,
  locale,
  onDone,
}: {
  item: PendingOccurrence
  title: string
  baseCurrency: string
  locale?: string
  onDone: () => void
}) {
  const uid = useUid()
  const toast = useToast()
  const [confirm] = useConfirmOccurrenceMutation()
  const [error, setError] = useState<string | null>(null)
  const t = item.rule.template
  const schema = useMemo(
    () => confirmFormSchema({ currency: t.currency, baseCurrency, fxRateToBase: t.fxRateToBase }),
    [t.currency, t.fxRateToBase, baseCurrency],
  )
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ConfirmFormInput, unknown, ConfirmFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { amount: fromMinor(t.amount, t.currency) },
  })
  const date = formatCalendarDate(item.occurrence.date, locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  async function submit(values: ConfirmFormValues) {
    setError(null)
    const result = await confirm({
      uid,
      ruleId: item.rule.id,
      key: item.occurrence.key,
      amount: values.amount,
      baseAmount: values.baseAmount,
    })
    if ('error' in result) {
      setError(String(result.error))
      return
    }
    toast({
      title: `${title} posted`,
      description: `${formatMoney(values.amount, t.currency, locale)} on ${date}.`,
      variant: 'success',
    })
    onDone()
  }

  return (
    <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
      <DialogDescription className="text-sm text-muted-foreground">
        Posts this occurrence dated {date}. Change the amount if this one is different.
      </DialogDescription>
      {error && <FormMessage kind="error">{error}</FormMessage>}
      <TextField
        label={`Amount (${t.currency})`}
        inputMode="decimal"
        autoComplete="off"
        // eslint-disable-next-line jsx-a11y/no-autofocus -- the dialog exists to check the amount
        autoFocus
        error={errors.amount?.message}
        {...register('amount')}
      />
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Posting…' : 'Confirm and post'}
        </Button>
      </div>
    </form>
  )
}
