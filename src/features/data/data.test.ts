import { describe, expect, it } from 'vitest'
import type { ReportCategory } from '@/features/reports/types'
import { csvCell, detectDelimiter, parseCsv, toCsv, unescapeFormula } from '@/utils/csv'
import { encodeValue, decodeValue, parseBackup, categoryWriteOrder, pickFields } from './backup'
import { categoryLabel, CSV_COLUMNS, transactionsToCsv, type ExportTx } from './csvExport'
import {
  daySpan,
  findDuplicates,
  guessDateFormat,
  guessMapping,
  importInstant,
  mapRows,
  mappingProblem,
  matchCategory,
  parseAmountCell,
  parseDateCell,
  parseTimeCell,
  type ImportContext,
  type ImportedTx,
} from './csvImport'
import { planBatches } from './writes'

const TZ = 'Asia/Kolkata'

const cat = (
  id: string,
  name: string,
  parentId: string | null = null,
  kind: 'expense' | 'income' = 'expense',
): ReportCategory => ({ id, name, kind, parentId, color: '#ea580c', order: 0 })

const categories = [
  cat('food', 'Food'),
  cat('groceries', 'Groceries', 'food'),
  cat('transport', 'Transport'),
  cat('salary', 'Salary', null, 'income'),
  cat('other-groceries', 'Groceries', 'transport'),
]
const accounts = [
  { id: 'bank', name: 'HDFC Bank', currency: 'INR' },
  { id: 'card', name: 'Card', currency: 'INR' },
  { id: 'usd', name: 'USD wallet', currency: 'USD' },
]

describe('csv', () => {
  it('quotes cells that need it and guards formulas', () => {
    expect(csvCell('plain')).toBe('plain')
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('line\nbreak')).toBe('"line\nbreak"')
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)")
    expect(csvCell('-12.50', { text: false })).toBe('-12.50')
    expect(unescapeFormula("'=SUM(A1)")).toBe('=SUM(A1)')
    expect(unescapeFormula("'quoted")).toBe("'quoted")
  })

  it('round-trips through parseCsv', () => {
    const text = toCsv(
      ['A', 'B'],
      [
        ['1', 'x, "y"'],
        ['2', 'multi\nline'],
      ],
    )
    expect(parseCsv(text)).toEqual([
      ['A', 'B'],
      ['1', 'x, "y"'],
      ['2', 'multi\nline'],
    ])
  })

  it('handles BOM, LF endings, blank lines and other delimiters', () => {
    expect(parseCsv('\ufeffa,b\n\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';')
    expect(parseCsv('a;"b;c"\n1;2')).toEqual([
      ['a', 'b;c'],
      ['1', '2'],
    ])
    expect(detectDelimiter('a\tb')).toBe('\t')
    expect(detectDelimiter('single')).toBe(',')
  })
})

let seq = 0
function exportTx(partial: Partial<ExportTx>): ExportTx {
  seq += 1
  return {
    id: `t${seq}`,
    type: 'expense',
    amount: 12345,
    currency: 'INR',
    baseAmount: 12345,
    fxRateToBase: 1,
    accountId: 'bank',
    payee: 'Store',
    note: '',
    tags: [],
    date: '2026-10-02T09:15:30.000Z',
    ...partial,
  }
}

const ctx: ImportContext = {
  accounts,
  categories,
  defaultAccountId: 'card',
  baseCurrency: 'INR',
  dateFormat: 'yyyy-MM-dd',
  positiveIs: 'expense',
}

