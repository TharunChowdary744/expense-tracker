export const FALLBACK_CURRENCY = 'INR'

const REGION_CURRENCY: Record<string, string> = {
  IN: 'INR',
  US: 'USD',
  GB: 'GBP',
  CA: 'CAD',
  AU: 'AUD',
  NZ: 'NZD',
  SG: 'SGD',
  AE: 'AED',
  JP: 'JPY',
  CH: 'CHF',
  ...Object.fromEntries(
    ['DE', 'FR', 'ES', 'IT', 'NL', 'BE', 'AT', 'IE', 'PT', 'FI', 'GR', 'LU'].map((r) => [r, 'EUR']),
  ),
}

/**
 * INR unless the browser locale carries an explicit region we know (en-US, de-DE, ...).
 * A bare language such as "en" says nothing about the region, so it stays INR.
 */
export function defaultCurrencyForLocale(locale: string | undefined): string {
  if (!locale) return FALLBACK_CURRENCY
  try {
    const region = new Intl.Locale(locale).region
    return (region && REGION_CURRENCY[region]) || FALLBACK_CURRENCY
  } catch {
    return FALLBACK_CURRENCY
  }
}

export interface UserSettings {
  baseCurrency: string
  theme: 'system' | 'light' | 'dark'
  locale: string
  dateFormat: string
  weekStartsOn: 0 | 1
  notificationPrefs: {
    budgetAlerts: boolean
    recurringReminders: boolean
    groupActivity: boolean
    push: boolean
  }
}

export function defaultSettings(locale: string | undefined): UserSettings {
  const tag = locale || 'en-IN'
  let region: string | undefined
  try {
    region = new Intl.Locale(tag).region
  } catch {
    region = undefined
  }
  return {
    baseCurrency: defaultCurrencyForLocale(locale),
    theme: 'system',
    locale: tag,
    dateFormat: 'dd MMM yyyy',
    weekStartsOn: region === 'US' ? 0 : 1,
    notificationPrefs: {
      budgetAlerts: true,
      recurringReminders: true,
      groupActivity: true,
      push: false,
    },
  }
}

export interface DefaultCategory {
  id: string
  name: string
  kind: 'expense' | 'income'
  icon: string
  color: string
}

/** Deterministic ids keep first-sign-in seeding idempotent. */
export const DEFAULT_CATEGORIES: readonly DefaultCategory[] = [
  { id: 'food', name: 'Food', kind: 'expense', icon: 'utensils', color: '#ea580c' },
  { id: 'transport', name: 'Transport', kind: 'expense', icon: 'bus', color: '#2563eb' },
  { id: 'rent', name: 'Rent', kind: 'expense', icon: 'house', color: '#7c3aed' },
  { id: 'utilities', name: 'Utilities', kind: 'expense', icon: 'zap', color: '#ca8a04' },
  { id: 'shopping', name: 'Shopping', kind: 'expense', icon: 'shopping-bag', color: '#db2777' },
  { id: 'health', name: 'Health', kind: 'expense', icon: 'heart-pulse', color: '#dc2626' },
  {
    id: 'entertainment',
    name: 'Entertainment',
    kind: 'expense',
    icon: 'clapperboard',
    color: '#9333ea',
  },
  { id: 'travel', name: 'Travel', kind: 'expense', icon: 'plane', color: '#0891b2' },
  { id: 'education', name: 'Education', kind: 'expense', icon: 'graduation-cap', color: '#4f46e5' },
  { id: 'salary', name: 'Salary', kind: 'income', icon: 'banknote', color: '#16a34a' },
  { id: 'freelance', name: 'Freelance', kind: 'income', icon: 'laptop', color: '#0d9488' },
  { id: 'other', name: 'Other', kind: 'expense', icon: 'ellipsis', color: '#64748b' },
]

export const DEFAULT_CASH_ACCOUNT_ID = 'cash'
