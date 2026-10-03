import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type Firestore,
} from 'firebase/firestore'
import { attachmentsUnder, receiptPrefix } from '@/features/receipts/utils'
import { accountDeltas } from '@/features/transactions/utils'
import type { BalanceTransaction } from '@/features/transactions/types'
import {
  BACKUP_COLLECTIONS,
  BACKUP_VERSION,
  RESTORED_COLLECTIONS,
  categoryWriteOrder,
  decodeValue,
  encodeValue,
  pickFields,
  pickSettings,
  type Backup,
  type BackupCollection,
  type DocMap,
  type JsonValue,
  type RestoredCollection,
} from './backup'
import type { ImportedTx } from './csvImport'

/**
 * Bulk Firestore writes for import, backup and restore. They take `db` so the rules tests can
 * run them against the emulator; the RTK Query endpoints in `api.ts` pass the app's instance.
 */

/** Most transactions per import batch (Firestore allows 500 writes; balance updates join them). */
export const IMPORT_BATCH = 400
/**
 * Most distinct accounts and categories one batch refers to. The rules read each referenced
 * account and category, and a batch may make at most 20 such reads, so batches are cut early
 * when a file uses many categories.
 */
export const MAX_REFS_PER_BATCH = 18

export type Progress = (done: number, total: number) => void

/** Splits items into batches of at most `maxItems` that together reference at most `maxRefs`. */
export function planBatches<T>(
  items: readonly T[],
  refsOf: (item: T) => readonly string[],
  maxItems = IMPORT_BATCH,
  maxRefs = MAX_REFS_PER_BATCH,
): T[][] {
  const batches: T[][] = []
  let current: T[] = []
  let refs = new Set<string>()
  for (const item of items) {
    const next = new Set([...refs, ...refsOf(item)])
    if (current.length > 0 && (current.length >= maxItems || next.size > maxRefs)) {
      batches.push(current)
      current = []
      refs = new Set(refsOf(item))
    } else {
      refs = next
    }
    current.push(item)
  }
  if (current.length > 0) batches.push(current)
  return batches
}

const txRefs = (t: {
  accountId: string
  toAccountId?: string | undefined
  categoryId?: string | undefined
}) =>
  [
    `a:${t.accountId}`,
    t.toAccountId ? `a:${t.toAccountId}` : '',
    t.categoryId ? `c:${t.categoryId}` : '',
  ].filter(Boolean)

/** Applies the balance changes of `txs` to their accounts' cached `txTotal` in the batch. */
function addBalanceUpdates(
  batch: ReturnType<typeof writeBatch>,
  db: Firestore,
  uid: string,
  txs: readonly BalanceTransaction[],
  currencies: Readonly<Record<string, string>>,
) {
  for (const [id, delta] of accountDeltas([], txs, (accountId) => currencies[accountId])) {
    batch.update(doc(db, 'users', uid, 'accounts', id), {
      txTotal: increment(delta),
      updatedAt: serverTimestamp(),
    })
  }
}

// ---------------------------------------------------------------------------------------------
// CSV import

/**
 * Writes imported transactions with their balance changes, one batch at a time, reporting
 * progress after each batch. Returns how many were written. A failed batch stops the import;
 * earlier batches stay saved (the error says how many).
 */
export async function importTransactions(
  db: Firestore,
  uid: string,
  txs: readonly ImportedTx[],
  currencies: Readonly<Record<string, string>>,
  onProgress?: Progress,
): Promise<number> {
  let done = 0
  onProgress?.(0, txs.length)
  for (const part of planBatches(txs, txRefs)) {
    const batch = writeBatch(db)
    for (const tx of part) {
      batch.set(doc(collection(db, 'users', uid, 'transactions')), {
        type: tx.type,
        amount: tx.amount,
        currency: tx.currency,
        fxRateToBase: tx.fxRateToBase,
        baseAmount: tx.baseAmount,
        accountId: tx.accountId,
        ...(tx.toAccountId ? { toAccountId: tx.toAccountId } : {}),
        ...(tx.categoryId ? { categoryId: tx.categoryId } : {}),
        tags: tx.tags,
        payee: tx.payee,
        note: tx.note,
        date: Timestamp.fromDate(new Date(tx.date)),
        attachments: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: uid,
      })
    }
    addBalanceUpdates(batch, db, uid, part, currencies)
    try {
      await batch.commit()
    } catch (error) {
      throw new PartialWriteError(done, txs.length, error)
    }
    done += part.length
    onProgress?.(done, txs.length)
  }
  return done
}

/** A bulk write that failed part-way; `done` items were saved before it stopped. */
export class PartialWriteError extends Error {
  constructor(
    readonly done: number,
    readonly total: number,
    readonly cause: unknown,
  ) {
    super(`Stopped after ${done} of ${total}`)
  }
}

// ---------------------------------------------------------------------------------------------
// Backup

async function readCollection(db: Firestore, path: [string, ...string[]]): Promise<DocMap> {
  const [first, ...rest] = path
  const snap = await getDocs(collection(db, first, ...rest))
  const out: DocMap = {}
  for (const d of snap.docs) out[d.id] = encodeValue(d.data()) as Record<string, JsonValue>
  return out
}