describe('CSV export and re-import', () => {
  const txs: ExportTx[] = [
    exportTx({
      categoryId: 'groceries',
      payee: '=cmd|evil',
      tags: ['home', 'weekly'],
      note: 'a, "b"',
    }),
    exportTx({
      type: 'income',
      amount: 500000,
      baseAmount: 500000,
      categoryId: 'salary',
      payee: 'Employer',
      date: '2026-10-01T04:00:00.000Z',
    }),
    exportTx({
      type: 'transfer',
      amount: 100000,
      baseAmount: 100000,
      toAccountId: 'card',
      payee: '',
      date: '2026-10-03T10:00:00.000Z',
    }),
    exportTx({
      amount: 1050,
      currency: 'USD',
      baseAmount: 87675,
      fxRateToBase: 83.5,
      accountId: 'usd',
      categoryId: 'transport',
      payee: 'Uber',
    }),
  ]
  const text = transactionsToCsv(txs, {
    accounts: new Map(accounts.map((a) => [a.id, a])),
    categories,
    baseCurrency: 'INR',
  })

  it('writes the expected columns, oldest first', () => {
    const rows = parseCsv(text)
    expect(rows[0]).toEqual([...CSV_COLUMNS])
    expect(rows[1]?.slice(2, 8)).toEqual(['income', '5000.00', 'INR', 'HDFC Bank', '', 'Salary'])
    expect(rows[2]?.[7]).toBe('Food › Groceries')
    expect(rows[2]?.[8]).toBe("'=cmd|evil")
    expect(rows[2]?.[10]).toBe('home;weekly')
    expect(rows.find((r) => r[2] === 'transfer')?.slice(5, 7)).toEqual(['HDFC Bank', 'Card'])
  })

  it('imports its own export back to the same values', () => {
    const [header, ...body] = parseCsv(text)
    const mapping = guessMapping(header ?? [])
    expect(mappingProblem(mapping)).toBeNull()
    const result = mapRows(body, mapping, ctx)
    expect(result.every((r) => r.ok)).toBe(true)
    const back = result.flatMap((r) => (r.ok ? [r.tx] : []))
    const original = [...txs].sort((a, b) => (a.date < b.date ? -1 : 1))
    back.forEach((tx, i) => {
      const o = original[i] as ExportTx
      expect(tx).toMatchObject({
        type: o.type,
        amount: o.amount,
        currency: o.currency,
        baseAmount: o.baseAmount,
        fxRateToBase: o.fxRateToBase,
        accountId: o.accountId,
        payee: o.payee,
        note: o.note,
        tags: o.tags,
      })
      expect(tx.categoryId).toBe(o.categoryId)
      expect(tx.toAccountId).toBe(o.toAccountId)
      expect(tx.date).toBe(o.date)
    })
  })

  it('flags every re-imported row as a duplicate of the originals', () => {
    const [header, ...body] = parseCsv(text)
    const back = mapRows(body, guessMapping(header ?? []), ctx).flatMap((r) => (r.ok ? [r.tx] : []))
    expect(findDuplicates(back, txs, TZ).size).toBe(txs.length)
    expect(findDuplicates(back, [], TZ).size).toBe(0)
  })
})

