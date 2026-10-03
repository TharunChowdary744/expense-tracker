/** Currencies offered in pickers. Any valid ISO 4217 code still formats correctly. */
export const SUPPORTED_CURRENCIES = [
  'INR',
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'AUD',
  'CAD',
  'NZD',
  'SGD',
  'HKD',
  'CNY',
  'AED',
  'SAR',
  'CHF',
  'SEK',
  'NOK',
  'DKK',
  'ZAR',
  'BRL',
  'MXN',
  'THB',
  'MYR',
  'IDR',
  'PHP',
  'LKR',
  'NPR',
  'BDT',
  'PKR',
  'KWD',
] as const

export const CURRENCY_CODE = /^[A-Z]{3}$/

/** "USD" → "US Dollar" in the given locale; falls back to the code. */
export function currencyName(code: string, locale?: string): string {
  try {
    return new Intl.DisplayNames(locale, { type: 'currency' }).of(code) ?? code
  } catch {
    return code
  }
}

/** Options for a currency select, keeping `current` even when it is not in the list. */
export function currencyOptions(
  locale?: string,
  current?: string,
): { value: string; label: string }[] {
  const codes: string[] = [...SUPPORTED_CURRENCIES]
  if (current && !codes.includes(current)) codes.unshift(current)
  return codes.map((code) => ({ value: code, label: `${code} · ${currencyName(code, locale)}` }))
}
