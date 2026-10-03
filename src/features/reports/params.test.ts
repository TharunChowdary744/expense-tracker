import { describe, expect, it } from 'vitest'
import { parseReportSearch, reportSearchParams, transactionsLink } from './params'

describe('report search params', () => {
  it('round-trips through the URL', () => {
    const search = {
      preset: 'custom' as const,
      from: '2026-09-01',
      to: '2026-09-30',
      accountIds: ['a1', 'a2'],
      parentId: 'food',
      sliceId: 'groceries',
    }
    const params = reportSearchParams(search)
    expect(params.toString()).toBe(
      'range=custom&from=2026-09-01&to=2026-09-30&acc=a1%2Ca2&cat=food&slice=groceries',
    )
    expect(parseReportSearch(params)).toEqual(search)
  })

  it('defaults to this month and drops malformed values', () => {
    expect(parseReportSearch(new URLSearchParams('range=bogus&from=2026-13-01&cat=a/b'))).toEqual({
      preset: 'this-month',
      from: '',
      to: '',
      accountIds: [],
      parentId: null,
      sliceId: null,
    })
    expect(parseReportSearch(new URLSearchParams('range=this-year'), ['this-month']).preset).toBe(
      'this-month',
    )
    expect(reportSearchParams(parseReportSearch(new URLSearchParams())).toString()).toBe('')
  })

  it('links to the same range on the Transactions page', () => {
    const range = { start: '2026-10-01', end: '2026-10-04' }
    expect(transactionsLink(range, { preset: 'this-month', type: 'expense' })).toBe(
      '/transactions?range=this-month&type=expense',
    )
    expect(
      transactionsLink({ start: '2026-08-01', end: '2026-10-04' }, { accountIds: ['a'] }),
    ).toBe('/transactions?range=custom&from=2026-08-01&to=2026-10-03&acc=a')
  })
})
