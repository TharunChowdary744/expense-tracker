import { Timestamp, type DocumentSnapshot, type FirestoreError } from 'firebase/firestore'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

type SnapshotHandler = (snap: unknown) => void
type ErrorHandler = (error: FirestoreError) => void

const listeners: { next: SnapshotHandler; error: ErrorHandler; unsubscribe: () => void }[] = []

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>()
  return {
    ...actual,
    // Records each subscription so tests can push snapshots and errors.
    onSnapshot: vi.fn((_ref: unknown, ...args: unknown[]) => {
      const fns = args.filter((a) => typeof a === 'function') as [SnapshotHandler, ErrorHandler]
      const entry = { next: fns[0], error: fns[1], unsubscribe: vi.fn() }
      listeners.push(entry)
      return entry.unsubscribe
    }),
  }
})

const currentUser = { value: { uid: 'u1' } as { uid: string } | null }
vi.mock('@/lib/firebase', () => ({
  getFirebase: () => ({
    db: {},
    auth: {
      get currentUser() {
        return currentUser.value
      },
    },
  }),
}))

const {
  collectionListener,
  docListener,
  firestoreErrorMessage,
  firestoreWrite,
  parseSnapshot,
  settleWrite,
  toPlain,
  UserFacingError,
} = await import('./firestore')

function fakeDoc(
  id: string,
  data: Record<string, unknown> | undefined,
  pending = false,
): DocumentSnapshot {
  return {
    id,
    ref: { path: `things/${id}` },
    exists: () => data !== undefined,
    data: () => data,
    metadata: { hasPendingWrites: pending },
  } as unknown as DocumentSnapshot
}

/** FirestoreError's constructor is private; real ones are FirebaseErrors with a code. */
const fsError = (code: string) =>
  Object.assign(new Error(code), { name: 'FirebaseError', code }) as unknown as FirestoreError

const fakeQuerySnap = (docs: DocumentSnapshot[]) => ({ docs })

const schema = z.object({ name: z.string(), at: z.string().optional() })

