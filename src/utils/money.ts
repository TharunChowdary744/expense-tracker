/**
 * Money helpers. Amounts are always integer minor units (paise, cents) plus an ISO 4217
 * currency code. Floats never hold money here: parsing and conversion work on decimal strings.
 */

const digitsCache = new Map<string, number>()

/** Number of minor-unit digits for a currency: INR/USD/EUR 2, JPY 0, KWD 3. */
export function currencyDigits(currency: string): number {
  const code = currency.toUpperCase()
  const cached = digitsCache.get(code)
  if (cached !== undefined) return cached
  // Throws a RangeError for malformed codes, which is what we want.
  const { maximumFractionDigits } = new Intl.NumberFormat('en', {
    style: 'currency',
    currency: code,
  }).resolvedOptions()
  const digits = Number(maximumFractionDigits)
  digitsCache.set(code, digits)
  return digits
}

const DECIMAL = /^([+-])?(\d*)(?:\.(\d*))?$/

/**
 * Converts a major-unit amount ("1,234.56", "-0.5", 12.3) to integer minor units.
 * Extra decimal places are rounded half away from zero. Grouping commas, spaces and
 * underscores are ignored; "." is the only decimal separator. Throws a RangeError for
 * anything that is not a plain decimal number or is outside the safe integer range.
 */
export function toMinor(amount: string | number, currency: string): number {
  const digits = currencyDigits(currency)
  const text = typeof amount === 'number' ? numberToPlainString(amount) : amount
  const cleaned = text.trim().replace(/[\s,_]/g, '')
  const match = DECIMAL.exec(cleaned)
  const intPart = match?.[2] ?? ''
  const fracPart = match?.[3] ?? ''
  if (!match || (intPart === '' && fracPart === '')) {
    throw new RangeError(`Not a valid amount: "${text}"`)
  }

  const negative = match[1] === '-'
  const kept = fracPart.slice(0, digits).padEnd(digits, '0')
  let minor = BigInt(`${intPart || '0'}${kept}`)
  const nextDigit = fracPart.charAt(digits)
  if (nextDigit !== '' && nextDigit >= '5') minor += 1n

  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`Amount is too large: "${text}"`)
  }
  const result = Number(minor)
  // Avoid -0, which Firestore and equality checks treat inconsistently.
  return negative && result !== 0 ? -result : result
}

function numberToPlainString(value: number): string {
  if (!Number.isFinite(value)) throw new RangeError(`Not a valid amount: ${value}`)
  // toString gives the shortest round-tripping form; avoid exponent notation.
  const text = String(value)
  if (!/e/i.test(text)) return text
  const fixed = value.toFixed(20)
  if (/e/i.test(fixed)) throw new RangeError(`Number is too large: ${value}`)
  return fixed.replace(/\.?0+$/, '')
}

/**
 * Converts integer minor units to an exact major-unit decimal string ("-12.30", "1500" for
 * JPY). A string, not a number, so nothing downstream gets a float by accident.
 */
export function fromMinor(amountMinor: number, currency: string): string {
  assertMinor(amountMinor)
  const digits = currencyDigits(currency)
  const negative = amountMinor < 0
  const abs = String(Math.abs(amountMinor)).padStart(digits + 1, '0')
  const whole = digits === 0 ? abs : abs.slice(0, -digits)
  const frac = digits === 0 ? '' : `.${abs.slice(-digits)}`
  return `${negative ? '-' : ''}${whole}${frac}`
}

/** Formats minor units for display, e.g. formatMoney(123456, 'INR', 'en-IN') → "₹1,234.56". */
export function formatMoney(
  amountMinor: number,
  currency: string,
  locale?: string,
  options: Pick<Intl.NumberFormatOptions, 'currencyDisplay' | 'signDisplay'> = {},
): string {
  const digits = currencyDigits(currency)
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    ...options,
  })
  // Intl formats decimal strings exactly, so large amounts never pass through a float.
  return formatter.format(fromMinor(amountMinor, currency) as `${number}`)
}

/**
 * Splits `totalMinor` in proportion to `weights` so the parts always sum to the total.
 *
 * Uses the largest-remainder method: each part gets the floor of its exact share, then the
 * leftover minor units go one each to the parts with the largest fractional remainder (ties go
 * to the earlier index). Negative totals are split the same way and negated, so -100 over three
 * equal weights is [-34, -33, -33]. Weights must be finite and non-negative with a positive sum.
 */
export function allocate(totalMinor: number, weights: readonly number[]): number[] {
  assertMinor(totalMinor)
  if (weights.length === 0) throw new RangeError('allocate needs at least one weight')
  if (weights.some((w) => !Number.isFinite(w) || w < 0)) {
    throw new RangeError('Weights must be finite, non-negative numbers')
  }
  const weightSum = weights.reduce((sum, w) => sum + w, 0)
  if (weightSum <= 0) throw new RangeError('At least one weight must be positive')

  const sign = totalMinor < 0 ? -1 : 1
  const total = Math.abs(totalMinor)
  const { scaled, scaledSum } = scaleWeights(weights)

  const parts: bigint[] = []
  const remainders: { index: number; remainder: bigint }[] = []
  let allocated = 0n
  const bigTotal = BigInt(total)
  scaled.forEach((w, index) => {
    const exact = bigTotal * w
    const share = exact / scaledSum
    parts.push(share)
    allocated += share
    remainders.push({ index, remainder: exact % scaledSum })
  })

  // The leftover is always smaller than the number of parts.
  const leftover = Number(bigTotal - allocated)
  remainders.sort((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
  )
  const bumped = new Set(remainders.slice(0, leftover).map((r) => r.index))

  return parts.map((p, index) => {
    const value = Number(p) + (bumped.has(index) ? 1 : 0)
    return sign < 0 && value !== 0 ? -value : value
  })
}

/** Turns decimal weights (e.g. percentages like 33.33) into exact integers with one scale. */
function scaleWeights(weights: readonly number[]): { scaled: bigint[]; scaledSum: bigint } {
  const texts = weights.map(numberToPlainString)
  const decimals = Math.max(...texts.map((t) => t.split('.')[1]?.length ?? 0))
  const scaled = texts.map((t) => {
    const [whole, frac = ''] = t.split('.')
    return BigInt(`${whole}${frac.padEnd(decimals, '0')}`)
  })
  return { scaled, scaledSum: scaled.reduce((a, b) => a + b, 0n) }
}

function assertMinor(value: number): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Minor units must be a safe integer, got ${value}`)
  }
}

/** True when `value` is a valid stored money amount (a safe integer). */
export function isMinor(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value)
}
