import type { ReportCategory, ReportTx, Totals } from '@/features/reports/types'
import { categorySpend, monthLabel, totals } from '@/features/reports/utils'
import { calendarDate, formatCalendarDate } from '@/utils/dates'
import { formatMoney } from '@/utils/money'
import { categoryLabel } from './csvExport'

/**
 * The monthly statement. `statementData` is pure (and tested): it works out every number and
 * string. `renderStatementPdf` only lays them out with jsPDF, loaded on demand so it stays out
 * of the main bundle.
 */

export interface StatementInput {
  /** yyyy-MM */
  month: string
  /** The month's transactions (any order). */
  transactions: readonly ReportTx[]
  accounts: ReadonlyMap<string, { name: string }>
  categories: readonly ReportCategory[]
  baseCurrency: string
  locale?: string
  name: string
  email: string
  timeZone?: string
  generatedAt?: Date
}

export interface StatementRow {
  date: string
  description: string
  category: string
  account: string
  /** Signed base-currency minor units: income +, expense −. */
  amount: number
}

export interface StatementCategoryRow {
  name: string
  amount: number
  /** 0–1 */
  share: number
  /** Subcategory rows are indented under their parent. */
  sub: boolean
}

export interface StatementData {
  title: string
  period: string
  holder: string
  generated: string
  baseCurrency: string
  totals: Totals
  transferCount: number
  spending: StatementCategoryRow[]
  income: StatementCategoryRow[]
  rows: StatementRow[]
}

export function statementData(input: StatementInput): StatementData {
  const { transactions, categories, timeZone } = input
  const counted = transactions.filter((t) => t.type !== 'transfer')
  const byId = new Map(categories.map((c) => [c.id, c]))

  const breakdown = (kind: 'expense' | 'income'): StatementCategoryRow[] => {
    // categorySpend reads expenses; treat income as "expenses" of income categories here.
    const txs = counted
      .filter((t) => t.type === kind)
      .map((t) => ({ ...t, type: 'expense' as const }))
    const total = txs.reduce((s, t) => s + t.baseAmount, 0)
    return categorySpend(txs, categories).flatMap((top) => {
      const rows: StatementCategoryRow[] = [
        { name: top.name, amount: top.amount, share: top.share, sub: false },
      ]
      if (top.hasChildren) {
        for (const child of categorySpend(txs, categories, top.id)) {
          if (child.isParentSelf && child.amount === top.amount) continue
          rows.push({
            name: child.isParentSelf ? 'Not in a subcategory' : child.name,
            amount: child.amount,
            share: total > 0 ? child.amount / total : 0,
            sub: true,
          })
        }
      }
      return rows
    })
  }

  const rows = [...counted]
    .sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date < b.date ? -1 : 1))
    .map((t): StatementRow => {
      const label = categoryLabel(t.categoryId, byId) || 'Uncategorised'
      const foreign =
        t.currency !== input.baseCurrency
          ? ` (${formatMoney(t.amount, t.currency, input.locale, { currencyDisplay: 'code' })})`
          : ''
      return {
        date: formatCalendarDate(calendarDate(t.date, timeZone), input.locale, {
          day: '2-digit',
          month: 'short',
        }),
        description: `${t.payee || t.note || (t.type === 'income' ? 'Income' : 'Expense')}${foreign}`,
        category: label,
        account: input.accounts.get(t.accountId)?.name ?? '',
        amount: t.type === 'income' ? t.baseAmount : -t.baseAmount,
      }
    })

  return {
    title: 'Ledgerly statement',
    period: monthLabel(input.month, input.locale, true),
    holder: [input.name, input.email].filter(Boolean).join(' · '),
    generated: new Intl.DateTimeFormat(input.locale, { dateStyle: 'medium' }).format(
      input.generatedAt ?? new Date(),
    ),
    baseCurrency: input.baseCurrency,
    totals: totals(counted),
    transferCount: transactions.length - counted.length,
    spending: breakdown('expense'),
    income: breakdown('income'),
    rows,
  }
}