beforeEach(() => {
  listeners.length = 0
  currentUser.value = { uid: 'u1' }
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('toPlain', () => {
  it('turns Timestamps into ISO strings at any depth', () => {
    const ts = Timestamp.fromDate(new Date('2026-10-02T08:00:00.000Z'))
    expect(toPlain({ a: ts, list: [ts, 1], nested: { b: ts, c: null }, s: 'x' })).toEqual({
      a: '2026-10-02T08:00:00.000Z',
      list: ['2026-10-02T08:00:00.000Z', 1],
      nested: { b: '2026-10-02T08:00:00.000Z', c: null },
      s: 'x',
    })
  })
})

describe('parseSnapshot', () => {
  it('returns validated data with id and pending flag', () => {
    const result = parseSnapshot(fakeDoc('a', { name: 'A' }, true), schema)
    expect(result).toEqual({ ok: true, value: { name: 'A', id: 'a', pending: true } })
  })

  it('reports the first issue for invalid docs', () => {
    const result = parseSnapshot(fakeDoc('b', { name: 3 }), schema)
    expect(result).toEqual({
      ok: false,
      invalid: { path: 'things/b', message: expect.stringContaining('name:') },
    })
  })
})

describe('firestoreErrorMessage', () => {
  it('maps Firestore codes to friendly text', () => {
    expect(firestoreErrorMessage(fsError('permission-denied'))).toMatch(/permission/)
    expect(firestoreErrorMessage(fsError('unavailable'))).toMatch(/connection/)
    expect(firestoreErrorMessage(fsError('aborted'))).toMatch(/went wrong/)
  })

  it('passes user-facing messages through and hides everything else', () => {
    expect(firestoreErrorMessage(new UserFacingError('Name taken'))).toBe('Name taken')
    expect(firestoreErrorMessage(new Error('internal detail'))).toMatch(/went wrong/)
  })
})

describe('settleWrite', () => {
  it('resolves committed when the server acknowledges in time', async () => {
    await expect(settleWrite(Promise.resolve(), vi.fn())).resolves.toBe('committed')
  })

  it('rejects when the write fails in time', async () => {
    await expect(settleWrite(Promise.reject(new Error('no')), vi.fn())).rejects.toThrow('no')
  })

  it('resolves queued after the grace period and reports a late failure', async () => {
    vi.useFakeTimers()
    let fail: (e: Error) => void = () => {}
    const commit = new Promise<void>((_, reject) => (fail = reject))
    const onLate = vi.fn()
    const settled = settleWrite(commit, onLate, 1000)
    await vi.advanceTimersByTimeAsync(1000)
    await expect(settled).resolves.toBe('queued')
    fail(new Error('denied on sync'))
    await vi.runAllTimersAsync()
    expect(onLate).toHaveBeenCalledWith(new Error('denied on sync'))
  })

  it('does not wait at all while the browser is offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    vi.useFakeTimers()
    const settled = settleWrite(new Promise(() => {}), vi.fn())
    await vi.advanceTimersByTimeAsync(0)
    await expect(settled).resolves.toBe('queued')
  })
})

describe('firestoreWrite', () => {
  it('returns the result as data', async () => {
    const dispatch = vi.fn()
    const result = await firestoreWrite(dispatch, 'Failed', () => ({
      commit: Promise.resolve(),
      result: { id: 'x' },
    }))
    expect(result).toEqual({ data: { id: 'x' } })
  })

  it('returns a friendly error when the write or setup throws', async () => {
    const dispatch = vi.fn()
    expect(
      await firestoreWrite(dispatch, 'Failed', () => ({
        commit: Promise.reject(fsError('permission-denied')),
        result: null,
      })),
    ).toEqual({ error: expect.stringMatching(/permission/) })
    expect(
      await firestoreWrite(dispatch, 'Failed', () => {
        throw new UserFacingError('Bad input')
      }),
    ).toEqual({ error: 'Bad input' })
  })

  it('toasts a failure that only arrives after the write was queued', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const dispatch = vi.fn()
    let fail: (e: Error) => void = () => {}
    const commit = new Promise<void>((_, reject) => (fail = reject))
    const result = await firestoreWrite(dispatch, 'Could not save', () => ({ commit, result: 1 }))
    expect(result).toEqual({ data: 1 })
    fail(fsError('permission-denied'))
    await Promise.resolve()
    await Promise.resolve()
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ui/toastAdded',
        payload: expect.objectContaining({ title: 'Could not save', variant: 'error' }),
      }),
    )
  })
})

