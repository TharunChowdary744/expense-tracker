import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import { File, Paths } from 'expo-file-system'
import {
  statementFileName,
  type StatementCategoryRow,
  type StatementData,
} from '@/features/data/pdf'
import { formatMoney } from '@/utils/money'

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * The monthly statement as a printable HTML page: the same sections as the web app's jsPDF
 * statement (summary, spending and income by category, every transaction). expo-print turns
 * it into a PDF, and HTML keeps every currency symbol and script that the PDF fonts lacked.
 */
export function statementHtml(data: StatementData, locale?: string): string {
  const e = escapeHtml
  const money = (v: number) => e(formatMoney(v, data.baseCurrency, locale))
  const pct = (v: number) =>
    e(new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(v))

  const breakdown = (title: string, rows: StatementCategoryRow[], total: number) =>
    rows.length === 0
      ? ''
      : `<table>
  <thead><tr><th>${e(title)}</th><th class="num">Amount</th><th class="num">Share</th></tr></thead>
  <tbody>${rows
    .map(
      (r) =>
        `<tr class="${r.sub ? 'sub' : 'top'}"><td>${e(r.name)}</td><td class="num">${money(r.amount)}</td><td class="num">${pct(r.share)}</td></tr>`,
    )
    .join('')}</tbody>
  <tfoot><tr><td>Total</td><td class="num">${money(total)}</td><td class="num">${pct(1)}</td></tr></tfoot>
</table>`

  const summary: [string, string][] = [
    ['Income', money(data.totals.income)],
    ['Spending', money(data.totals.expense)],
    ['Net', money(data.totals.net)],
    ['Income and spending transactions', String(data.totals.count)],
    ...(data.transferCount > 0
      ? ([['Transfers between accounts (not counted)', String(data.transferCount)]] as [
          string,
          string,
        ][])
      : []),
  ]

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<style>
  @page { margin: 40px; }
  body { font-family: -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif; font-size: 11px; color: #111; }
  h1 { font-size: 20px; margin: 0; }
  h2 { font-size: 14px; margin: 4px 0 2px; }
  .meta { color: #555; margin: 2px 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 18px; page-break-inside: auto; }
  tr { page-break-inside: avoid; }
  th { background: #266e69; color: #fff; text-align: left; padding: 5px 6px; }
  td { padding: 4px 6px; border-bottom: 1px solid #e5e5e5; }
  tfoot td { background: #ebebeb; font-weight: 600; }
  .num { text-align: right; white-space: nowrap; }
  .top td { font-weight: 600; }
  .sub td:first-child { padding-left: 22px; }
  .summary { width: 320px; }
  .tx td { font-size: 10px; }
</style></head>
<body>
  <h1>${e(data.title)}</h1>
  <h2>${e(data.period)}</h2>
  <p class="meta">${e(data.holder)}</p>
  <p class="meta">Amounts in ${e(data.baseCurrency)}. Generated ${e(data.generated)}.</p>
  <table class="summary">
    <thead><tr><th>Summary</th><th></th></tr></thead>
    <tbody>${summary.map(([k, v]) => `<tr><td>${e(k)}</td><td class="num">${v}</td></tr>`).join('')}</tbody>
  </table>
  ${breakdown('Spending by category', data.spending, data.totals.expense)}
  ${breakdown('Income by category', data.income, data.totals.income)}
  <table class="tx">
    <thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Account</th><th class="num">Amount</th></tr></thead>
    <tbody>${data.rows
      .map(
        (r) =>
          `<tr><td>${e(r.date)}</td><td>${e(r.description)}</td><td>${e(r.category)}</td><td>${e(r.account)}</td><td class="num">${money(r.amount)}</td></tr>`,
      )
      .join('')}</tbody>
    <tfoot><tr><td></td><td></td><td></td><td>Net</td><td class="num">${money(data.totals.net)}</td></tr></tfoot>
  </table>
</body></html>`
}

/** Renders the statement to a PDF and opens the share sheet to save or send it. */
export async function shareStatementPdf(data: StatementData, month: string, locale?: string) {
  const { uri } = await Print.printToFileAsync({ html: statementHtml(data, locale) })
  // Give the file a readable name before sharing it.
  const printed = new File(uri)
  const named = new File(Paths.cache, statementFileName(month))
  if (named.exists) named.delete()
  printed.move(named)
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(named.uri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: named.name,
    })
  }
  return named.uri
}