/**
 * The standard PDF fonts only cover Latin-1, so other characters (₹, ›, emoji, non-Latin
 * scripts) are replaced: currency amounts use ISO codes and "›" becomes ">".
 */
export function pdfText(text: string): string {
  return text
    .replace(/›/g, '>')
    .replace(/[‒-―−]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[\u202f\u2009\u00a0]/g, ' ')
    .replace(/[^\x20-\x7e\xa0-\xff]/g, '?')
}

export function pdfMoney(amount: number, currency: string, locale?: string): string {
  return pdfText(formatMoney(amount, currency, locale, { currencyDisplay: 'code' }))
}

export function statementFileName(month: string): string {
  return `ledgerly-statement-${month}.pdf`
}

export async function renderStatementPdf(data: StatementData, locale?: string): Promise<Blob> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const money = (v: number) => pdfMoney(v, data.baseCurrency, locale)
  const pct = (v: number) =>
    new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(v)
  const margin = 40
  const head = { fillColor: [38, 110, 105] as [number, number, number], textColor: 255 }
  let y = margin

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text(pdfText(data.title), margin, y + 10)
  doc.setFontSize(12)
  doc.text(pdfText(data.period), margin, y + 30)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(90)
  doc.text(pdfText(data.holder), margin, y + 46)
  doc.text(pdfText(`Amounts in ${data.baseCurrency}. Generated ${data.generated}.`), margin, y + 58)
  doc.setTextColor(0)
  y += 74

  const after = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY

  autoTable(doc, {
    startY: y,
    head: [['Summary', '']],
    body: [
      ['Income', money(data.totals.income)],
      ['Spending', money(data.totals.expense)],
      ['Net', money(data.totals.net)],
      ['Income and spending transactions', String(data.totals.count)],
      ...(data.transferCount > 0
        ? [['Transfers between accounts (not counted)', String(data.transferCount)]]
        : []),
    ],
    theme: 'grid',
    headStyles: head,
    columnStyles: { 1: { halign: 'right' } },
    margin: { left: margin, right: margin },
    tableWidth: 300,
  })
  y = after() + 20

  const breakdown = (title: string, rows: StatementCategoryRow[], total: number) => {
    if (rows.length === 0) return
    autoTable(doc, {
      startY: y,
      head: [[title, 'Amount', 'Share']],
      body: rows.map((r) => [
        pdfText(r.sub ? `    ${r.name}` : r.name),
        money(r.amount),
        pct(r.share),
      ]),
      foot: [['Total', money(total), rows.length ? pct(1) : '']],
      theme: 'striped',
      headStyles: head,
      footStyles: { fillColor: [235, 235, 235], textColor: 20 },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
      didParseCell: (cell) => {
        const row = rows[cell.row.index]
        if (cell.section === 'body' && row && !row.sub) cell.cell.styles.fontStyle = 'bold'
      },
      margin: { left: margin, right: margin },
    })
    y = after() + 20
  }
  breakdown('Spending by category', data.spending, data.totals.expense)
  breakdown('Income by category', data.income, data.totals.income)

  autoTable(doc, {
    startY: y,
    head: [['Date', 'Description', 'Category', 'Account', 'Amount']],
    body: data.rows.map((r) => [
      pdfText(r.date),
      pdfText(r.description),
      pdfText(r.category),
      pdfText(r.account),
      money(r.amount),
    ]),
    foot: [['', '', '', 'Net', money(data.totals.net)]],
    showFoot: 'lastPage',
    theme: 'striped',
    headStyles: head,
    footStyles: { fillColor: [235, 235, 235], textColor: 20 },
    styles: { fontSize: 8, cellPadding: 3 },
    columnStyles: { 0: { cellWidth: 48 }, 4: { halign: 'right', cellWidth: 90 } },
    margin: { left: margin, right: margin, bottom: 40 },
  })

  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(120)
    doc.text(
      `Page ${i} of ${pages}`,
      doc.internal.pageSize.getWidth() - margin,
      doc.internal.pageSize.getHeight() - 20,
      { align: 'right' },
    )
  }
  return doc.output('blob')
}
