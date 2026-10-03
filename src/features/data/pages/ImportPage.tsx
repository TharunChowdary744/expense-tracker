import { ArrowLeft, CircleAlert, CircleCheck, Copy, FileUp, Upload } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useAppSelector } from '@/app/hooks'
import { FormMessage } from '@/components/form/FormMessage'
import { ErrorState, ListSkeleton } from '@/components/ListStates'
import { Button } from '@/components/ui/button'
import { useGetAccountsQuery } from '@/features/accounts/api'
import { useUid } from '@/features/auth/hooks'
import { useGetCategoriesQuery } from '@/features/categories/api'
import { DEFAULT_CASH_ACCOUNT_ID } from '@/features/auth/defaults'
import { useUserSettings } from '@/features/settings/hooks'
import { cn } from '@/utils/cn'
import { parseCsv } from '@/utils/csv'
import { formatCalendarDate } from '@/utils/dates'
import { formatMoney } from '@/utils/money'
import { useImportTransactionsMutation, useLazyFetchTransactionsBetweenQuery } from '../api'
import { MappingForm } from '../components/MappingForm'
import { ProgressBar } from '../components/ProgressBar'
import {
  daySpan,
  findDuplicates,
  guessDateFormat,
  guessMapping,
  mapRows,
  type ImportRow,
} from '../csvImport'
import { mappingDefaults, type MappingFormInput, type MappingFormValues } from '../schemas'
import { selectDataProgress } from '../slice'

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

