import { allocate } from '@/utils/money'

/**
 * Splitting a group expense. Pure functions over integer minor units: every split uses
 * `allocate`, so remainders go deterministically (to the earliest members in `order`) and the
 * shares always sum to the amount exactly.
 */

export const SPLIT_TYPES = ['equal', 'exact', 'percent', 'shares'] as const
export type SplitType = (typeof SPLIT_TYPES)[number]

export const SPLIT_TYPE_LABELS: Record<SplitType, string> = {
  equal: 'Equally',
  exact: 'Exact amounts',
  percent: 'Percentages',
  shares: 'Shares',
}

export type SplitOutcome =
  | { ok: true; shares: Record<string, number> }
  /** `difference` is total entered minus target (minor units, or hundredths of a percent). */
  | { ok: false; reason: 'none' | 'invalid' | 'total'; difference?: number }

/** Members in `order` first (in that order), then any others by uid. */
export function orderMembers(uids: Iterable<string>, order: readonly string[]): string[] {
  const rank = new Map(order.map((uid, i) => [uid, i]))
  return [...new Set(uids)].sort((a, b) => {
    const ra = rank.get(a) ?? Number.MAX_SAFE_INTEGER
    const rb = rank.get(b) ?? Number.MAX_SAFE_INTEGER
    return ra !== rb ? ra - rb : a < b ? -1 : a > b ? 1 : 0
  })
}

/** A percentage with at most 2 decimals as an integer number of hundredths (33.33 → 3333). */
export function percentToHundredths(value: number): number | null {
  if (!Number.isFinite(value) || value < 0) return null
  const scaled = Math.round(value * 100)
  return Math.abs(scaled - value * 100) < 1e-6 ? scaled : null
}

function fromWeights(
  amount: number,
  uids: readonly string[],
  weights: readonly number[],
): Record<string, number> {
  const parts = allocate(amount, weights)
  const shares: Record<string, number> = {}
  uids.forEach((uid, i) => {
    const part = parts[i] ?? 0
    if (part > 0) shares[uid] = part
  })
  return shares
}

/**
 * Computes each member's share of `amount`.
 *
 * `input` depends on the split type:
 * - equal: 1 for each included member (0 or missing = not included)
 * - exact: each member's amount in minor units; must sum to `amount`
 * - percent: each member's percentage (≤ 2 decimals); must sum to 100
 * - shares: each member's weight, e.g. 2, 1, 1
 *
 * Members whose share is 0 are left out of the result.
 */
export function computeShares(
  amount: number,
  splitType: SplitType,
  input: Readonly<Record<string, number>>,
  order: readonly string[],
): SplitOutcome {
  if (!Number.isSafeInteger(amount) || amount <= 0) return { ok: false, reason: 'invalid' }
  const uids = orderMembers(Object.keys(input), order)
  const values = uids.map((uid) => input[uid] ?? 0)
  if (values.some((v) => !Number.isFinite(v) || v < 0)) return { ok: false, reason: 'invalid' }

  switch (splitType) {
    case 'equal': {
      const included = uids.filter((_, i) => (values[i] ?? 0) > 0)
      if (included.length === 0) return { ok: false, reason: 'none' }
      return {
        ok: true,
        shares: fromWeights(
          amount,
          included,
          included.map(() => 1),
        ),
      }
    }
    case 'exact': {
      if (values.some((v) => !Number.isSafeInteger(v))) return { ok: false, reason: 'invalid' }
      const total = values.reduce((a, b) => a + b, 0)
      if (total !== amount) return { ok: false, reason: 'total', difference: total - amount }
      const shares: Record<string, number> = {}
      uids.forEach((uid, i) => {
        const v = values[i] ?? 0
        if (v > 0) shares[uid] = v
      })
      return { ok: true, shares }
    }
    case 'percent': {
      const hundredths = values.map(percentToHundredths)
      if (hundredths.some((h) => h === null)) return { ok: false, reason: 'invalid' }
      const weights = hundredths as number[]
      const total = weights.reduce((a, b) => a + b, 0)
      if (total !== 10000) return { ok: false, reason: 'total', difference: total - 10000 }
      return { ok: true, shares: fromWeights(amount, uids, weights) }
    }
    case 'shares': {
      if (values.every((v) => v === 0)) return { ok: false, reason: 'none' }
      return { ok: true, shares: fromWeights(amount, uids, values) }
    }
  }
}

export type PaidOutcome =
  | { ok: true; paidBy: Record<string, number> }
  | { ok: false; reason: 'none' | 'invalid' | 'total'; difference?: number }

/** Who paid: one payer pays it all, or several payers whose amounts must sum to `amount`. */
export function computePaidBy(
  amount: number,
  payers: Readonly<Record<string, number>>,
): PaidOutcome {
  const entries = Object.entries(payers).filter(([, v]) => v !== 0)
  if (entries.some(([, v]) => !Number.isSafeInteger(v) || v < 0)) {
    return { ok: false, reason: 'invalid' }
  }
  if (entries.length === 0) return { ok: false, reason: 'none' }
  const total = entries.reduce((a, [, v]) => a + v, 0)
  if (total !== amount) return { ok: false, reason: 'total', difference: total - amount }
  return { ok: true, paidBy: Object.fromEntries(entries) }
}

/** Sum of a money map. */
export function sumMap(map: Readonly<Record<string, number>>): number {
  return Object.values(map).reduce((a, b) => a + b, 0)
}

/**
 * What an expense means for one member: positive when the others owe them, negative when they
 * owe, 0 when they are square or not involved.
 */
export function memberEffect(
  expense: { paidBy: Readonly<Record<string, number>>; shares: Readonly<Record<string, number>> },
  uid: string,
): number {
  return (expense.paidBy[uid] ?? 0) - (expense.shares[uid] ?? 0)
}