describe('collectionListener', () => {
  const make = () =>
    collectionListener({
      label: 'things',
      uidOf: (uid: string) => uid,
      schema,
      query: () => ({ type: 'query' }) as never,
      sort: (a, b) => a.name.localeCompare(b.name),
    })

  it('loads the first snapshot, sorts it and skips invalid docs with one report', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const dispatch = vi.fn()
    const pending = make().queryFn('u1', { dispatch })
    listeners[0]?.next(
      fakeQuerySnap([fakeDoc('b', { name: 'B' }), fakeDoc('a', { name: 'A' }), fakeDoc('x', {})]),
    )
    const result = await pending
    expect(result).toEqual({
      data: [
        { name: 'A', id: 'a', pending: false },
        { name: 'B', id: 'b', pending: false },
      ],
    })
    expect(listeners[0]?.unsubscribe).toHaveBeenCalled()
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch.mock.calls[0]?.[0].payload.title).toBe('Some things could not be read')
  })

  it('returns an error when the first read fails', async () => {
    const pending = make().queryFn('u1', { dispatch: vi.fn() })
    listeners[0]?.error(fsError('permission-denied'))
    expect(await pending).toEqual({ error: expect.stringMatching(/permission/) })
  })

  it('streams updates into the cache and unsubscribes when the entry is removed', async () => {
    let remove: () => void = () => {}
    const cacheEntryRemoved = new Promise<void>((r) => (remove = r))
    const updateCachedData = vi.fn()
    const done = make().onCacheEntryAdded('u1', {
      dispatch: vi.fn(),
      updateCachedData,
      cacheDataLoaded: Promise.resolve(),
      cacheEntryRemoved,
    })
    await Promise.resolve()
    await Promise.resolve()
    const live = listeners[0]
    live?.next(fakeQuerySnap([fakeDoc('a', { name: 'A' }, true)]))
    const recipe = updateCachedData.mock.calls[0]?.[0] as () => unknown
    expect(recipe()).toEqual([{ name: 'A', id: 'a', pending: true }])

    remove()
    await done
    expect(live?.unsubscribe).toHaveBeenCalled()
  })

  it('does not listen when the first load never succeeds', async () => {
    await make().onCacheEntryAdded('u1', {
      dispatch: vi.fn(),
      updateCachedData: vi.fn(),
      cacheDataLoaded: Promise.reject(new Error('removed')),
      cacheEntryRemoved: Promise.resolve(),
    })
    expect(listeners).toHaveLength(0)
  })

  it('reports listener errors, except permission errors after sign-out', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const dispatch = vi.fn()
    const lifecycle = {
      dispatch,
      updateCachedData: vi.fn(),
      cacheDataLoaded: Promise.resolve(),
      cacheEntryRemoved: new Promise<void>(() => {}),
    }
    void make().onCacheEntryAdded('u1', lifecycle)
    void make().onCacheEntryAdded('u1', lifecycle)
    await Promise.resolve()
    await Promise.resolve()

    listeners[0]?.error(fsError('unavailable'))
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch.mock.calls[0]?.[0].payload.title).toBe('Live updates for things stopped')

    currentUser.value = null
    listeners[1]?.error(fsError('permission-denied'))
    expect(dispatch).toHaveBeenCalledTimes(1)
  })
})

describe('docListener', () => {
  const make = () =>
    docListener({
      label: 'profile',
      uidOf: (uid: string) => uid,
      schema,
      doc: () => ({ type: 'document' }) as never,
    })

  it('returns null for a missing doc and the parsed doc otherwise', async () => {
    const first = make().queryFn('u1', { dispatch: vi.fn() })
    listeners[0]?.next(fakeDoc('p', undefined))
    expect(await first).toEqual({ data: null })

    const second = make().queryFn('u1', { dispatch: vi.fn() })
    listeners[1]?.next(fakeDoc('p', { name: 'P' }))
    expect(await second).toEqual({ data: { name: 'P', id: 'p', pending: false } })
  })

  it('returns null and reports an invalid doc', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const dispatch = vi.fn()
    const pending = make().queryFn('u1', { dispatch })
    listeners[0]?.next(fakeDoc('p', { name: 1 }))
    expect(await pending).toEqual({ data: null })
    expect(dispatch).toHaveBeenCalledTimes(1)
  })

  it('returns an error when the read fails', async () => {
    const pending = make().queryFn('u1', { dispatch: vi.fn() })
    listeners[0]?.error(fsError('unavailable'))
    expect(await pending).toEqual({ error: expect.stringMatching(/connection/) })
  })

  it('streams updates and stops on removal', async () => {
    let remove: () => void = () => {}
    const updateCachedData = vi.fn()
    const done = make().onCacheEntryAdded('u1', {
      dispatch: vi.fn(),
      updateCachedData,
      cacheDataLoaded: Promise.resolve(),
      cacheEntryRemoved: new Promise<void>((r) => (remove = r)),
    })
    await Promise.resolve()
    await Promise.resolve()
    listeners[0]?.next(fakeDoc('p', { name: 'Q' }))
    expect((updateCachedData.mock.calls[0]?.[0] as () => unknown)()).toEqual({
      name: 'Q',
      id: 'p',
      pending: false,
    })
    remove()
    await done
    expect(listeners[0]?.unsubscribe).toHaveBeenCalled()
  })
})
