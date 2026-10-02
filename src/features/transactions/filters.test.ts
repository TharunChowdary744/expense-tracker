import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FILTERS,
  activeFilterCount,
  buildQuery,
  filtersToParams,
  hasClientFilters,
  matchesQuery,
  parseFilters,
  resolveRange,
  serverPlan,
  type TxFilters,
} from './filters'
import type { Transaction } from './types'

const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: 't1',
  type: 'expense',
  amount: 25000,
  currency: 'INR',
  fxRateToBase: 1,
  baseAmount: 25000,
  accountId: 'cash',
  categoryId: 'food',
  tags: ['trip'],
  payee: 'Swiggy',
  note: 'Dinner with friends',
  date: '2026-10-02T10:00:00.000Z',
  attachments: [],
  createdAt: '2026-10-02T10:00:00.000Z',
  updatedAt: '2026-10-02T10:00:00.000Z',
  createdBy: 'u1',
  pending: false,
  ...over,
})

describe('URL round trip', () => {
  it('serialises only non-defaults and parses back the same filters', () => {
    expect(filtersToParams(DEFAULT_FILTERS).toString()).toBe('')
    const filters: TxFilters = {
      search: 'coffee',
      range: 'custom',
      from: '2026-09-01',
      to: '2026-09-30',
      type: 'expense',
      accountIds: ['a1', 'a2'],
      categoryIds: ['c1'],
      tags: ['trip'],
      min: '100',
      max: '500.5',
      sort: 'amount-desc',
    }
    const params = filtersToParams(filters)
    expect(params.toString()).toBe(
      'q=coffee&range=custom&from=2026-09-01&to=2026-09-30&type=expense&acc=a1%2Ca2&cat=c1&tag=trip&min=100&max=500.5&sort=amount-desc',
    )
    expect(parseFilters(params)).toEqual(filters)
  })

  it('ignores malformed values', () => {
    const parsed = parseFilters(
      new URLSearchParams(
        'range=forever&type=refund&from=2026-13-40&min=-5&max=abc&sort=x&acc=,a,,a',
      ),
    )
    expect(parsed).toEqual({ ...DEFAULT_FILTERS, accountIds: ['a'] })
  })

  it('drops custom dates when the range is a preset', () => {
    expect(
      filtersToParams({ ...DEFAULT_FILTERS, range: 'this-month', from: '2026-01-01' }).toString(),
    ).toBe('range=this-month')
  })

  it('counts active filters, not search or sort', () => {
    expect(activeFilterCount({ ...DEFAULT_FILTERS, search: 'x', sort: 'date-asc' })).toBe(0)
    expect(activeFilterCount({ ...DEFAULT_FILTERS, type: 'income', min: '5', tags: ['a'] })).toBe(3)
  })
})

describe('resolveRange', () => {
  const now = new Date(2026, 9, 15, 13, 0)
  const local = (y: number, m: number, d: number) => new Date(y, m, d).toISOString()

  it('resolves presets relative to now (end exclusive)', () => {
    expect(resolveRange({ range: 'this-month', from: '', to: '' }, now)).toEqual({
      start: local(2026, 9, 1),
      end: local(2026, 9, 16),
    })
    expect(resolveRange({ range: 'last-month', from: '', to: '' }, now)).toEqual({
      start: local(2026, 8, 1),
      end: local(2026, 9, 1),
    })
    expect(resolveRange({ range: 'last-30-days', from: '', to: '' }, now).start).toBe(
      local(2026, 8, 16),
    )
    expect(resolveRange({ range: 'this-year', from: '', to: '' }, now).start).toBe(
      local(2026, 0, 1),
    )
    expect(resolveRange({ range: 'all', from: '', to: '' }, now)).toEqual({
      start: null,
      end: null,
    })
  })

  it('makes custom ranges inclusive of the end day', () => {
    expect(resolveRange({ range: 'custom', from: '2026-09-01', to: '2026-09-30' })).toEqual({
      start: local(2026, 8, 1),
      end: local(2026, 9, 1),
    })
    expect(resolveRange({ range: 'custom', from: '', to: '2026-09-30' }).start).toBeNull()
  })
})

describe('queries', () => {
  it('expands categories and converts amounts to base minor units', () => {
    const q = buildQuery(
      { ...DEFAULT_FILTERS, categoryIds: ['food'], min: '100', max: '250.50', search: ' Swig ' },
      'INR',
      (id) => (id === 'food' ? ['food', 'groceries'] : [id]),
    )
    expect(q.categoryIds).toEqual(['food', 'groceries'])
    expect(q.minBase).toBe(10000)
    expect(q.maxBase).toBe(25050)
    expect(q.search).toBe('swig')
  })

  it('sends type, sort and date range to Firestore; amount sorts filter dates locally', () => {
    const byDate = buildQuery({ ...DEFAULT_FILTERS, type: 'expense', range: 'this-year' }, 'INR')
    expect(serverPlan(byDate)).toMatchObject({ field: 'date', direction: 'desc', type: 'expense' })
    expect(serverPlan(byDate).start).not.toBeNull()
    expect(hasClientFilters(byDate)).toBe(false)

    const byAmount = { ...byDate, sort: 'amount-asc' as const }
    expect(serverPlan(byAmount)).toMatchObject({
      field: 'baseAmount',
      direction: 'asc',
      start: null,
    })
    expect(hasClientFilters(byAmount)).toBe(true)
  })

  it('combines every filter', () => {
    const base = buildQuery(DEFAULT_FILTERS, 'INR')
    expect(matchesQuery(tx(), base)).toBe(true)
    const all = buildQuery(
      {
        ...DEFAULT_FILTERS,
        search: 'friends',
        type: 'expense',
        accountIds: ['cash'],
        categoryIds: ['food'],
        tags: ['trip', 'work'],
        min: '200',
        max: '300',
        range: 'custom',
        from: '2026-10-01',
        to: '2026-10-03',
      },
      'INR',
    )
    expect(matchesQuery(tx(), all)).toBe(true)
    expect(matchesQuery(tx({ note: 'alone' }), all)).toBe(false)
    expect(matchesQuery(tx({ type: 'income' }), all)).toBe(false)
    expect(matchesQuery(tx({ accountId: 'bank' }), all)).toBe(false)
    expect(matchesQuery(tx({ categoryId: undefined }), all)).toBe(false)
    expect(matchesQuery(tx({ tags: [] }), all)).toBe(false)
    expect(matchesQuery(tx({ baseAmount: 19999 }), all)).toBe(false)
    expect(matchesQuery(tx({ baseAmount: 30001 }), all)).toBe(false)
    expect(matchesQuery(tx({ date: '2026-09-20T10:00:00.000Z' }), all)).toBe(false)
  })

  it('matches transfers by either account', () => {
    const q = buildQuery({ ...DEFAULT_FILTERS, accountIds: ['bank'] }, 'INR')
    expect(matchesQuery(tx({ type: 'transfer', toAccountId: 'bank' }), q)).toBe(true)
  })
})
