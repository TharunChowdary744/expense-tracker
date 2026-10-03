import { z } from 'zod'
import { accountSchema } from '@/features/accounts/schemas'
import { budgetSchema } from '@/features/budgets/schemas'
import { categorySchema } from '@/features/categories/schemas'
import { recurringSchema } from '@/features/recurring/schemas'
import { transactionSchema } from '@/features/transactions/schemas'
import { CURRENCY_CODE } from '@/utils/currency'

/**
 * The JSON backup format. Firestore Timestamps are written as `{ "__time": "<ISO>" }` so a
 * restore puts back real Timestamps; everything else is plain JSON.
 *
 * Restored: settings, accounts, categories, transactions, budgets and recurring rules.
 * Included for reference only: notifications and the shared groups the user belongs to
 * (group data belongs to every member, so it is never overwritten from one member's file).
 */

export const BACKUP_VERSION = 1

/** The user-owned collections, in the order a restore writes them. */
export const RESTORED_COLLECTIONS = [
  'categories',
  'accounts',
  'budgets',
  'transactions',
  'recurring',
] as const
export type RestoredCollection = (typeof RESTORED_COLLECTIONS)[number]

export const BACKUP_COLLECTIONS = [...RESTORED_COLLECTIONS, 'notifications'] as const
export type BackupCollection = (typeof BACKUP_COLLECTIONS)[number]

/** Fields a restore writes for each collection (the rest is dropped). Mirrors the rules. */
export const RESTORED_FIELDS: Record<RestoredCollection, readonly string[]> = {
  categories: ['name', 'kind', 'icon', 'color', 'parentId', 'order', 'archived'],
  accounts: ['name', 'type', 'currency', 'openingBalance', 'color', 'icon', 'archived'],
  budgets: ['name', 'period', 'categoryIds', 'amount', 'rollover', 'alertThresholds', 'startDate'],
  transactions: [
    'type',
    'amount',
    'currency',
    'fxRateToBase',
    'baseAmount',
    'accountId',
    'toAccountId',
    'categoryId',
    'tags',
    'payee',
    'note',
    'date',
    'attachments',
    'recurringId',
    'occurrenceKey',
    'groupExpenseRef',
  ],
  recurring: [
    'template',
    'frequency',
    'interval',
    'byWeekday',
    'byMonthDay',
    'startDate',
    'endDate',
    'maxOccurrences',
    'timeZone',
    'nextRunAt',
    'lastRunAt',
    'mode',
    'paused',
    'skippedKeys',
  ],
}

const VALIDATORS: Record<RestoredCollection, z.ZodType<object>> = {
  categories: categorySchema,
  accounts: accountSchema,
  budgets: budgetSchema,
  transactions: transactionSchema,
  recurring: recurringSchema,
}

export const RESTORED_SETTINGS = [
  'baseCurrency',
  'theme',
  'locale',
  'dateFormat',
  'weekStartsOn',
  'notificationPrefs',
] as const

/** A Firestore value in JSON: Timestamps tagged, everything else as is. */
export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

export type DocMap = Record<string, Record<string, JsonValue>>

export interface BackupGroup {
  id: string
  data: Record<string, JsonValue>
  expenses: DocMap
  settlements: DocMap
}

export interface Backup {
  app: 'ledgerly'
  kind: 'backup'
  version: number
  exportedAt: string
  uid: string
  user: Record<string, JsonValue> | null
  collections: Record<BackupCollection, DocMap>
  groups: BackupGroup[]
}

// ---------------------------------------------------------------------------------------------
// Encoding

interface TimestampLike {
  seconds: number
  nanoseconds: number
  toDate: () => Date
}

function isTimestampLike(value: unknown): value is TimestampLike {
  return (
    value !== null &&
    typeof value === 'object' &&
    'seconds' in value &&
    'nanoseconds' in value &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  )
}

/** Firestore data → JSON-safe value (Timestamps become `{ __time }`). */
export function encodeValue(value: unknown): JsonValue {
  if (isTimestampLike(value)) return { __time: value.toDate().toISOString() }
  if (Array.isArray(value)) return value.map(encodeValue)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encodeValue(v)]))
  }
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
    return value
  }
  return null
}

function isTimeTag(value: unknown): value is { __time: string } {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    typeof (value as { __time?: unknown }).__time === 'string'
  )
}

/** JSON value → data, turning `{ __time }` tags into whatever `toTime` returns. */
export function decodeValue<T>(value: JsonValue, toTime: (iso: string) => T): unknown {
  if (isTimeTag(value)) return toTime(value.__time)
  if (Array.isArray(value)) return value.map((v) => decodeValue(v, toTime))
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, decodeValue(v, toTime)]))
  }
  return value
}

// ---------------------------------------------------------------------------------------------
// Reading a file

const jsonValue: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number(),
    z.string(),
    z.array(jsonValue),
    z.record(z.string(), jsonValue),
  ]),
)
const docMap = z.record(z.string().min(1).max(200), z.record(z.string(), jsonValue))

