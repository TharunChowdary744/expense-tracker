import * as DocumentPicker from 'expo-document-picker'
import { File } from 'expo-file-system'
import { router } from 'expo-router'
import { CircleAlert, CircleCheck, Copy, FileUp, Upload } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useAppSelector } from '@/app/hooks'
import { useGetAccountsQuery } from '@/features/accounts/api'
import { DEFAULT_CASH_ACCOUNT_ID } from '@/features/auth/defaults'
import { useUid } from '@/features/auth/hooks'
import { useGetCategoriesQuery } from '@/features/categories/api'
import {
  useImportTransactionsMutation,
  useLazyFetchTransactionsBetweenQuery,
} from '@/features/data/api'
import {
  daySpan,
  findDuplicates,
  guessDateFormat,
  guessMapping,
  mapRows,
  type ImportRow,
} from '@/features/data/csvImport'
import {
  mappingDefaults,
  type MappingFormInput,
  type MappingFormValues,
} from '@/features/data/schemas'
import { selectDataProgress } from '@/features/data/slice'
import { useUserSettings } from '@/features/settings/hooks'
import { parseCsv } from '@/utils/csv'
import { formatCalendarDate } from '@/utils/dates'
import { formatMoney } from '@/utils/money'
import { FormMessage } from '@m/components/form/FormMessage'
import { Screen } from '@m/components/Screen'
import { Button } from '@m/components/ui/Button'
import { Card } from '@m/components/ui/Card'
import { Checkbox } from '@m/components/ui/Controls'
import { ListBox } from '@m/components/ui/ListBox'
import { ErrorState, ListSkeleton } from '@m/components/ui/ListStates'
import { ProgressBar } from '@m/components/ui/ProgressBar'
import { Text } from '@m/components/ui/Text'
import { radius } from '@m/theme/colors'
import { useColors } from '@m/theme/ThemeProvider'
import { MappingForm } from './MappingForm'

/** Largest file the wizard reads (about 50,000 rows). */
const MAX_BYTES = 5 * 1024 * 1024
const PAGE = 100

type Step =
  | { name: 'upload' }
  | { name: 'map'; fileName: string; header: string[]; body: string[][]; form: MappingFormInput }
  | {
      name: 'preview'
      fileName: string
      header: string[]
      body: string[][]
      form: MappingFormInput
      rows: ImportRow[]
      duplicates: ReadonlySet<number>
      included: ReadonlySet<number>
    }
  | { name: 'done'; written: number; skipped: number; error: string | null }

const STEPS = [
  ['upload', 'Upload'],
  ['map', 'Map columns'],
  ['preview', 'Preview'],
  ['done', 'Import'],
] as const

