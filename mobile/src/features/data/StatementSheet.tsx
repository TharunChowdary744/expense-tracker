import { FileText } from 'lucide-react-native'
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useGetAccountsQuery } from '@/features/accounts/api'
import { useAuth, useUid } from '@/features/auth/hooks'
import { useGetCategoriesQuery } from '@/features/categories/api'
import { useLazyFetchTransactionsBetweenQuery } from '@/features/data/api'
import { statementData } from '@/features/data/pdf'
import { monthLabel } from '@/features/reports/utils'
import { useUserSettings } from '@/features/settings/hooks'
import { useToast } from '@/features/ui/hooks'
import { addCalendarMonths, calendarDate, startOfCalendarMonth } from '@/utils/dates'
import { Button } from '@m/components/ui/Button'
import { Dialog } from '@m/components/ui/Dialog'
import { SelectField } from '@m/components/ui/Select'
import { Text } from '@m/components/ui/Text'
import { shareStatementPdf } from './statement'

/** Picks a month and shares its PDF statement (summary, category breakdown, transactions). */
export function StatementSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
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

  async function create() {
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
      await shareStatementPdf(data, month.slice(0, 7), locale)
      toast({ title: `Statement for ${data.period} created`, variant: 'success' })
      onClose()
    } catch (e) {
      console.error('[data] statement failed', e)
      setError(e instanceof Error ? e.message : 'Could not create the statement.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Monthly statement (PDF)"
      description={`A summary, spending and income by category, and every transaction, in ${baseCurrency}.`}
      actions={
        <>
          <Button title="Cancel" variant="secondary" onPress={onClose} />
          <Button
            title={busy ? 'Creating…' : 'Create PDF'}
            icon={FileText}
            loading={busy}
            disabled={!categories.data || !accounts.data}
            onPress={() => void create()}
          />
        </>
      }
    >
      <View style={styles.body}>
        <SelectField
          label="Month"
          value={month}
          onChange={setMonth}
          options={months.map((m) => ({
            value: m,
            label: monthLabel(m.slice(0, 7), locale, true),
          }))}
        />
        {error ? (
          <Text variant="small" tone="destructive" accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
      </View>
    </Dialog>
  )
}

const styles = StyleSheet.create({ body: { gap: 8 } })