/** Reads everything the user owns (plus the groups they belong to) into a backup object. */
export async function readBackup(db: Firestore, uid: string, now = new Date()): Promise<Backup> {
  const userSnap = await getDoc(doc(db, 'users', uid))
  const collections = {} as Record<BackupCollection, DocMap>
  for (const name of BACKUP_COLLECTIONS) {
    collections[name] = await readCollection(db, ['users', uid, name])
  }
  const groupSnap = await getDocs(
    query(collection(db, 'groups'), where('memberIds', 'array-contains', uid)),
  )
  const groups = await Promise.all(
    groupSnap.docs.map(async (g) => ({
      id: g.id,
      data: encodeValue(g.data()) as Record<string, JsonValue>,
      expenses: await readCollection(db, ['groups', g.id, 'expenses']),
      settlements: await readCollection(db, ['groups', g.id, 'settlements']),
    })),
  )
  const user = userSnap.exists()
    ? (encodeValue(userSnap.data()) as Record<string, JsonValue>)
    : null
  if (user) delete user.fcmTokens
  return {
    app: 'ledgerly',
    kind: 'backup',
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    uid,
    user,
    collections,
    groups,
  }
}

// ---------------------------------------------------------------------------------------------
// Restore

export type RestoreStep = 'clearing' | RestoredCollection

/**
 * Replaces this user's accounts, categories, transactions, budgets and recurring rules with
 * the ones in `backup` (validated with `parseBackup` first), keeping document ids so every
 * reference still matches. Settings are restored too; notifications and groups are not.
 *
 * Account balances are rebuilt: accounts are written with `txTotal` 0 and each transaction
 * batch adds its own balance changes, exactly like normal writes.
 */
export async function restoreBackup(
  db: Firestore,
  uid: string,
  backup: Backup,
  onProgress?: (step: RestoreStep, done: number, total: number) => void,
): Promise<void> {
  const toTime = (iso: string) => Timestamp.fromDate(new Date(iso))
  const stamps = () => ({
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: uid,
  })

  // 1. Settings first, so amounts are read in the restored base currency.
  const settings = pickSettings(backup.user)
  if (Object.keys(settings).length > 0) {
    const userRef = doc(db, 'users', uid)
    const current = (await getDoc(userRef)).data()?.settings as DocumentData | undefined
    await updateDoc(userRef, {
      settings: { ...(current ?? {}), ...(decodeValue(settings, toTime) as DocumentData) },
      updatedAt: serverTimestamp(),
    })
  }

  // 2. Clear what's there now (transactions first so nothing points at a missing account).
  const clearOrder = ['recurring', 'transactions', 'budgets', 'accounts', 'categories'] as const
  const existing: { name: string; id: string }[] = []
  for (const name of clearOrder) {
    const snap = await getDocs(collection(db, 'users', uid, name))
    for (const d of snap.docs) existing.push({ name, id: d.id })
  }
  onProgress?.('clearing', 0, existing.length)
  for (let i = 0; i < existing.length; i += IMPORT_BATCH) {
    const batch = writeBatch(db)
    const part = existing.slice(i, i + IMPORT_BATCH)
    for (const { name, id } of part) batch.delete(doc(db, 'users', uid, name, id))
    await batch.commit()
    onProgress?.('clearing', i + part.length, existing.length)
  }

  // 3. Write the backup's documents.
  const { collections } = backup
  const currencies: Record<string, string> = {}
  for (const [id, a] of Object.entries(collections.accounts)) currencies[id] = String(a.currency)

  for (const name of RESTORED_COLLECTIONS) {
    const docs = collections[name]
    const ids = name === 'categories' ? categoryWriteOrder(docs) : Object.keys(docs)
    const data = (id: string) =>
      pickFields(name, decodeValue(docs[id] as JsonValue, toTime) as Record<string, unknown>)
    const refsOf = (id: string): string[] => {
      const d = docs[id] as Record<string, JsonValue>
      if (name === 'transactions') return txRefs(d as never)
      if (name === 'recurring') return txRefs(d.template as never)
      if (name === 'categories' && typeof d.parentId === 'string') return [`c:${d.parentId}`]
      return []
    }
    let done = 0
    onProgress?.(name, 0, ids.length)
    for (const part of planBatches(ids, refsOf)) {
      const batch = writeBatch(db)
      for (const id of part) {
        const values = data(id)
        if (name === 'accounts') values.txTotal = 0
        if (name === 'transactions') {
          // Receipts only come back when the files are this account's own (same user and id).
          values.attachments = attachmentsUnder(
            values.attachments,
            receiptPrefix({ kind: 'tx', uid, id }),
          )
        }
        batch.set(doc(db, 'users', uid, name, id), { ...values, ...stamps() })
      }
      if (name === 'transactions') {
        addBalanceUpdates(
          batch,
          db,
          uid,
          part.map((id) => docs[id] as unknown as BalanceTransaction),
          currencies,
        )
      }
      await batch.commit()
      done += part.length
      onProgress?.(name, done, ids.length)
    }
  }
}
