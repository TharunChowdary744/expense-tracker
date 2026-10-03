import { FileText } from 'lucide-react'
import { useState } from 'react'
import { SelectField } from '@/components/form/SelectField'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useGetAccountsQuery } from '@/features/accounts/api'
import { useAuth, useUid } from '@/features/auth/hooks'
import { useGetCategoriesQuery } from '@/features/categories/api'
import { monthLabel } from '@/features/reports/utils'
import { useUserSettings } from '@/features/settings/hooks'
import { useToast } from '@/features/ui/hooks'
import { addCalendarMonths, calendarDate, startOfCalendarMonth } from '@/utils/dates'
import { downloadFile } from '@/utils/download'
import { useLazyFetchTransactionsBetweenQuery } from '../api'
import { renderStatementPdf, statementData, statementFileName } from '../pdf'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Picks a month and downloads its PDF statement (summary, category breakdown, transactions). */
export function StatementDialog({ open, onOpenChange }: Props) {
  const uid = useUid()
  const { user } = useAuth()
  const toast = useToast()
  const { baseCurrency, locale } = useUserSettings()
  const accounts = useGetAccountsQuery(uid)
  const categories = useGetCategoriesQuery(uid)
  const [fetchMonth] = useLazyFetchTransactionsBetweenQuery()
  const thisMonth = startOfCalendarMonth(calendarDate(new Date()))
  const months = Array.from({ length: 24 }, (_, i) => addCalendarMonths(thisMonth, -i))
  const [month, setMonth] = useState(months[1] ?? thisMonth)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function download() {
    setBusy(true)
    setError(null)
    try {
      const result = await fetchMonth({ uid, start: month, end: addCalendarMonths(month, 1) })
      if (result.error || !result.data) throw new Error(String(result.error ?? 'No data'))
      const data = statementData({
        month: month.slice(0, 7),
        transactions: result.data,
        accounts: new Map((accounts.data ?? []).map((a) => [a.id, a])),
        categories: categories.data ?? [],
        baseCurrency,
        locale,
        name: user?.displayName ?? '',
        email: user?.email ?? '',
      })
      const blob = await renderStatementPdf(data, locale)
      downloadFile(blob, statementFileName(month.slice(0, 7)))
      toast({ title: `Statement for ${data.period} downloaded`, variant: 'success' })
      onOpenChange(false)
    } catch (e) {
      console.error('[data] statement failed', e)
      setError(e instanceof Error ? e.message : 'Could not create the statement.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle className="text-lg font-semibold">Monthly statement (PDF)</DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          A summary, spending and income by category, and every transaction, in {baseCurrency}.
        </DialogDescription>
        <SelectField label="Month" value={month} onChange={(e) => setMonth(e.target.value)}>
          {months.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m.slice(0, 7), locale, true)}
            </option>
          ))}
        </SelectField>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => void download()}
            disabled={busy || !categories.data || !accounts.data}
          >
            <FileText aria-hidden />
            {busy ? 'Creating…' : 'Download PDF'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