describe('import parsing', () => {
  it('guesses mappings from common headers', () => {
    expect(guessMapping(['Txn Date', 'Narration', 'Withdrawal', 'Deposit'])).toEqual({
      date: 0,
      payee: 1,
      debit: 2,
      credit: 3,
    })
    expect(mappingProblem({ payee: 0 })).toMatch(/date/)
    expect(mappingProblem({ date: 0 })).toMatch(/amount/)
    expect(mappingProblem({ date: 0, amount: 1, debit: 2 })).toMatch(/either/)
    expect(mappingProblem({ date: 0, amount: 0 })).toMatch(/one field/)
  })

  it('reads dates in several formats', () => {
    expect(parseDateCell('2026-10-03', 'yyyy-MM-dd')).toBe('2026-10-03')
    expect(parseDateCell('2026-10-03T10:00:00Z', 'yyyy-MM-dd')).toBe('2026-10-03')
    expect(parseDateCell('3/10/2026', 'dd/MM/yyyy')).toBe('2026-10-03')
    expect(parseDateCell('10/3/2026', 'MM/dd/yyyy')).toBe('2026-10-03')
    expect(parseDateCell('03-10-26', 'dd-MM-yyyy')).toBe('2026-10-03')
    expect(parseDateCell('31/02/2026', 'dd/MM/yyyy')).toBeNull()
    expect(guessDateFormat(['13/01/2026', '02/03/2026'])).toBe('dd/MM/yyyy')
    expect(guessDateFormat(['01/13/2026'])).toBe('MM/dd/yyyy')
    expect(guessDateFormat(['2026-01-13'])).toBe('yyyy-MM-dd')
  })

  it('reads times and builds local instants', () => {
    expect(parseTimeCell('9:05')).toBe('09:05:00')
    expect(parseTimeCell('23:59:59')).toBe('23:59:59')
    expect(parseTimeCell('25:00')).toBeNull()
    const iso = importInstant('2026-10-03', null)
    expect(new Date(iso).getHours()).toBe(12)
  })

  it('reads amounts in bank formats', () => {
    expect(parseAmountCell('1,234.50', 'INR')).toBe(123450)
    expect(parseAmountCell('-12', 'INR')).toBe(-1200)
    expect(parseAmountCell('(12.00)', 'INR')).toBe(-1200)
    expect(parseAmountCell('₹ 99', 'INR')).toBe(9900)
    expect(parseAmountCell('12.50 DR', 'INR')).toBe(-1250)
    expect(parseAmountCell('12.50 Cr', 'INR')).toBe(1250)
    expect(parseAmountCell('', 'INR')).toBeNull()
    expect(() => parseAmountCell('abc', 'INR')).toThrow()
    expect(parseAmountCell('1500', 'JPY')).toBe(1500)
  })

  it('matches categories by path or name, of the right kind', () => {
    expect(matchCategory('Food › Groceries', 'expense', categories)?.id).toBe('groceries')
    expect(matchCategory('food > groceries', 'expense', categories)?.id).toBe('groceries')
    expect(matchCategory('Transport > Groceries', 'expense', categories)?.id).toBe(
      'other-groceries',
    )
    expect(matchCategory('FOOD', 'expense', categories)?.id).toBe('food')
    expect(matchCategory('Salary', 'expense', categories)).toBeUndefined()
    expect(matchCategory('Salary', 'income', categories)?.id).toBe('salary')
  })

  it('uses signs, debit/credit columns and the chosen account', () => {
    const rows = [
      ['2026-10-01', 'Coffee', '120'],
      ['2026-10-02', 'Refund', '-50'],
    ]
    const mapped = mapRows(rows, { date: 0, payee: 1, amount: 2 }, ctx)
    expect(mapped.map((r) => (r.ok ? [r.tx.type, r.tx.amount, r.tx.accountId] : r.error))).toEqual([
      ['expense', 12000, 'card'],
      ['income', 5000, 'card'],
    ])
    const flipped = mapRows(
      rows,
      { date: 0, payee: 1, amount: 2 },
      { ...ctx, positiveIs: 'income' },
    )
    expect(flipped.map((r) => r.ok && r.tx.type)).toEqual(['income', 'expense'])
    const split = mapRows(
      [
        ['01/10/2026', 'Salary', '', '50,000.00'],
        ['02/10/2026', 'Rent', '20,000.00', ''],
      ],
      { date: 0, payee: 1, debit: 2, credit: 3 },
      { ...ctx, dateFormat: 'dd/MM/yyyy' },
    )
    expect(split.map((r) => r.ok && [r.tx.type, r.tx.amount, r.tx.day])).toEqual([
      ['income', 5000000, '2026-10-01'],
      ['expense', 2000000, '2026-10-02'],
    ])
  })

  it('reports row errors with line numbers', () => {
    const rows = [
      ['nope', '1'],
      ['2026-10-01', '0'],
      ['2026-10-01', 'x'],
      ['2026-10-01', '5', 'transfer', ''],
      ['2026-10-01', '5', 'gift'],
    ]
    const result = mapRows(rows, { date: 0, amount: 1, type: 2, toAccount: 3 }, ctx)
    expect(result.map((r) => r.line)).toEqual([2, 3, 4, 5, 6])
    expect(result.every((r) => !r.ok)).toBe(true)
    expect(result.map((r) => (r.ok ? '' : r.error))).toEqual([
      expect.stringMatching(/Date/),
      expect.stringMatching(/empty or zero/),
      expect.stringMatching(/not a number/),
      expect.stringMatching(/To account/),
      expect.stringMatching(/Type/),
    ])
  })

  it('needs a rate for foreign currency rows and checks account currencies', () => {
    const usdNoRate = mapRows(
      [['2026-10-01', '10', 'USD', 'USD wallet']],
      { date: 0, amount: 1, currency: 2, account: 3 },
      ctx,
    )
    expect(usdNoRate[0]?.ok).toBe(false)
    const usdBase = mapRows(
      [['2026-10-01', '10', 'USD', 'USD wallet', '835']],
      { date: 0, amount: 1, currency: 2, account: 3, baseAmount: 4 },
      ctx,
    )
    expect(usdBase[0]?.ok && [usdBase[0].tx.baseAmount, usdBase[0].tx.fxRateToBase]).toEqual([
      83500, 83.5,
    ])
    const wrong = mapRows(
      [['2026-10-01', '10', 'EUR', 'USD wallet', '1.1']],
      { date: 0, amount: 1, currency: 2, account: 3, fxRate: 4 },
      ctx,
    )
    expect(wrong[0]?.ok).toBe(false)
  })

  it('warns about unknown accounts and categories but still imports', () => {
    const [row] = mapRows(
      [['2026-10-01', '10', 'Mystery', 'Nowhere']],
      { date: 0, amount: 1, category: 2, account: 3 },
      ctx,
    )
    expect(row?.ok).toBe(true)
    expect(row?.ok && row.warnings).toHaveLength(2)
    expect(row?.ok && row.tx.accountId).toBe('card')
  })
})

