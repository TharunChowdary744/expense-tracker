import { describe, expect, it } from 'vitest'
import type { ReportCategory, ReportTx } from '@/features/reports/types'
import { pdfMoney, pdfText, renderStatementPdf, statementData } from './pdf'

const cat = (
  id: string,
  name: string,
  parentId: string | null = null,
  kind: 'expense' | 'income' = 'expense',
): ReportCategory => ({
  id,
  name,
  kind,
  parentId,
  color: '#000000',
  order: 0,
})
const categories = [
  cat('food', 'Food'),
  cat('groceries', 'Groceries', 'food'),
  cat('rent', 'Rent'),
  cat('salary', 'Salary', null, 'income'),
]

let n = 0
const tx = (p: Partial<ReportTx> & Pick<ReportTx, 'type' | 'baseAmount'>): ReportTx => ({
  id: `t${++n}`,
  amount: p.baseAmount,
  currency: 'INR',
  accountId: 'bank',
  payee: '',
  note: '',
  tags: [],
  date: '2026-09-10T06:00:00.000Z',
  ...p,
})

const txs = [
  tx({ type: 'income', baseAmount: 10000000, categoryId: 'salary', payee: 'Employer' }),
  tx({
    type: 'expense',
    baseAmount: 2500000,
    categoryId: 'rent',
    payee: 'Landlord',
    date: '2026-09-01T06:00:00.000Z',
  }),
  tx({ type: 'expense', baseAmount: 300000, categoryId: 'groceries', payee: 'BigBasket ›' }),
  tx({ type: 'expense', baseAmount: 100000, categoryId: 'food', payee: 'Cafe' }),
  tx({ type: 'expense', baseAmount: 87675, amount: 1050, currency: 'USD', payee: 'Uber' }),
  tx({ type: 'transfer', baseAmount: 500000, toAccountId: 'card' }),
]

const data = statementData({
  month: '2026-09',
  transactions: txs,
  accounts: new Map([['bank', { name: 'Bank' }]]),
  categories,
  baseCurrency: 'INR',
  locale: 'en-IN',
  name: 'Asha',
  email: 'asha@example.com',
  timeZone: 'Asia/Kolkata',
  generatedAt: new Date('2026-10-03T00:00:00Z'),
})

describe('statementData', () => {
  it('totals income and spending without transfers', () => {
    expect(data.totals).toEqual({ income: 10000000, expense: 2987675, net: 7012325, count: 5 })
    expect(data.transferCount).toBe(1)
    expect(data.period).toBe('September 2026')
    expect(data.holder).toBe('Asha · asha@example.com')
  })

  it('breaks spending down by category with subcategories', () => {
    expect(data.spending.map((r) => [r.name, r.amount, r.sub])).toEqual([
      ['Rent', 2500000, false],
      ['Food', 400000, false],
      ['Groceries', 300000, true],
      ['Not in a subcategory', 100000, true],
      ['Uncategorised', 87675, false],
    ])
    const topLevel = data.spending.filter((r) => !r.sub).reduce((s, r) => s + r.amount, 0)
    expect(topLevel).toBe(data.totals.expense)
    expect(data.income).toEqual([{ name: 'Salary', amount: 10000000, share: 1, sub: false }])
  })

  it('lists transactions oldest first with signed amounts that add up to the net', () => {
    expect(data.rows[0]?.description).toBe('Landlord')
    expect(data.rows.reduce((s, r) => s + r.amount, 0)).toBe(data.totals.net)
    expect(data.rows.find((r) => r.description.startsWith('Uber'))?.description).toMatch(
      /^Uber \(USD\s10\.50\)$/,
    )
    expect(data.rows).toHaveLength(5)
  })
})

describe('PDF text', () => {
  it('keeps to characters the standard fonts can draw', () => {
    expect(pdfText('Food › Groceries – ₹ “x”')).toBe('Food > Groceries - ? "x"')
    expect(pdfMoney(123456, 'INR', 'en-IN')).toBe('INR 1,234.56')
  })

  it('renders a PDF', async () => {
    const blob = await renderStatementPdf(data, 'en-IN')
    const head = new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer()).slice(0, 5))
    expect(head).toBe('%PDF-')
    expect(blob.size).toBeGreaterThan(2000)
  })
})
