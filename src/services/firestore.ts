import type { ThunkDispatch, UnknownAction } from '@reduxjs/toolkit'
import {
  Timestamp,
  type FirestoreError,
  onSnapshot,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
  type Query,
  type QuerySnapshot,
} from 'firebase/firestore'
import type { z } from 'zod'
import { toastAdded } from '@/features/ui/slice'
import { getFirebase } from '@/lib/firebase'

/**
 * Helpers that connect RTK Query endpoints to Firestore.
 *
 * - `collectionListener` / `docListener` give a query endpoint a one-shot first read (queryFn)
 *   plus a live `onSnapshot` subscription for as long as the cache entry exists.
 * - Every document is converted to plain data (Timestamps become ISO strings) and validated
 *   with zod before it reaches the store. Invalid documents are skipped and reported.
 * - `firestoreWrite` wraps mutations: it returns `{ data }` or `{ error }` and does not hang
 *   while offline (Firestore queues the write and syncs it later).
 */

type AnyDispatch = ThunkDispatch<unknown, unknown, UnknownAction>

/** Every stored item carries its doc id and whether it still has unsynced local changes. */
export type Stored<T> = T & { id: string; pending: boolean }

// ---------------------------------------------------------------------------------------------
// Conversion and validation

function isTimestamp(value: unknown): value is Timestamp {
  // Duck-typed so Timestamps from another SDK instance (e.g. the rules test SDK) also count.
  return (
    value instanceof Timestamp ||
    (value !== null &&
      typeof value === 'object' &&
      'seconds' in value &&
      'nanoseconds' in value &&
      typeof (value as { toDate?: unknown }).toDate === 'function')
  )
}

/** Recursively converts Firestore Timestamps to ISO strings so the data is serialisable. */
export function toPlain(value: unknown): unknown {
  if (isTimestamp(value)) return value.toDate().toISOString()
  if (Array.isArray(value)) return value.map(toPlain)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toPlain(v)]))
  }
  return value
}

export interface InvalidDoc {
  path: string
  message: string
}

export type ParseResult<T> = { ok: true; value: Stored<T> } | { ok: false; invalid: InvalidDoc }

/** Reads a snapshot (estimating pending server timestamps) and validates it with `schema`. */
export function parseSnapshot<S extends z.ZodType<object>>(
  snap: DocumentSnapshot,
  schema: S,
): ParseResult<z.output<S>> {
  const raw = snap.data({ serverTimestamps: 'estimate' })
  const result = schema.safeParse(toPlain(raw))
  if (!result.success) {
    const issue = result.error.issues[0]
    const where = issue?.path.length ? `${issue.path.join('.')}: ` : ''
    return {
      ok: false,
      invalid: { path: snap.ref.path, message: `${where}${issue?.message ?? 'invalid'}` },
    }
  }
  return {
    ok: true,
    value: {
      ...result.data,
      id: snap.id,
      pending: snap.metadata.hasPendingWrites,
    },
  }
}

export function parseQuerySnapshot<S extends z.ZodType<object>>(
  snap: QuerySnapshot,
  schema: S,
): { items: Stored<z.output<S>>[]; invalid: InvalidDoc[] } {
  const items: Stored<z.output<S>>[] = []
  const invalid: InvalidDoc[] = []
  for (const docSnap of snap.docs) {
    const parsed = parseSnapshot(docSnap, schema)
    if (parsed.ok) items.push(parsed.value)
    else invalid.push(parsed.invalid)
  }
  return { items, invalid }
}

// ---------------------------------------------------------------------------------------------
// Errors

const FRIENDLY: Record<string, string> = {
  'permission-denied': "You don't have permission to do that.",
  unauthenticated: 'You are signed out. Sign in and try again.',
  unavailable: "Can't reach Ledgerly right now. Check your connection and try again.",
  'deadline-exceeded': 'The request took too long. Try again.',
  'not-found': 'That item no longer exists.',
  'already-exists': 'That item already exists.',
  'resource-exhausted': 'Too many requests. Wait a moment and try again.',
  'failed-precondition': 'This action needs a database index or setup step that is missing.',
  'invalid-argument': 'Some of the values are not valid.',
}

/** Turns any thrown value into a short, user-facing message. */
export function firestoreErrorMessage(error: unknown): string {
  if (error instanceof UserFacingError) return error.message
  // Duck-typed: FirestoreError instances can come from more than one SDK bundle.
  const code = (error as { code?: unknown } | null)?.code
  if (typeof code === 'string' && code in FRIENDLY) return FRIENDLY[code] as string
  return 'Something went wrong. Try again.'
}