export function ImportPage() {
  const uid = useUid()
  const fileId = useId()
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
    () => new Map((categoriesQuery.data ?? []).map((c) => [c.id, c])),
    [categoriesQuery.data],
  )

  async function readFile(file: File) {
    setFileError(null)
    if (file.size > MAX_BYTES) {
      setFileError('This file is larger than 5 MB. Split it into smaller files.')
      return
    }
    const rows = parseCsv(await file.text())
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
      fileName: file.name,
      header,
      body,
      form: mappingDefaults(mapping, guessDateFormat(dates), fallbackAccount),
    })
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

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <Link
          to="/data"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Import and export
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Import transactions</h1>
        <StepList current={step.name} />
      </div>

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
        <div className="space-y-4 rounded-xl border bg-card p-6">
          <p className="text-sm text-muted-foreground">
            Choose a CSV file from your bank or from a Ledgerly export. You'll match its columns,
            check a preview with duplicates flagged, and then import.
          </p>
          {fileError && <FormMessage kind="error">{fileError}</FormMessage>}
          <label
            htmlFor={fileId}
            className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center focus-within:ring-[3px] focus-within:ring-ring/50 hover:bg-accent/50"
          >
            <FileUp className="size-8 text-muted-foreground" aria-hidden />
            <span className="font-medium">Choose a CSV file</span>
            <span className="text-xs text-muted-foreground">Up to 5 MB</span>
            <input
              id={fileId}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void readFile(file)
                e.target.value = ''
              }}
            />
          </label>
        </div>
      ) : step.name === 'map' ? (
        <div className="space-y-4 rounded-xl border bg-card p-6">
          <p className="text-sm">
            <strong>{step.fileName}</strong>: {step.body.length} row
            {step.body.length === 1 ? '' : 's'}
          </p>
          {fileError && <FormMessage kind="error">{fileError}</FormMessage>}
          <MappingForm
            header={step.header}
            sample={step.body.slice(0, 3)}
            accounts={accounts}
            defaultValues={step.form}
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
          {busy && <p className="text-sm text-muted-foreground">Checking for duplicates…</p>}
        </div>
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
          baseCurrency={baseCurrency}
          locale={locale}
        />
      ) : (
        <div className="space-y-4 rounded-xl border bg-card p-6">
          {step.error ? (
            <FormMessage kind="error">{step.error}</FormMessage>
          ) : (
            <p role="status" className="flex items-center gap-2 font-medium">
              <CircleCheck className="size-5 text-success" aria-hidden />
              Imported {step.written} transaction{step.written === 1 ? '' : 's'}.
            </p>
          )}
          {step.skipped > 0 && (
            <p className="text-sm text-muted-foreground">
              {step.skipped} row{step.skipped === 1 ? ' was' : 's were'} skipped (duplicates,
              problems or unticked).
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link to="/transactions">See transactions</Link>
            </Button>
            <Button variant="outline" onClick={() => setStep({ name: 'upload' })}>
              <Upload aria-hidden />
              Import another file
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}

const STEPS = [
  ['upload', 'Upload'],
  ['map', 'Map columns'],
  ['preview', 'Preview'],
  ['done', 'Import'],
] as const

function StepList({ current }: { current: Step['name'] }) {
  const index = STEPS.findIndex(([name]) => name === current)
  return (
    <ol className="flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Import steps">
      {STEPS.map(([name, label], i) => (
        <li
          key={name}
          aria-current={i === index ? 'step' : undefined}
          className={cn(i === index ? 'font-semibold text-foreground' : 'text-muted-foreground')}
        >
          {i + 1}. {label}
        </li>
      ))}
    </ol>
  )
}

interface PreviewProps {
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
  baseCurrency: string
  locale?: string
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
}: PreviewProps) {
  const errors = step.rows.filter((r) => !r.ok).length
  const ready = step.included.size
  const duplicatesIncluded = [...step.duplicates].filter((i) => step.included.has(i)).length
  const switchId = useId()

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-xl border bg-card p-4">
        <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm" aria-label="Preview summary">
          <li>
            <strong className="tabular-nums">{ready}</strong> to import
          </li>
          <li className={step.duplicates.size ? 'text-warning' : 'text-muted-foreground'}>
            <strong className="tabular-nums">{step.duplicates.size}</strong> possible duplicate
            {step.duplicates.size === 1 ? '' : 's'} (same date, amount and payee)
          </li>
          <li className={errors ? 'text-destructive' : 'text-muted-foreground'}>
            <strong className="tabular-nums">{errors}</strong> row{errors === 1 ? '' : 's'} with
            problems
          </li>
        </ul>
        {step.duplicates.size > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <input
              id={switchId}
              type="checkbox"
              className="size-4 accent-[var(--color-primary)]"
              checked={duplicatesIncluded === step.duplicates.size}
              onChange={(e) => onIncludeDuplicates(e.target.checked)}
            />
            <label htmlFor={switchId}>Import duplicates too</label>
          </div>
        )}
        {progress && (
          <ProgressBar label="Importing transactions" done={progress.done} total={progress.total} />
        )}
        <div className="flex flex-wrap justify-between gap-2">
          <Button variant="outline" onClick={onBack} disabled={importing}>
            Back
          </Button>
          <Button onClick={onImport} disabled={importing || ready === 0}>
            <Upload aria-hidden />
            {importing ? 'Importing…' : `Import ${ready} transaction${ready === 1 ? '' : 's'}`}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[44rem] text-sm">
          <caption className="sr-only">Rows to import</caption>
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th scope="col" className="w-10 px-3 py-2">
                <span className="sr-only">Import</span>
              </th>
              <th scope="col" className="px-2 py-2 font-medium">
                Line
              </th>
              <th scope="col" className="px-2 py-2 font-medium">
                Date
              </th>
              <th scope="col" className="px-2 py-2 font-medium">
                Payee
              </th>
              <th scope="col" className="px-2 py-2 font-medium">
                Category · account
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                Amount
              </th>
              <th scope="col" className="px-2 py-2 font-medium">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {step.rows.slice(0, shown).map((row, i) => {
              const dup = step.duplicates.has(i)
              if (!row.ok) {
                return (
                  <tr key={row.line} className="border-b bg-destructive/5 last:border-0">
                    <td className="px-3 py-2" />
                    <td className="px-2 py-2 tabular-nums">{row.line}</td>
                    <td colSpan={4} className="px-2 py-2 text-muted-foreground">
                      {step.body[i]?.slice(0, 4).join(', ')}
                    </td>
                    <td className="px-2 py-2 text-destructive">
                      <span className="inline-flex items-center gap-1">
                        <CircleAlert className="size-4" aria-hidden />
                        {row.error}
                      </span>
                    </td>
                  </tr>
                )
              }
              const { tx } = row
              const signed = tx.type === 'expense' ? -tx.amount : tx.amount
              const where =
                tx.type === 'transfer'
                  ? `${accounts.get(tx.accountId)?.name ?? ''} → ${accounts.get(tx.toAccountId ?? '')?.name ?? ''}`
                  : `${tx.categoryId ? (categories.get(tx.categoryId)?.name ?? '') : 'Uncategorised'} · ${accounts.get(tx.accountId)?.name ?? ''}`
              return (
                <tr key={row.line} className={cn('border-b last:border-0', dup && 'bg-warning/10')}>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--color-primary)]"
                      checked={step.included.has(i)}
                      onChange={() => onToggle(i)}
                      aria-label={`Import line ${row.line}`}
                    />
                  </td>
                  <td className="px-2 py-2 tabular-nums">{row.line}</td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    {formatCalendarDate(tx.day, locale, {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </td>
                  <td className="max-w-48 truncate px-2 py-2">{tx.payee || tx.note || '—'}</td>
                  <td className="max-w-56 truncate px-2 py-2 text-muted-foreground">{where}</td>
                  <td
                    className={cn(
                      'px-2 py-2 text-right whitespace-nowrap tabular-nums',
                      tx.type === 'income' && 'text-success',
                    )}
                  >
                    {formatMoney(signed, tx.currency, locale, {
                      signDisplay: tx.type === 'income' ? 'always' : 'auto',
                    })}
                  </td>
                  <td className="px-2 py-2">
                    {dup ? (
                      <span className="inline-flex items-center gap-1 text-warning">
                        <Copy className="size-4" aria-hidden />
                        Duplicate
                      </span>
                    ) : row.warnings.length > 0 ? (
                      <span className="text-muted-foreground">{row.warnings.join(' ')}</span>
                    ) : (
                      <span className="text-muted-foreground">Ready</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {step.rows.length > shown && (
        <div className="flex justify-center">
          <Button variant="ghost" onClick={onShowMore}>
            Show more ({step.rows.length - shown} left)
          </Button>
        </div>
      )}
    </div>
  )
}
