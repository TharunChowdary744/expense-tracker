import { describe, expect, it } from 'vitest'
import {
  groupDebts,
  netBalances,
  owedSummary,
  pairwiseDebts,
  simplifyDebts,
  type BalanceExpense,
  type BalanceSettlement,
  type Debt,
} from './balances'

const sum = (values: Iterable<number>) => [...values].reduce((a, b) => a + b, 0)

/** Applies debts as payments to balances; everyone should end at zero. */
function settle(balances: Map<string, number>, debts: Debt[]): Map<string, number> {
  const left = new Map(balances)
  for (const d of debts) {
    left.set(d.from, (left.get(d.from) ?? 0) + d.amount)
    left.set(d.to, (left.get(d.to) ?? 0) - d.amount)
  }
  return left
}

// A paid 1,000.00 split equally between A, B and C.
const dinner: BalanceExpense = {
  paidBy: { a: 100000 },
  shares: { a: 33334, b: 33333, c: 33333 },
}

describe('netBalances', () => {
  it('is paid minus shares', () => {
    expect(netBalances([dinner], [])).toEqual(
      new Map([
        ['a', 66666],
        ['b', -33333],
        ['c', -33333],
      ]),
    )
  })

  it('applies settlements: paying reduces what you owe', () => {
    const net = netBalances([dinner], [{ fromUid: 'b', toUid: 'a', amount: 20000 }])
    expect(net.get('a')).toBe(46666)
    expect(net.get('b')).toBe(-13333)
    expect(net.get('c')).toBe(-33333)
  })

  it('includes listed members with no activity at zero', () => {
    expect(netBalances([], [], ['a', 'b'])).toEqual(
      new Map([
        ['a', 0],
        ['b', 0],
      ]),
    )
  })

  it('always sums to zero', () => {
    const expenses: BalanceExpense[] = [
      dinner,
      { paidBy: { b: 4500, c: 5501 }, shares: { a: 3334, b: 3334, c: 3333 } },
      { paidBy: { c: 777 }, shares: { a: 777 } },
    ]
    expect(sum(netBalances(expenses, [{ fromUid: 'a', toUid: 'c', amount: 10 }]).values())).toBe(0)
  })
})

describe('pairwiseDebts', () => {
  it('has each sharer owing the payer', () => {
    expect(pairwiseDebts([dinner], [])).toEqual([
      { from: 'b', to: 'a', amount: 33333 },
      { from: 'c', to: 'a', amount: 33333 },
    ])
  })

  it('cancels opposite debts between the same two people', () => {
    const debts = pairwiseDebts(
      [
        { paidBy: { a: 1000 }, shares: { b: 1000 } },
        { paidBy: { b: 300 }, shares: { a: 300 } },
      ],
      [],
    )
    expect(debts).toEqual([{ from: 'b', to: 'a', amount: 700 }])
  })

  it('matches debtors to several payers exactly', () => {
    const expense: BalanceExpense = {
      paidBy: { a: 600, b: 400 },
      shares: { a: 250, b: 250, c: 250, d: 250 },
    }
    const debts = pairwiseDebts([expense], [])
    const net = netBalances([expense], [])
    expect([...settle(net, debts).values()].every((v) => v === 0)).toBe(true)
  })

  it('reduces a debt by a partial settlement and flips an overpayment', () => {
    const partial: BalanceSettlement[] = [{ fromUid: 'b', toUid: 'a', amount: 20000 }]
    expect(pairwiseDebts([dinner], partial)).toContainEqual({ from: 'b', to: 'a', amount: 13333 })
    const over: BalanceSettlement[] = [{ fromUid: 'b', toUid: 'a', amount: 40000 }]
    expect(pairwiseDebts([dinner], over)).toContainEqual({ from: 'a', to: 'b', amount: 6667 })
  })

  it('drops pairs that are fully settled', () => {
    const debts = pairwiseDebts([dinner], [{ fromUid: 'b', toUid: 'a', amount: 33333 }])
    expect(debts).toEqual([{ from: 'c', to: 'a', amount: 33333 }])
  })

  it('agrees with net balances', () => {
    const expenses: BalanceExpense[] = [
      dinner,
      { paidBy: { b: 30000 }, shares: { a: 10000, b: 10000, c: 10000 } },
      { paidBy: { c: 9001, a: 999 }, shares: { a: 3334, b: 3333, c: 3333 } },
    ]
    const settlements: BalanceSettlement[] = [{ fromUid: 'c', toUid: 'a', amount: 5000 }]
    const left = settle(netBalances(expenses, settlements), pairwiseDebts(expenses, settlements))
    expect([...left.values()].every((v) => v === 0)).toBe(true)
  })
})

describe('simplifyDebts', () => {
  it('turns a chain A→B→C into one payment', () => {
    const expenses: BalanceExpense[] = [
      { paidBy: { b: 100 }, shares: { a: 100 } },
      { paidBy: { c: 100 }, shares: { b: 100 } },
    ]
    expect(pairwiseDebts(expenses, [])).toHaveLength(2)
    expect(simplifyDebts(netBalances(expenses, []))).toEqual([{ from: 'a', to: 'c', amount: 100 }])
  })

  it('needs at most n − 1 payments and settles everyone', () => {
    const expenses: BalanceExpense[] = [
      { paidBy: { a: 120000 }, shares: { a: 30000, b: 30000, c: 30000, d: 30000 } },
      { paidBy: { b: 80000 }, shares: { a: 20000, b: 20000, c: 20000, d: 20000 } },
      { paidBy: { c: 40000 }, shares: { a: 10000, b: 10000, c: 10000, d: 10000 } },
      { paidBy: { d: 4000 }, shares: { a: 1000, b: 1000, c: 1000, d: 1000 } },
    ]
    const net = netBalances(expenses, [])
    const simplified = simplifyDebts(net)
    expect(simplified.length).toBeLessThanOrEqual(3)
    expect(simplified.length).toBeLessThan(pairwiseDebts(expenses, []).length)
    expect([...settle(net, simplified).values()].every((v) => v === 0)).toBe(true)
  })

  it('largest debtor pays largest creditor first, ties by uid', () => {
    const net = new Map([
      ['a', 500],
      ['b', 500],
      ['c', -600],
      ['d', -400],
    ])
    expect(simplifyDebts(net)).toEqual([
      { from: 'c', to: 'a', amount: 500 },
      { from: 'd', to: 'b', amount: 400 },
      { from: 'c', to: 'b', amount: 100 },
    ])
  })

  it('is empty when everyone is square', () => {
    expect(simplifyDebts(new Map([['a', 0]]))).toEqual([])
  })

  it('rejects balances that do not sum to zero', () => {
    expect(() => simplifyDebts(new Map([['a', 1]]))).toThrow(RangeError)
  })
})

describe('groupDebts', () => {
  it('follows the simplify setting', () => {
    const expenses: BalanceExpense[] = [
      { paidBy: { b: 100 }, shares: { a: 100 } },
      { paidBy: { c: 100 }, shares: { b: 100 } },
    ]
    expect(groupDebts(expenses, [], false)).toHaveLength(2)
    expect(groupDebts(expenses, [], true)).toHaveLength(1)
  })
})

describe('owedSummary', () => {
  it('totals what one person owes and is owed', () => {
    expect(owedSummary([500, -200, 0, -50])).toEqual({ owe: 250, owed: 500 })
  })
})
