import * as DocumentPicker from 'expo-document-picker'
import { File } from 'expo-file-system'
import { router } from 'expo-router'
import {
  DatabaseBackup,
  Download,
  FileText,
  FileUp,
  History,
  TriangleAlert,
} from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { useState, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { useAppSelector } from '@/app/hooks'
import { useUid } from '@/features/auth/hooks'
import { useCreateBackupMutation, useRestoreBackupMutation } from '@/features/data/api'
import { backupFileName, parseBackup, type RestoredCollection } from '@/features/data/backup'
import { selectDataProgress } from '@/features/data/slice'
import { useToast } from '@/features/ui/hooks'
import { FormMessage } from '@m/components/form/FormMessage'
import { Screen } from '@m/components/Screen'
import { Button } from '@m/components/ui/Button'
import { Card } from '@m/components/ui/Card'
import { Checkbox } from '@m/components/ui/Controls'
import { Dialog } from '@m/components/ui/Dialog'
import { ProgressBar } from '@m/components/ui/ProgressBar'
import { Text } from '@m/components/ui/Text'
import { radius } from '@m/theme/colors'
import { useColors } from '@m/theme/ThemeProvider'
import { downloadFile } from '@m/utils/share'
import { LinkText } from '../reports/parts'
import { StatementSheet } from './StatementSheet'

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

export function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon
  title: string
  children: ReactNode
}) {
  const c = useColors()
  return (
    <Card>
      <View style={styles.header}>
        <Icon size={16} color={c.foreground} />
        <Text variant="subheading" accessibilityRole="header">
          {title}
        </Text>
      </View>
      {children}
    </Card>
  )
}

/** Import & export hub: CSV import, CSV/PDF exports, JSON backup and restore. */
export function DataScreen() {
  const uid = useUid()
  const toast = useToast()
  const c = useColors()
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
    await downloadFile(result.data.text, backupFileName(result.data.exportedAt), 'application/json')
    toast({ title: 'Backup ready to save', variant: 'success' })
  }

  async function pickBackup() {
    setRestoreError(null)
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['application/json', 'text/plain', '*/*'],
      copyToCacheDirectory: true,
    })
    const asset = picked.canceled ? undefined : picked.assets[0]
    if (!asset) return
    try {
      const text = await new File(asset.uri).text()
      const check = parseBackup(text)
      if (!check.ok) {
        setRestoreError(check.error)
        return
      }
      setConfirmed(false)
      setPending({
        fileName: asset.name,
        text,
        exportedAt: check.backup.exportedAt,
        counts: check.counts,
      })
    } catch (e) {
      setRestoreError(e instanceof Error ? e.message : 'Could not read that file.')
    }
  }

  async function runRestore() {
    if (!pending) return
    const text = pending.text
    setPending(null)
    const result = await restore({ uid, text })
    if ('error' in result) {
      setRestoreError(String(result.error))
      return
    }
    toast({ title: 'Backup restored', variant: 'success' })
  }

  return (
    <Screen>
      <Section icon={FileUp} title="Import from CSV">
        <Text variant="small" tone="muted">
          Bring in transactions from your bank or a Ledgerly export. Possible duplicates (same date,
          amount and payee) are flagged before anything is saved.
        </Text>
        <Button
          title="Start import"
          style={styles.start}
          onPress={() => router.push('/data/import')}
        />
      </Section>

      <Section icon={Download} title="Export">
        <Text variant="small" tone="muted">
          <Text variant="small" weight="700">
            CSV:{' '}
          </Text>
          filter the Transactions list or pick a range in Reports, then choose Export CSV.
        </Text>
        <View style={styles.links}>
          <LinkText title="Transactions" href="/transactions" />
          <LinkText title="Reports" href="/reports" />
        </View>
        <Text variant="small" tone="muted">
          <Text variant="small" weight="700">
            PDF:{' '}
          </Text>
          a monthly statement with totals and a category breakdown.
        </Text>
        <Button
          title="Monthly statement (PDF)"
          icon={FileText}
          variant="outline"
          style={styles.start}
          onPress={() => setStatementOpen(true)}
        />
      </Section>

      <Section icon={DatabaseBackup} title="Full backup">
        <Text variant="small" tone="muted">
          Everything in your account as one JSON file: settings, accounts, categories, transactions,
          budgets, recurring rules and notifications, plus a copy of your groups.
        </Text>
        <Button
          title={backupState.isLoading ? 'Preparing…' : 'Save a backup'}
          icon={Download}
          variant="outline"
          loading={backupState.isLoading}
          style={styles.start}
          onPress={() => void backup()}
        />
      </Section>

      <Section icon={History} title="Restore from backup">
        <Text variant="small" tone="muted">
          Replaces this account’s settings, accounts, categories, transactions, budgets and
          recurring rules with the ones in a backup file. Groups are shared with other people and
          are not changed.
        </Text>
        {restoreError ? <FormMessage kind="error">{restoreError}</FormMessage> : null}
        {progress?.task === 'restore' ? (
          <View style={styles.progress}>
            <Text variant="small">
              {STEP_LABELS[progress.step] ?? 'Restoring'}
              {progress.total > 0 ? ` (${progress.done} of ${progress.total})` : ''}
            </Text>
            <ProgressBar
              value={progress.total > 0 ? progress.done / progress.total : 0}
              label={STEP_LABELS[progress.step] ?? 'Restoring'}
            />
          </View>
        ) : (
          <Button
            title="Choose backup file"
            icon={FileUp}
            variant="outline"
            disabled={restoreState.isLoading}
            style={styles.start}
            onPress={() => void pickBackup()}
          />
        )}
      </Section>

      <StatementSheet open={statementOpen} onClose={() => setStatementOpen(false)} />

      <Dialog
        open={pending !== null}
        onClose={() => setPending(null)}
        title="Replace your data?"
        description="Everything currently in this account (accounts, categories, transactions, budgets and recurring rules) is deleted and replaced with the backup. This can't be undone. Save a backup first if you might need the current data."
        actions={
          <>
            <Button title="Cancel" variant="secondary" onPress={() => setPending(null)} />
            <Button
              title="Replace and restore"
              variant="destructive"
              disabled={!confirmed}
              onPress={() => void runRestore()}
            />
          </>
        }
      >
        <View style={styles.warning}>
          <TriangleAlert size={18} color={c.warning} />
          <Text variant="small" weight="600">
            This can’t be undone.
          </Text>
        </View>
        {pending ? (
          <View style={[styles.file, { backgroundColor: c.muted }]}>
            <Text variant="small" weight="600">
              {pending.fileName}
            </Text>
            <Text variant="small" tone="muted">
              Made {new Date(pending.exportedAt).toLocaleString()}.{' '}
              {(Object.keys(COUNT_LABELS) as RestoredCollection[])
                .map((k) => `${pending.counts[k]} ${COUNT_LABELS[k]}`)
                .join(', ')}
              .
            </Text>
          </View>
        ) : null}
        <Checkbox
          checked={confirmed}
          onChange={setConfirmed}
          label="I understand my current data will be replaced."
        />
      </Dialog>
    </Screen>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  start: { alignSelf: 'flex-start' },
  links: { flexDirection: 'row', gap: 16 },
  progress: { gap: 6 },
  warning: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  file: { borderRadius: radius.md, padding: 10, gap: 2 },
})
