import { DatabaseBackup, Download, FileText, FileUp, History, TriangleAlert } from 'lucide-react'
import { useId, useState } from 'react'
import { Link } from 'react-router'
import { useAppSelector } from '@/app/hooks'
import { FormMessage } from '@/components/form/FormMessage'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useUid } from '@/features/auth/hooks'
import { useToast } from '@/features/ui/hooks'
import { downloadFile } from '@/utils/download'
import { useCreateBackupMutation, useRestoreBackupMutation } from '../api'
import { backupFileName, parseBackup, type RestoredCollection } from '../backup'
import { ProgressBar } from '../components/ProgressBar'
import { StatementDialog } from '../components/StatementDialog'
import { selectDataProgress } from '../slice'

const STEP_LABELS: Record<string, string> = {
  clearing: 'Removing current data',
  categories: 'Restoring categories',
  accounts: 'Restoring accounts',
  budgets: 'Restoring budgets',
  transactions: 'Restoring transactions',
  recurring: 'Restoring recurring rules',
}

const COUNT_LABELS: Record<RestoredCollection, string> = {
  accounts: 'accounts',
  categories: 'categories',
  transactions: 'transactions',
  budgets: 'budgets',
  recurring: 'recurring rules',
}

interface PendingRestore {
  fileName: string
  text: string
  exportedAt: string
  counts: Record<RestoredCollection, number>
}

/** Import & export hub: CSV import, CSV/PDF exports, JSON backup and restore. */
export function DataPage() {
  const uid = useUid()
  const toast = useToast()
  const fileId = useId()
  const confirmId = useId()
  const progress = useAppSelector(selectDataProgress)
  const [createBackup, backupState] = useCreateBackupMutation()
  const [restore, restoreState] = useRestoreBackupMutation()
  const [statementOpen, setStatementOpen] = useState(false)
  const [pending, setPending] = useState<PendingRestore | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [restoreError, setRestoreError] = useState<string | null>(null)

  async function backup() {
    const result = await createBackup({ uid })
    if ('error' in result) {
      toast({
        title: 'Could not create the backup',
        description: String(result.error),
        variant: 'error',
      })
      return
    }
    downloadFile(result.data.text, backupFileName(result.data.exportedAt), 'application/json')
    toast({ title: 'Backup downloaded', variant: 'success' })
  }

  async function pickBackup(file: File) {
    setRestoreError(null)
    const text = await file.text()
    const check = parseBackup(text)
    if (!check.ok) {
      setRestoreError(check.error)
      return
    }
    setConfirmed(false)
    setPending({
      fileName: file.name,
      text,
      exportedAt: check.backup.exportedAt,
      counts: check.counts,
    })
  }

  async function runRestore() {
    if (!pending) return
    const result = await restore({ uid, text: pending.text })
    setPending(null)
    if ('error' in result) {
      setRestoreError(String(result.error))
      return
    }
    toast({ title: 'Backup restored', variant: 'success' })
  }

  const card = 'space-y-3 rounded-xl border bg-card p-5'
  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Import and export</h1>

      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="import-heading" className={card}>
          <h2 id="import-heading" className="flex items-center gap-2 font-semibold">
            <FileUp className="size-4" aria-hidden />
            Import from CSV
          </h2>
          <p className="text-sm text-muted-foreground">
            Bring in transactions from your bank or a Ledgerly export. Possible duplicates (same
            date, amount and payee) are flagged before anything is saved.
          </p>
          <Button asChild>
            <Link to="/data/import">Start import</Link>
          </Button>
        </section>

        <section aria-labelledby="export-heading" className={card}>
          <h2 id="export-heading" className="flex items-center gap-2 font-semibold">
            <Download className="size-4" aria-hidden />
            Export
          </h2>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>
              <strong className="text-foreground">CSV:</strong> filter the{' '}
              <Link to="/transactions" className="text-foreground underline underline-offset-4">
                Transactions
              </Link>{' '}
              list or pick a range in{' '}
              <Link to="/reports" className="text-foreground underline underline-offset-4">
                Reports
              </Link>
              , then choose Export CSV.
            </li>
            <li>
              <strong className="text-foreground">PDF:</strong> a monthly statement with totals and
              a category breakdown.
            </li>
          </ul>
          <Button variant="outline" onClick={() => setStatementOpen(true)}>
            <FileText aria-hidden />
            Monthly statement (PDF)
          </Button>
        </section>

        <section aria-labelledby="backup-heading" className={card}>
          <h2 id="backup-heading" className="flex items-center gap-2 font-semibold">
            <DatabaseBackup className="size-4" aria-hidden />
            Full backup
          </h2>
          <p className="text-sm text-muted-foreground">
            Everything in your account as one JSON file: settings, accounts, categories,
            transactions, budgets, recurring rules and notifications, plus a copy of your groups.
          </p>
          <Button variant="outline" onClick={() => void backup()} disabled={backupState.isLoading}>
            <Download aria-hidden />
            {backupState.isLoading ? 'Preparing…' : 'Download backup'}
          </Button>
        </section>

        <section aria-labelledby="restore-heading" className={card}>
          <h2 id="restore-heading" className="flex items-center gap-2 font-semibold">
            <History className="size-4" aria-hidden />
            Restore from backup
          </h2>
          <p className="text-sm text-muted-foreground">
            Replaces this account's settings, accounts, categories, transactions, budgets and
            recurring rules with the ones in a backup file. Groups are shared with other people and
            are not changed.
          </p>
          {restoreError && <FormMessage kind="error">{restoreError}</FormMessage>}
          {progress?.task === 'restore' ? (
            <ProgressBar
              label={STEP_LABELS[progress.step] ?? 'Restoring'}
              done={progress.done}
              total={progress.total}
            />
          ) : (
            <label
              htmlFor={fileId}
              className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border bg-background px-4 text-sm font-medium focus-within:ring-[3px] focus-within:ring-ring/50 hover:bg-accent"
            >
              <FileUp className="size-4" aria-hidden />
              Choose backup file
              <input
                id={fileId}
                type="file"
                accept=".json,application/json"
                className="sr-only"
                disabled={restoreState.isLoading}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void pickBackup(file)
                  e.target.value = ''
                }}
              />
            </label>
          )}
        </section>
      </div>

      <StatementDialog open={statementOpen} onOpenChange={setStatementOpen} />

      <Dialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent>
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
            <TriangleAlert className="size-5 text-warning" aria-hidden />
            Replace your data?
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Everything currently in this account (accounts, categories, transactions, budgets and
            recurring rules) is deleted and replaced with the backup. This can't be undone. Download
            a backup first if you might need the current data.
          </DialogDescription>
          {pending && (
            <div className="space-y-1 rounded-md bg-muted px-3 py-2 text-sm">
              <p className="font-medium">{pending.fileName}</p>
              <p className="text-muted-foreground">
                Made {new Date(pending.exportedAt).toLocaleString()}.{' '}
                {(Object.keys(COUNT_LABELS) as RestoredCollection[])
                  .map((k) => `${pending.counts[k]} ${COUNT_LABELS[k]}`)
                  .join(', ')}
                .
              </p>
            </div>
          )}
          <div className="flex items-start gap-2 text-sm">
            <input
              id={confirmId}
              type="checkbox"
              className="mt-0.5 size-4 accent-[var(--color-primary)]"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <label htmlFor={confirmId}>I understand my current data will be replaced.</label>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={!confirmed} onClick={() => void runRestore()}>
              Replace and restore
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}
