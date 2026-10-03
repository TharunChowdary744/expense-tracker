import { currencyDigits } from './money'

/**
 * Evaluates a calculator expression typed into an amount field ("120+45.5", "1200÷3") to
 * integer minor units of `currency`. Arithmetic is exact (fractions of BigInts); only the
 * final result is rounded, half away from zero. A trailing operator is ignored so a
 * half-typed expression still previews. Throws a RangeError for anything else.
 */
export function evaluateAmount(expression: string, currency: string): number {
  const tokens = tokenize(expression)
  if (tokens.length > 0 && typeof tokens[tokens.length - 1] === 'string') tokens.pop()
  if (tokens.length === 0) throw new RangeError('Enter an amount')

  // Shunting-free evaluation for two precedence levels: fold × and ÷ into terms, then sum.
  const terms: Fraction[] = []
  let sign = 1n
  let term: Fraction | null = null
  let pendingOp: '*' | '/' | null = null
  for (const token of tokens) {
    if (typeof token !== 'string') {
      if (term === null) term = token
      else if (pendingOp === '*') term = multiply(term, token)
      else if (pendingOp === '/') term = divide(term, token)
      else throw new RangeError('Missing operator')
      pendingOp = null
      continue
    }
    if (term === null || pendingOp !== null) throw new RangeError('Two operators in a row')
    if (token === '*' || token === '/') {
      pendingOp = token
    } else {
      terms.push({ n: sign * term.n, d: term.d })
      sign = token === '-' ? -1n : 1n
      term = null
    }
  }
  if (term === null) throw new RangeError('Enter an amount')
  terms.push({ n: sign * term.n, d: term.d })

  const total = terms.reduce(add, { n: 0n, d: 1n })
  const scaled = total.n * 10n ** BigInt(currencyDigits(currency))
  const negative = scaled < 0n !== total.d < 0n
  const num = scaled < 0n ? -scaled : scaled
  const den = total.d < 0n ? -total.d : total.d
  let minor = num / den
  if ((num % den) * 2n >= den) minor += 1n
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('Amount is too large')
  const result = Number(minor)
  return negative && result !== 0 ? -result : result
}

/** True when the text uses an operator, so the UI can show the evaluated result. */
export function isExpression(text: string): boolean {
  return /\d\s*[-+*/×÷x]\s*[\d.]/i.test(text)
}

interface Fraction {
  n: bigint
  d: bigint
}

type Token = Fraction | '+' | '-' | '*' | '/'

const OPERATORS: Record<string, Token> = {
  '+': '+',
  '-': '-',
  '−': '-',
  '*': '*',
  '×': '*',
  x: '*',
  X: '*',
  '/': '/',
  '÷': '/',
}

function tokenize(expression: string): Token[] {
  const text = expression.replace(/[\s,_]/g, '')
  const tokens: Token[] = []
  let i = 0
  while (i < text.length) {
    const char = text.charAt(i)
    const op = OPERATORS[char]
    if (op) {
      tokens.push(op)
      i += 1
      continue
    }
    const match = /^(\d*)(?:\.(\d*))?/.exec(text.slice(i))
    const whole = match?.[1] ?? ''
    const frac = match?.[2] ?? ''
    if (!match || match[0] === '' || (whole === '' && frac === '')) {
      throw new RangeError(`Unexpected "${char}"`)
    }
    tokens.push({ n: BigInt(`${whole || '0'}${frac}`), d: 10n ** BigInt(frac.length) })
    i += match[0].length
  }
  return tokens
}

function add(a: Fraction, b: Fraction): Fraction {
  return { n: a.n * b.d + b.n * a.d, d: a.d * b.d }
}

function multiply(a: Fraction, b: Fraction): Fraction {
  return { n: a.n * b.n, d: a.d * b.d }
}

function divide(a: Fraction, b: Fraction): Fraction {
  if (b.n === 0n) throw new RangeError("Can't divide by zero")
  return { n: a.n * b.d, d: a.d * b.n }
}
