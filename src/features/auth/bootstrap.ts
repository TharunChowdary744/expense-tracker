import {
  doc,
  getDoc,
  serverTimestamp,
  writeBatch,
  type DocumentData,
  type Firestore,
} from 'firebase/firestore'
import { DEFAULT_CASH_ACCOUNT_ID, DEFAULT_CATEGORIES, defaultSettings } from './defaults'

export interface BootstrapProfile {
  uid: string
  email: string | null
  displayName: string | null
  photoURL: string | null
}

export interface SeedDoc {
  /** Path segments relative to the database root, e.g. ['users', uid, 'categories', 'food']. */
  path: [string, ...string[]]
  data: DocumentData
}

/** Pure description of everything a new user starts with (no I/O, easy to test). */
export function buildBootstrapDocs(
  profile: BootstrapProfile,
  locale: string | undefined,
): SeedDoc[] {
  const { uid } = profile
  const stamps = () => ({
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: uid,
  })
  const settings = defaultSettings(locale)

  return [
    {
      path: ['users', uid],
      data: {
        displayName: profile.displayName ?? '',
        email: profile.email ?? '',
        photoURL: profile.photoURL ?? '',
        settings,
        fcmTokens: [],
        ...stamps(),
      },
    },
    ...DEFAULT_CATEGORIES.map(({ id, ...category }, order): SeedDoc => ({
      path: ['users', uid, 'categories', id],
      data: { ...category, order, archived: false, ...stamps() },
    })),
    {
      path: ['users', uid, 'accounts', DEFAULT_CASH_ACCOUNT_ID],
      data: {
        name: 'Cash',
        type: 'cash',
        currency: settings.baseCurrency,
        openingBalance: 0,
        color: '#16a34a',
        icon: 'wallet',
        archived: false,
        ...stamps(),
      },
    },
  ]
}

const inFlight = new Map<string, Promise<boolean>>()

/**
 * Creates users/{uid}, the default categories and the Cash account in one atomic batch.
 *
 * Idempotent: it does nothing when users/{uid} already exists, the doc ids are fixed, and
 * concurrent calls for the same uid share one promise. Resolves true when it seeded.
 */
export function ensureUserBootstrap(
  db: Firestore,
  profile: BootstrapProfile,
  locale: string | undefined,
): Promise<boolean> {
  const existing = inFlight.get(profile.uid)
  if (existing) return existing

  const run = (async () => {
    const userRef = doc(db, 'users', profile.uid)
    if ((await getDoc(userRef)).exists()) return false

    const batch = writeBatch(db)
    for (const { path, data } of buildBootstrapDocs(profile, locale)) {
      const [first, ...rest] = path
      batch.set(doc(db, first, ...rest), data)
    }
    await batch.commit()
    return true
  })().finally(() => inFlight.delete(profile.uid))

  inFlight.set(profile.uid, run)
  return run
}