describe('duplicates', () => {
  const candidate = (payee: string, amount = 100, day = '2026-10-01'): ImportedTx => ({
    day,
    date: '',
    type: 'expense',
    amount,
    currency: 'INR',
    fxRateToBase: 1,
    baseAmount: amount,
    accountId: 'bank',
    payee,
    note: '',
    tags: [],
  })
  const existing = [
    { date: '2026-10-01T05:00:00.000Z', amount: 100, currency: 'INR', payee: 'Coffee' },
  ]

  it('matches on day, amount and payee ignoring case and spaces', () => {
    expect([...findDuplicates([candidate(' coffee ')], existing, TZ)]).toEqual([0])
    expect(findDuplicates([candidate('Coffee', 101)], existing, TZ).size).toBe(0)
    expect(findDuplicates([candidate('Coffee', 100, '2026-10-02')], existing, TZ).size).toBe(0)
    expect(findDuplicates([candidate('Tea')], existing, TZ).size).toBe(0)
  })

  it('lets each existing entry match one row only', () => {
    expect([...findDuplicates([candidate('Coffee'), candidate('Coffee')], existing, TZ)]).toEqual([
      0,
    ])
  })

  it('spans the days to check', () => {
    expect(daySpan(['2026-10-05', '2026-09-30'])).toEqual({
      start: '2026-09-30',
      end: '2026-10-06',
    })
    expect(daySpan([])).toBeNull()
  })
})

describe('batching', () => {
  it('caps items and distinct references per batch', () => {
    const items = Array.from({ length: 1000 }, (_, i) => i)
    expect(planBatches(items, () => ['a'], 400).map((b) => b.length)).toEqual([400, 400, 200])
    const refs = planBatches(items.slice(0, 30), (i) => [`c${i}`], 400, 18)
    expect(refs.map((b) => b.length)).toEqual([18, 12])
  })
})