/** Throw this from a mutation for a message that should be shown to the user as-is. */
export class UserFacingError extends Error {}

function isSignedOut(uid: string | undefined): boolean {
  try {
    const current = getFirebase().auth.currentUser
    return !current || (uid !== undefined && current.uid !== uid)
  } catch {
    return true
  }
}

// ---------------------------------------------------------------------------------------------
// Listeners

/** Resolves with the first snapshot (from cache when offline), then stops listening. */
export function firstSnapshot(ref: Query): Promise<QuerySnapshot>
export function firstSnapshot(ref: DocumentReference): Promise<DocumentSnapshot>
export function firstSnapshot(
  ref: Query | DocumentReference,
): Promise<QuerySnapshot | DocumentSnapshot> {
  return new Promise((resolve, reject) => {
    let started = false
    let done = false
    const finish = () => {
      done = true
      if (started) stop()
    }
    const onNext = (snap: QuerySnapshot | DocumentSnapshot) => {
      finish()
      resolve(snap)
    }
    const onError = (error: FirestoreError) => {
      finish()
      reject(error)
    }
    const stop =
      ref.type === 'document'
        ? onSnapshot(ref, onNext, onError)
        : onSnapshot(ref as Query, onNext, onError)
    started = true
    if (done) stop()
  })
}

interface ListenerOptions<Arg> {
  /** Lower-case plural noun used in messages, e.g. "accounts". */
  label: string
  /** The owner uid, so errors caused by signing out are not reported. */
  uidOf: (arg: Arg) => string | undefined
}

/** The parts of RTK Query's lifecycle API the listeners use. */
interface LifecycleApi<Data> {
  dispatch: AnyDispatch
  updateCachedData: (recipe: () => Data) => unknown
  cacheDataLoaded: Promise<unknown>
  cacheEntryRemoved: Promise<unknown>
}

function reportInvalid(dispatch: AnyDispatch, label: string, invalid: InvalidDoc[]) {
  if (invalid.length === 0) return
  for (const doc of invalid)
    console.warn(`[firestore] skipped invalid doc ${doc.path}`, doc.message)
  dispatch(
    toastAdded({
      title: `Some ${label} could not be read`,
      description: `${invalid.length} item${invalid.length === 1 ? '' : 's'} had unexpected data and ${invalid.length === 1 ? 'is' : 'are'} hidden.`,
      variant: 'error',
    }),
  )
}

function reportListenerError(
  dispatch: AnyDispatch,
  label: string,
  uid: string | undefined,
  error: FirestoreError,
) {
  // After sign-out the old listeners lose access; that is expected, not an error.
  if (error.code === 'permission-denied' && isSignedOut(uid)) return
  console.error(`[firestore] ${label} listener failed`, error)
  dispatch(
    toastAdded({
      title: `Live updates for ${label} stopped`,
      description: `${firestoreErrorMessage(error)} Reload the page to try again.`,
      variant: 'error',
    }),
  )
}

/**
 * Builds `queryFn` + `onCacheEntryAdded` for a live, validated collection query.
 *
 * ```ts
 * getAccounts: build.query<Account[], string>({
 *   ...collectionListener({ label: 'accounts', uidOf: (uid) => uid, schema: accountSchema,
 *     query: (uid, db) => query(collection(db, 'users', uid, 'accounts')) }),
 *   providesTags: ...,
 * })
 * ```
 */
