import { currencyDigits } from '@/utils/money'

/** Theme-aware chart colours (CSS variables defined for light and dark in index.css). */
export const seriesColor = (index: number) => `var(--chart-${(index % 8) + 1})`

export const INCOME_COLOR = 'var(--color-chart-income)'
export const EXPENSE_COLOR = 'var(--color-chart-expense)'
export const NET_COLOR = 'var(--color-chart-net)'

export const axisTick = { fontSize: 11, fill: 'var(--color-muted-foreground)' }

export const tooltipStyle = {
  background: 'var(--color-popover)',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  color: 'var(--color-popover-foreground)',
  fontSize: 12,
}

/** Short axis labels like "12K"; approximate by design, never shown as stored amounts. */
export function compactTick(currency: string, locale?: string) {
  const compact = new Intl.NumberFormat(locale, { notation: 'compact' })
  return (v: number) => compact.format(v / 10 ** currencyDigits(currency))
}

/** "+12%" / "−8%" for display; null shows as "—". */
export function formatDelta(percent: number | null, locale?: string): string {
  if (percent === null || !Number.isFinite(percent)) return '—'
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: Math.abs(percent) < 10 ? 1 : 0,
    signDisplay: 'exceptZero',
  }).format(percent / 100)
}

export function formatShare(share: number, locale?: string): string {
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(share)
}
