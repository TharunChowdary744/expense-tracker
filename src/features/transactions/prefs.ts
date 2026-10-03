/**
 * Quick-add preferences remembered per user in this browser: the last account, recently used
 * categories, payees and tags, and the last exchange rate per currency pair. Kept out of
 * Firestore on purpose (no data model change); losing them only loses convenience.
 */

const RECENT_CATEGORIES_MAX = 6
const RECENT_PAYEES_MAX = 30
const KNOWN_TAGS_MAX = 100

export interface QuickAddPrefs {
  lastAccountId: string | null
  recentCategoryIds: string[]
  recentPayees: string[]
  knownTags: string[]
  /** "USD>INR" → "83.25" (1 USD = 83.25 INR). */
  fxRates: Record<string, string>
}

const EMPTY: QuickAddPrefs = {
  lastAccountId: null,
  recentCategoryIds: [],
  recentPayees: [],
  knownTags: [],
  fxRates: {},
}

const key = (uid: string) => `ledgerly:quick-add:${uid}`

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

export function loadPrefs(uid: string): QuickAddPrefs {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key(uid)) ?? 'null')
    if (!raw || typeof raw !== 'object') return EMPTY
    const r = raw as Record<string, unknown>
    const fxRates: Record<string, string> = {}
    if (r.fxRates && typeof r.fxRates === 'object') {
      for (const [pair, rate] of Object.entries(r.fxRates)) {
        if (typeof rate === 'string') fxRates[pair] = rate
      }
    }
    return {
      lastAccountId: typeof r.lastAccountId === 'string' ? r.lastAccountId : null,
      recentCategoryIds: strings(r.recentCategoryIds),
      recentPayees: strings(r.recentPayees),
      knownTags: strings(r.knownTags),
      fxRates,
    }
  } catch {
    return EMPTY
  }
}

function savePrefs(uid: string, prefs: QuickAddPrefs) {
  try {
    localStorage.setItem(key(uid), JSON.stringify(prefs))
  } catch {
    // Storage full or blocked: preferences are a convenience only.
  }
}

/** Moves `values` to the front of `list`, de-duplicated, capped at `max`. */
function bump(list: readonly string[], values: readonly string[], max: number): string[] {
  const fresh = values.filter(Boolean)
  return [...new Set([...fresh, ...list])].slice(0, max)
}

export const fxPair = (from: string, to: string) => `${from}>${to}`

/** Records what a saved transaction used so the next quick-add starts from it. */
export function rememberTransaction(
  uid: string,
  tx: {
    accountId: string
    categoryId?: string
    payee: string
    tags: string[]
    currency: string
    fxRateText: string | null
  },
  baseCurrency: string,
): void {
  const prefs = loadPrefs(uid)
  savePrefs(uid, {
    lastAccountId: tx.accountId,
    recentCategoryIds: tx.categoryId
      ? bump(prefs.recentCategoryIds, [tx.categoryId], RECENT_CATEGORIES_MAX)
      : prefs.recentCategoryIds,
    recentPayees: bump(prefs.recentPayees, [tx.payee], RECENT_PAYEES_MAX),
    knownTags: bump(prefs.knownTags, tx.tags, KNOWN_TAGS_MAX),
    fxRates: tx.fxRateText
      ? { ...prefs.fxRates, [fxPair(tx.currency, baseCurrency)]: tx.fxRateText }
      : prefs.fxRates,
  })
}

/** Adds tags seen elsewhere (e.g. in the list) to the suggestions. */
export function rememberTags(uid: string, tags: readonly string[]): void {
  if (tags.length === 0) return
  const prefs = loadPrefs(uid)
  const unknown = tags.filter((tag) => tag && !prefs.knownTags.includes(tag))
  if (unknown.length === 0) return
  const knownTags = [...prefs.knownTags, ...new Set(unknown)].slice(0, KNOWN_TAGS_MAX)
  savePrefs(uid, { ...prefs, knownTags })
}
