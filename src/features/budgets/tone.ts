import type { BudgetTone } from './utils'

export const TONE_BAR: Record<BudgetTone, string> = {
  ok: 'bg-success',
  warning: 'bg-warning',
  over: 'bg-destructive',
}

export const TONE_TEXT: Record<BudgetTone, string> = {
  ok: 'text-success',
  warning: 'text-warning',
  over: 'text-destructive',
}

export const TONE_LABEL: Record<BudgetTone, string> = {
  ok: 'On track',
  warning: 'Close to the limit',
  over: 'Over budget',
}

/** Formats a percentage of the limit; an infinite one (limit of zero or less) shows as "—". */
export function formatPercent(percent: number): string {
  return Number.isFinite(percent) ? `${Math.round(percent)}%` : '—'
}