describe('backup format', () => {
  const ts = { seconds: 1, nanoseconds: 0, toDate: () => new Date('2026-10-01T00:00:00.000Z') }

  it('tags timestamps and decodes them back', () => {
    const encoded = encodeValue({ a: ts, b: [ts, 1], c: { d: 'x' }, e: null })
    expect(encoded).toEqual({
      a: { __time: '2026-10-01T00:00:00.000Z' },
      b: [{ __time: '2026-10-01T00:00:00.000Z' }, 1],
      c: { d: 'x' },
      e: null,
    })
    expect(decodeValue(encoded, (iso) => `T(${iso})`)).toEqual({
      a: 'T(2026-10-01T00:00:00.000Z)',
      b: ['T(2026-10-01T00:00:00.000Z)', 1],
      c: { d: 'x' },
      e: null,
    })
  })

  const time = { __time: '2026-10-01T00:00:00.000Z' }
  const stamps = { createdAt: time, updatedAt: time, createdBy: 'alice' }
  const valid = () => ({
    app: 'ledgerly',
    kind: 'backup',
    version: 1,
    exportedAt: '2026-10-03T00:00:00.000Z',
    uid: 'alice',
    user: { settings: { baseCurrency: 'INR', locale: 'en-IN' } },
    collections: {
      accounts: {
        bank: {
          name: 'Bank',
          type: 'bank',
          currency: 'INR',
          openingBalance: 0,
          txTotal: -100,
          color: '#2563eb',
          icon: 'landmark',
          archived: false,
          ...stamps,
        },
      },
      categories: {
        food: {
          name: 'Food',
          kind: 'expense',
          icon: 'tag',
          color: '#2563eb',
          order: 0,
          archived: false,
          ...stamps,
        },
        groceries: {
          name: 'Groceries',
          kind: 'expense',
          icon: 'tag',
          color: '#2563eb',
          parentId: 'food',
          order: 0,
          archived: false,
          ...stamps,
        },
      },
      transactions: {
        t1: {
          type: 'expense',
          amount: 100,
          currency: 'INR',
          fxRateToBase: 1,
          baseAmount: 100,
          accountId: 'bank',
          categoryId: 'groceries',
          tags: [],
          payee: '',
          note: '',
          date: time,
          attachments: [],
          ...stamps,
        },
      },
      budgets: {},
      recurring: {},
      notifications: {},
    },
    groups: [],
  })

  it('accepts a valid backup and counts documents', () => {
    const check = parseBackup(JSON.stringify(valid()))
    expect(check.ok && check.counts).toEqual({
      categories: 2,
      accounts: 1,
      budgets: 0,
      transactions: 1,
      recurring: 0,
    })
  })

  it('rejects files that are not backups or have broken references', () => {
    expect(parseBackup('nope')).toMatchObject({ ok: false, error: expect.stringMatching(/JSON/) })
    expect(parseBackup('{}')).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Ledgerly backup/),
    })
    const newer = { ...valid(), version: 99 }
    expect(parseBackup(JSON.stringify(newer))).toMatchObject({
      ok: false,
      error: expect.stringMatching(/newer/),
    })
    const badTx = valid()
    ;(badTx.collections.transactions.t1 as Record<string, unknown>).accountId = 'missing'
    expect(parseBackup(JSON.stringify(badTx))).toMatchObject({
      ok: false,
      error: expect.stringMatching(/missing account/),
    })
    const badAmount = valid()
    ;(badAmount.collections.transactions.t1 as Record<string, unknown>).amount = 1.5
    expect(parseBackup(JSON.stringify(badAmount))).toMatchObject({
      ok: false,
      error: expect.stringMatching(/unexpected data/),
    })
    const orphan = valid()
    ;(orphan.collections.categories.groceries as Record<string, unknown>).parentId = 'gone'
    expect(parseBackup(JSON.stringify(orphan))).toMatchObject({
      ok: false,
      error: expect.stringMatching(/parent/),
    })
  })

  it('keeps only restorable fields and writes parents first', () => {
    expect(pickFields('accounts', { name: 'A', txTotal: 5, evil: true, createdBy: 'x' })).toEqual({
      name: 'A',
    })
    expect(categoryWriteOrder({ c: { parentId: 'p' }, p: {} })).toEqual(['p', 'c'])
  })

  it('labels categories with their parent', () => {
    const byId = new Map(categories.map((c) => [c.id, c]))
    expect(categoryLabel('groceries', byId)).toBe('Food › Groceries')
    expect(categoryLabel('food', byId)).toBe('Food')
    expect(categoryLabel(undefined, byId)).toBe('')
  })
})