export function ImportScreen() {
  const uid = useUid()
  const c = useColors()
  const { baseCurrency, locale } = useUserSettings()
  const accountsQuery = useGetAccountsQuery(uid)
  const categoriesQuery = useGetCategoriesQuery(uid)
  const [fetchExisting] = useLazyFetchTransactionsBetweenQuery()
  const [runImport, importState] = useImportTransactionsMutation()
  const progress = useAppSelector(selectDataProgress)
  const [step, setStep] = useState<Step>({ name: 'upload' })
  const [fileError, setFileError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [shown, setShown] = useState(PAGE)

  const accounts = useMemo(
    () => (accountsQuery.data ?? []).filter((a) => !a.archived),
    [accountsQuery.data],
  )
  const accountsById = useMemo(
    () => new Map((accountsQuery.data ?? []).map((a) => [a.id, a])),
    [accountsQuery.data],
  )
  const categoriesById = useMemo(
    () => new Map((categoriesQuery.data ?? []).map((cat) => [cat.id, cat])),
    [categoriesQuery.data],
  )

  async function chooseFile() {
    setFileError(null)
    const picked = await DocumentPicker.getDocumentAsync({
      type: [
        'text/csv',
        'text/comma-separated-values',
        'text/plain',
        'application/vnd.ms-excel',
        '*/*',
      ],
      copyToCacheDirectory: true,
    })
    const asset = picked.canceled ? undefined : picked.assets[0]
    if (!asset) return
    if ((asset.size ?? 0) > MAX_BYTES) {
      setFileError('This file is larger than 5 MB. Split it into smaller files.')
      return
    }
    try {
      const rows = parseCsv(await new File(asset.uri).text())
      const [header, ...body] = rows
      if (!header || body.length === 0) {
        setFileError('This file has no rows to import. It needs a header row and at least one row.')
        return
      }
      const mapping = guessMapping(header)
      const dates =
        mapping.date === undefined
          ? []
          : body.slice(0, 50).map((r) => r[mapping.date as number] ?? '')
      const fallbackAccount =
        accounts.find((a) => a.id === DEFAULT_CASH_ACCOUNT_ID)?.id ?? accounts[0]?.id ?? ''
      setStep({
        name: 'map',
        fileName: asset.name,
        header,
        body,
        form: mappingDefaults(mapping, guessDateFormat(dates), fallbackAccount),
      })
    } catch (e) {
      setFileError(e instanceof Error ? e.message : 'Could not read that file.')
    }
  }

  async function preview(values: MappingFormValues, form: MappingFormInput) {
    if (step.name !== 'map') return
    setBusy(true)
    setFileError(null)
    const rows = mapRows(step.body, values.mapping, {
      // Archived accounts still match by name; only active ones are offered as the default.
      accounts: accountsQuery.data ?? [],
      categories: categoriesQuery.data ?? [],
      defaultAccountId: values.accountId,
      baseCurrency,
      dateFormat: values.dateFormat,
      positiveIs: values.positiveIs,
    })
    const ok = rows.flatMap((r, i) => (r.ok ? [{ i, tx: r.tx }] : []))
    let duplicates = new Set<number>()
    const span = daySpan(ok.map((o) => o.tx.day))
    if (span) {
      const existing = await fetchExisting({ uid, ...span })
      if (existing.error || !existing.data) {
        setBusy(false)
        setFileError(`Couldn't check for duplicates: ${String(existing.error)}`)
        return
      }
      const found = findDuplicates(
        ok.map((o) => o.tx),
        existing.data,
      )
      duplicates = new Set([...found].map((k) => ok[k]?.i ?? -1))
    }
    const included = new Set(ok.map((o) => o.i).filter((i) => !duplicates.has(i)))
    setShown(PAGE)
    setBusy(false)
    setStep({ ...step, name: 'preview', form, rows, duplicates, included })
  }

  async function confirm() {
    if (step.name !== 'preview') return
    const txs = step.rows.flatMap((r, i) => (r.ok && step.included.has(i) ? [r.tx] : []))
    const currencies = Object.fromEntries((accountsQuery.data ?? []).map((a) => [a.id, a.currency]))
    const result = await runImport({ uid, txs, currencies })
    const skipped = step.rows.length - txs.length
    if ('error' in result) {
      const written = Number(/^Imported (\d+)/.exec(String(result.error))?.[1] ?? 0)
      setStep({ name: 'done', written, skipped, error: String(result.error) })
    } else {
      setStep({ name: 'done', written: result.data.written, skipped, error: null })
    }
  }

  const loading = accountsQuery.isLoading || categoriesQuery.isLoading
  const loadError = accountsQuery.error ?? categoriesQuery.error
  const stepIndex = STEPS.findIndex(([name]) => name === step.name)

  return (
    <Screen>
      <View accessibilityLabel="Import steps" style={styles.steps}>
        {STEPS.map(([name, label], i) => (
          <Text
            key={name}
            variant="small"
            weight={i === stepIndex ? '700' : undefined}
            tone={i === stepIndex ? 'default' : 'muted'}
            accessibilityState={{ selected: i === stepIndex }}
          >
            {i + 1}. {label}
          </Text>
        ))}
      </View>

      {loadError ? (
        <ErrorState
          title="Could not load your accounts"
          message={String(loadError)}
          onRetry={() => {
            void accountsQuery.refetch()
            void categoriesQuery.refetch()
          }}
        />
      ) : loading ? (
        <ListSkeleton rows={2} label="Loading" />
      ) : step.name === 'upload' ? (
        <Card>
          <Text variant="small" tone="muted">
            Choose a CSV file from your bank or from a Ledgerly export. You’ll match its columns,
            check a preview with duplicates flagged, and then import.
          </Text>
          {fileError ? <FormMessage kind="error">{fileError}</FormMessage> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose a CSV file, up to 5 MB"
            onPress={() => void chooseFile()}
            style={({ pressed }) => [
              styles.drop,
              { borderColor: c.border, backgroundColor: pressed ? c.accent : 'transparent' },
            ]}
          >
            <FileUp size={32} color={c.mutedForeground} />
            <Text weight="600">Choose a CSV file</Text>
            <Text variant="caption" tone="muted">
              Up to 5 MB
            </Text>
          </Pressable>
        </Card>
      ) : step.name === 'map' ? (
        <Card>
          <Text variant="small">
            <Text variant="small" weight="700">
              {step.fileName}
            </Text>
            : {step.body.length} row{step.body.length === 1 ? '' : 's'}
          </Text>
          {fileError ? <FormMessage kind="error">{fileError}</FormMessage> : null}
          <MappingForm
            header={step.header}
            sample={step.body.slice(0, 3)}
            accounts={accounts}
            defaultValues={step.form}
            busy={busy}
            onBack={() => setStep({ name: 'upload' })}
            onSubmit={(values) => {
              // Keep what was chosen so Back from the preview returns to the same mapping.
              const form = {
                ...step.form,
                columns: Object.fromEntries(
                  Object.keys(step.form.columns).map((k) => [
                    k,
                    values.mapping[k as keyof typeof values.mapping] === undefined
                      ? ''
                      : String(values.mapping[k as keyof typeof values.mapping]),
                  ]),
                ) as MappingFormInput['columns'],
                dateFormat: values.dateFormat,
                positiveIs: values.positiveIs,
                accountId: values.accountId,
              }
              void preview(values, form)
            }}
          />
        </Card>
      ) : step.name === 'preview' ? (
        <Preview
          step={step}
          shown={shown}
          onShowMore={() => setShown((n) => n + PAGE)}
          onToggle={(i) => {
            const included = new Set(step.included)
            if (included.has(i)) included.delete(i)
            else included.add(i)
            setStep({ ...step, included })
          }}
          onIncludeDuplicates={(on) => {
            const included = new Set(step.included)
            for (const i of step.duplicates) {
              if (on) included.add(i)
              else included.delete(i)
            }
            setStep({ ...step, included })
          }}
          onBack={() =>
            setStep({
              name: 'map',
              fileName: step.fileName,
              header: step.header,
              body: step.body,
              form: step.form,
            })
          }
          onImport={() => void confirm()}
          importing={importState.isLoading}
          progress={progress?.task === 'import' ? progress : null}
          accounts={accountsById}
          categories={categoriesById}
          locale={locale}
        />
      ) : (
        <Card>
          {step.error ? (
            <FormMessage kind="error">{step.error}</FormMessage>
          ) : (
            <View style={styles.done} accessibilityLiveRegion="polite">
              <CircleCheck size={20} color={c.success} />
              <Text weight="600">
                Imported {step.written} transaction{step.written === 1 ? '' : 's'}.
              </Text>
            </View>
          )}
          {step.skipped > 0 ? (
            <Text variant="small" tone="muted">
              {step.skipped} row{step.skipped === 1 ? ' was' : 's were'} skipped (duplicates,
              problems or unticked).
            </Text>
          ) : null}
          <View style={styles.buttons}>
            <Button title="See transactions" onPress={() => router.navigate('/transactions')} />
            <Button
              title="Import another file"
              icon={Upload}
              variant="outline"
              onPress={() => setStep({ name: 'upload' })}
            />
          </View>
        </Card>
      )}
    </Screen>
  )
}

function Preview({
  step,
  shown,
  onShowMore,
  onToggle,
  onIncludeDuplicates,
  onBack,
  onImport,
  importing,
  progress,
  accounts,
  categories,
  locale,
}: {
  step: Extract<Step, { name: 'preview' }>
  shown: number
  onShowMore: () => void
  onToggle: (index: number) => void
  onIncludeDuplicates: (on: boolean) => void
  onBack: () => void
  onImport: () => void
  importing: boolean
  progress: { done: number; total: number } | null
  accounts: ReadonlyMap<string, { name: string }>
  categories: ReadonlyMap<string, { name: string }>
  locale?: string
}) {
  const c = useColors()
  const errors = step.rows.filter((r) => !r.ok).length
  const ready = step.included.size
  const duplicatesIncluded = [...step.duplicates].filter((i) => step.included.has(i)).length

  return (
    <View style={styles.preview}>
      <Card>
        <View accessibilityLabel="Preview summary" style={styles.summary}>
          <Text variant="small">
            <Text variant="small" weight="700" tabular>
              {ready}
            </Text>{' '}
            to import
          </Text>
          <Text variant="small" tone={step.duplicates.size ? 'warning' : 'muted'}>
            <Text
              variant="small"
              weight="700"
              tabular
              tone={step.duplicates.size ? 'warning' : 'muted'}
            >
              {step.duplicates.size}
            </Text>{' '}
            possible duplicate{step.duplicates.size === 1 ? '' : 's'} (same date, amount and payee)
          </Text>
          <Text variant="small" tone={errors ? 'destructive' : 'muted'}>
            <Text variant="small" weight="700" tabular tone={errors ? 'destructive' : 'muted'}>
              {errors}
            </Text>{' '}
            row{errors === 1 ? '' : 's'} with problems
          </Text>
        </View>
        {step.duplicates.size > 0 ? (
          <Checkbox
            label="Import duplicates too"
            checked={duplicatesIncluded === step.duplicates.size}
            onChange={onIncludeDuplicates}
          />
        ) : null}
        {progress ? (
          <View style={styles.progress}>
            <Text variant="small">
              Importing transactions ({progress.done} of {progress.total})
            </Text>
            <ProgressBar
              value={progress.total > 0 ? progress.done / progress.total : 0}
              label="Importing transactions"
            />
          </View>
        ) : null}
        <View style={styles.buttonsSpread}>
          <Button title="Back" variant="outline" disabled={importing} onPress={onBack} />
          <Button
            title={
              importing ? 'Importing…' : `Import ${ready} transaction${ready === 1 ? '' : 's'}`
            }
            icon={Upload}
            loading={importing}
            disabled={ready === 0}
            onPress={onImport}
          />
        </View>
      </Card>

      <ListBox label="Rows to import">
        {step.rows.slice(0, shown).map((row, i) => {
          if (!row.ok) {
            return (
              <View key={row.line} style={[styles.row, { backgroundColor: c.muted }]}>
                <View style={styles.flex}>
                  <Text variant="caption" tone="muted">
                    Line {row.line}: {step.body[i]?.slice(0, 4).join(', ')}
                  </Text>
                  <View style={styles.inline}>
                    <CircleAlert size={14} color={c.destructive} />
                    <Text variant="small" tone="destructive" style={styles.flex}>
                      {row.error}
                    </Text>
                  </View>
                </View>
              </View>
            )
          }
          const { tx } = row
          const dup = step.duplicates.has(i)
          const signed = tx.type === 'expense' ? -tx.amount : tx.amount
          const amount = formatMoney(signed, tx.currency, locale, {
            signDisplay: tx.type === 'income' ? 'always' : 'auto',
          })
          const date = formatCalendarDate(tx.day, locale, {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })
          const where =
            tx.type === 'transfer'
              ? `${accounts.get(tx.accountId)?.name ?? ''} → ${accounts.get(tx.toAccountId ?? '')?.name ?? ''}`
              : `${tx.categoryId ? (categories.get(tx.categoryId)?.name ?? '') : 'Uncategorised'} · ${accounts.get(tx.accountId)?.name ?? ''}`
          const payee = tx.payee || tx.note || '—'
          return (
            <View key={row.line} style={[styles.row, dup && { backgroundColor: c.muted }]}>
              <Checkbox
                hideLabel
                label={`Import line ${row.line}: ${payee}, ${amount}, ${date}`}
                checked={step.included.has(i)}
                onChange={() => onToggle(i)}
              />
              <View style={styles.flex}>
                <Text variant="small" weight="600" numberOfLines={1}>
                  {payee}
                </Text>
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  Line {row.line} · {date} · {where}
                </Text>
                {dup ? (
                  <View style={styles.inline}>
                    <Copy size={12} color={c.warning} />
                    <Text variant="caption" tone="warning">
                      Duplicate
                    </Text>
                  </View>
                ) : row.warnings.length > 0 ? (
                  <Text variant="caption" tone="muted">
                    {row.warnings.join(' ')}
                  </Text>
                ) : null}
              </View>
              <Text
                variant="small"
                weight="600"
                tabular
                tone={tx.type === 'income' ? 'success' : 'default'}
              >
                {amount}
              </Text>
            </View>
          )
        })}
      </ListBox>
      {step.rows.length > shown ? (
        <Button
          title={`Show more (${step.rows.length - shown} left)`}
          variant="ghost"
          onPress={onShowMore}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  steps: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4 },
  drop: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.lg,
    padding: 28,
    alignItems: 'center',
    gap: 6,
  },
  done: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  buttonsSpread: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  preview: { gap: 12 },
  summary: { gap: 4 },
  progress: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10 },
  flex: { flex: 1, minWidth: 0 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
})
