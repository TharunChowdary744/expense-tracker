import type { StatementData } from '@/features/data/pdf'
import { escapeHtml, statementHtml } from './statement'

const data: StatementData = {
  title: 'Ledgerly statement',
  period: 'September 2026',
  holder: 'Asha <asha@example.com>',
  generated: '6 Oct 2026',
  baseCurrency: 'INR',
  totals: { income: 5000000, expense: 1234500, net: 3765500, count: 3 },
  transferCount: 1,
  spending: [
    { name: 'Food', amount: 1234500, share: 1, sub: false },
    { name: 'Groceries', amount: 1000000, share: 0.81, sub: true },
  ],
  income: [],
  rows: [
    {
      date: '01 Sep',
      description: 'Café & bar',
      category: 'Food',
      account: 'Cash',
      amount: -1234500,
    },
  ],
}

describe('statementHtml', () => {
  it('escapes text from the user', () => {
    expect(escapeHtml(`<b>"Tom" & 'Jerry'</b>`)).toBe(
      '&lt;b&gt;&quot;Tom&quot; &amp; &#39;Jerry&#39;&lt;/b&gt;',
    )
    const html = statementHtml(data, 'en-IN')
    expect(html).toContain('Asha &lt;asha@example.com&gt;')
    expect(html).toContain('Café &amp; bar')
    expect(html).not.toContain('<asha@')
  })

  it('has the summary, the breakdown and every transaction', () => {
    const html = statementHtml(data, 'en-IN')
    expect(html).toContain('September 2026')
    expect(html).toContain('Transfers between accounts (not counted)')
    expect(html).toContain('Spending by category')
    expect(html).not.toContain('Income by category')
    expect(html).toContain('class="sub"')
    expect(html).toMatch(/12,345\.00/)
  })
})