const backupSchema = z.object({
  app: z.literal('ledgerly'),
  kind: z.literal('backup'),
  version: z.number().int(),
  exportedAt: z.string(),
  uid: z.string(),
  user: z.record(z.string(), jsonValue).nullable(),
  collections: z.object({
    categories: docMap.default({}),
    accounts: docMap.default({}),
    budgets: docMap.default({}),
    transactions: docMap.default({}),
    recurring: docMap.default({}),
    notifications: docMap.default({}),
  }),
  groups: z
    .array(
      z.object({
        id: z.string(),
        data: z.record(z.string(), jsonValue),
        expenses: docMap.default({}),
        settlements: docMap.default({}),
      }),
    )
    .default([]),
})

const DOC_ID = /^[^/]{1,200}$/

export type BackupCheck =
  | { ok: true; backup: Backup; counts: Record<RestoredCollection, number> }
  | { ok: false; error: string }

/**
 * Parses and validates a backup file. Every restored document must pass the same zod schema
 * the app reads it with, and references (account, category, parent) must point at documents
 * in the file, so a restore can't write data the app would then hide or reject.
 */
export function parseBackup(text: string): BackupCheck {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: "This file isn't valid JSON." }
  }
  const parsed = backupSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: "This file isn't a Ledgerly backup." }
  const backup = parsed.data as Backup
  if (backup.version > BACKUP_VERSION) {
    return { ok: false, error: 'This backup was made by a newer version of Ledgerly.' }
  }

  const counts = {} as Record<RestoredCollection, number>
  for (const name of RESTORED_COLLECTIONS) {
    const docs = backup.collections[name]
    counts[name] = Object.keys(docs).length
    for (const [id, data] of Object.entries(docs)) {
      if (!DOC_ID.test(id)) return { ok: false, error: `A ${name} id in the file is not valid.` }
      const plain = decodeValue(data, (iso) => iso)
      const result = VALIDATORS[name].safeParse(plain)
      if (!result.success) {
        const issue = result.error.issues[0]
        const where = issue?.path.length ? ` (${issue.path.join('.')})` : ''
        return { ok: false, error: `${capitalise(name)} "${id}" has unexpected data${where}.` }
      }
    }
  }

  const { accounts, categories, transactions, recurring, budgets } = backup.collections
  const kindOf = (id: unknown) =>
    typeof id === 'string' ? (categories[id]?.kind as string | undefined) : undefined
  for (const [id, c] of Object.entries(categories)) {
    const parentId = c.parentId
    if (typeof parentId === 'string' && (!categories[parentId] || kindOf(parentId) !== c.kind)) {
      return { ok: false, error: `Category "${id}" points at a missing parent.` }
    }
  }
  const refsOk = (t: Record<string, JsonValue>) =>
    typeof t.accountId === 'string' &&
    t.accountId in accounts &&
    (t.toAccountId === undefined ||
      (typeof t.toAccountId === 'string' && t.toAccountId in accounts)) &&
    (t.categoryId === undefined || kindOf(t.categoryId) === t.type)
  for (const [id, t] of Object.entries(transactions)) {
    if (!refsOk(t))
      return { ok: false, error: `Transaction "${id}" points at a missing account or category.` }
    if (typeof t.recurringId === 'string' && id !== `${t.recurringId}_${String(t.occurrenceKey)}`) {
      return { ok: false, error: `Transaction "${id}" has a recurring id that doesn't match.` }
    }
  }
  for (const [id, r] of Object.entries(recurring)) {
    const template = r.template as Record<string, JsonValue>
    if (!refsOk(template)) {
      return { ok: false, error: `Recurring rule "${id}" points at a missing account or category.` }
    }
  }
  for (const [id, b] of Object.entries(budgets)) {
    const ids = (b.categoryIds as JsonValue[]).filter((c) => typeof c === 'string')
    if (ids.some((c) => !(c in categories))) {
      return { ok: false, error: `Budget "${id}" points at a missing category.` }
    }
  }
  if (backup.user) {
    const settings = backup.user.settings as Record<string, JsonValue> | undefined
    const base = settings?.baseCurrency
    if (typeof base !== 'string' || !CURRENCY_CODE.test(base)) {
      return { ok: false, error: 'The settings in this backup are not valid.' }
    }
  }
  return { ok: true, backup, counts }
}

function capitalise(s: string) {
  return `${s.charAt(0).toUpperCase()}${s.slice(1, -1)}`
}

/** Keeps only the fields a restore writes for `collection`. */
export function pickFields(
  collection: RestoredCollection,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of RESTORED_FIELDS[collection]) {
    if (key in data && data[key] !== undefined) out[key] = data[key]
  }
  return out
}

/** Settings to restore (known keys only). */
export function pickSettings(user: Record<string, JsonValue> | null): Record<string, JsonValue> {
  const settings = (user?.settings ?? {}) as Record<string, JsonValue>
  const out: Record<string, JsonValue> = {}
  for (const key of RESTORED_SETTINGS) {
    const value = settings[key]
    if (value !== undefined) out[key] = value
  }
  return out
}

/** Top-level categories before subcategories, so a parent always exists first. */
export function categoryWriteOrder(categories: DocMap): string[] {
  const ids = Object.keys(categories)
  const isChild = (id: string) => typeof categories[id]?.parentId === 'string'
  return [...ids.filter((id) => !isChild(id)), ...ids.filter(isChild)]
}

export function backupFileName(exportedAt: string): string {
  return `ledgerly-backup-${exportedAt.slice(0, 10)}.json`
}