export function collectionListener<Arg, S extends z.ZodType<object>>(
  options: ListenerOptions<Arg> & {
    schema: S
    query: (arg: Arg, db: Firestore) => Query
    /** Optional client-side ordering applied to every result. */
    sort?: (a: Stored<z.output<S>>, b: Stored<z.output<S>>) => number
  },
) {
  type Data = Stored<z.output<S>>[]
  const { label, uidOf, schema, sort } = options
  const toItems = (snap: QuerySnapshot, dispatch: AnyDispatch): Data => {
    const { items, invalid } = parseQuerySnapshot(snap, schema)
    reportInvalid(dispatch, label, invalid)
    return sort ? items.sort(sort) : items
  }

  return {
    async queryFn(arg: Arg, { dispatch }: { dispatch: AnyDispatch }) {
      try {
        const snap = await firstSnapshot(options.query(arg, getFirebase().db))
        return { data: toItems(snap, dispatch) }
      } catch (error) {
        return { error: firestoreErrorMessage(error) }
      }
    },

    async onCacheEntryAdded(arg: Arg, api: LifecycleApi<Data>) {
      // If the first read fails, this waits until a retry succeeds, then starts listening.
      try {
        await api.cacheDataLoaded
      } catch {
        return
      }
      const unsubscribe = onSnapshot(
        options.query(arg, getFirebase().db),
        { includeMetadataChanges: true },
        (snap) => {
          const items = toItems(snap, api.dispatch)
          api.updateCachedData(() => items)
        },
        (error) => reportListenerError(api.dispatch, label, uidOf(arg), error),
      )
      await api.cacheEntryRemoved
      unsubscribe()
    },
  }
}

/** Like `collectionListener`, for a single document. Data is `null` when it does not exist. */
export function docListener<Arg, S extends z.ZodType<object>>(
  options: ListenerOptions<Arg> & {
    schema: S
    doc: (arg: Arg, db: Firestore) => DocumentReference
  },
) {
  type Data = Stored<z.output<S>> | null
  const { label, uidOf, schema } = options
  const toItem = (snap: DocumentSnapshot, dispatch: AnyDispatch): Data => {
    if (!snap.exists()) return null
    const parsed = parseSnapshot(snap, schema)
    if (parsed.ok) return parsed.value
    reportInvalid(dispatch, label, [parsed.invalid])
    return null
  }

  return {
    async queryFn(arg: Arg, { dispatch }: { dispatch: AnyDispatch }) {
      try {
        const snap = await firstSnapshot(options.doc(arg, getFirebase().db))
        return { data: toItem(snap, dispatch) }
      } catch (error) {
        return { error: firestoreErrorMessage(error) }
      }
    },

    async onCacheEntryAdded(arg: Arg, api: LifecycleApi<Data>) {
      try {
        await api.cacheDataLoaded
      } catch {
        return
      }
      const unsubscribe = onSnapshot(
        options.doc(arg, getFirebase().db),
        { includeMetadataChanges: true },
        (snap) => {
          const item = toItem(snap, api.dispatch)
          api.updateCachedData(() => item)
        },
        (error) => reportListenerError(api.dispatch, label, uidOf(arg), error),
      )
      await api.cacheEntryRemoved
      unsubscribe()
    },
  }
}

// ---------------------------------------------------------------------------------------------
// Writes

/** How long to wait for the server before treating a write as queued for later sync. */
export const WRITE_GRACE_MS = 2500

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

/**
 * Waits for a Firestore write to be acknowledged, but no longer than `graceMs` (or not at all
 * when the browser is offline). Firestore applies the write locally at once and syncs it when
 * the network returns, so a queued write is a success. A rejection that arrives after the
 * grace period (e.g. denied by the rules on sync) goes to `onLateError`.
 */
export function settleWrite(
  commit: Promise<unknown>,
  onLateError: (error: unknown) => void,
  graceMs = WRITE_GRACE_MS,
): Promise<'committed' | 'queued'> {
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = setTimeout(
      () => {
        settled = true
        resolve('queued')
      },
      isOffline() ? 0 : graceMs,
    )
    commit.then(
      () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve('committed')
      },
      (error: unknown) => {
        if (settled) return onLateError(error)
        settled = true
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

/**
 * Runs a mutation body and returns `{ data }` or `{ error }` for RTK Query.
 * `run` starts the write(s) and returns the commit promise plus the mutation's result value;
 * anything it throws (validation, `UserFacingError`) becomes `{ error }`.
 */
export async function firestoreWrite<T>(
  dispatch: AnyDispatch,
  failureTitle: string,
  run: () =>
    Promise<{ commit: Promise<unknown>; result: T }> | { commit: Promise<unknown>; result: T },
): Promise<{ data: T } | { error: string }> {
  try {
    const { commit, result } = await run()
    await settleWrite(commit, (error) => {
      console.error(`[firestore] ${failureTitle}`, error)
      dispatch(
        toastAdded({
          title: failureTitle,
          description: `${firestoreErrorMessage(error)} The change was not saved.`,
          variant: 'error',
        }),
      )
    })
    return { data: result }
  } catch (error) {
    return { error: firestoreErrorMessage(error) }
  }
}
