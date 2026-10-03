/**
 * Group balances. Pure functions over integer minor units, so every result sums exactly.
 *
 * - A member's net balance is what they paid minus their shares, plus settlements they paid,
 *   minus settlements they received. Positive means the group owes them; negative means they owe.
 * - Pairwise debts say who owes whom without restructuring: each expense's debtors are matched
 *   to its payers, then opposite debts between the same two people cancel out.
 * - Simplified debts use the greedy minimum-cash-flow method: the biggest debtor pays the
 *   biggest creditor until everyone is settled, so a group of n people needs at most n − 1
 *   payments.
 */

export type MoneyMap = Readonly<Record<string, number>>

export interface BalanceExpense {
  paidBy: MoneyMap
  shares: MoneyMap
}

export interface BalanceSettlement {
  fromUid: string
  toUid: string
  amount: number
}

/** `from` owes `to` `amount` minor units (always > 0). */
export interface Debt {
  from: string
  to: string
  amount: number
}

const byKey = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

function add(map: Map<string, number>, key: string, value: number) {
  map.set(key, (map.get(key) ?? 0) + value)
}

/** Net balance per member (members with no activity are left out unless listed in `members`). */
export function netBalances(
  expenses: readonly BalanceExpense[],
  settlements: readonly BalanceSettlement[],
  members: readonly string[] = [],
): Map<string, number> {
  const net = new Map<string, number>(members.map((uid) => [uid, 0]))
  for (const expense of expenses) {
    for (const [uid, paid] of Object.entries(expense.paidBy)) add(net, uid, paid)
    for (const [uid, share] of Object.entries(expense.shares)) add(net, uid, -share)
  }
  for (const s of settlements) {
    add(net, s.fromUid, s.amount)
    add(net, s.toUid, -s.amount)
  }
  return net
}

/**
 * Matches debtors (negative) to creditors (positive) greedily, in key order, so the transfers
 * are deterministic and exact. Used inside one expense for pairwise debts.
 */
function matchInOrder(net: Map<string, number>): Debt[] {
  const creditors = [...net].filter(([, v]) => v > 0).sort(([a], [b]) => byKey(a, b))
  const debtors = [...net].filter(([, v]) => v < 0).sort(([a], [b]) => byKey(a, b))
  const debts: Debt[] = []
  let ci = 0
  let creditLeft = creditors[0]?.[1] ?? 0
  for (const [debtor, value] of debtors) {
    let owed = -value
    while (owed > 0 && ci < creditors.length) {
      const creditor = creditors[ci] as [string, number]
      const amount = Math.min(owed, creditLeft)
      if (amount > 0) debts.push({ from: debtor, to: creditor[0], amount })
      owed -= amount
      creditLeft -= amount
      if (creditLeft === 0) {
        ci += 1
        creditLeft = creditors[ci]?.[1] ?? 0
      }
    }
  }
  return debts
}

/**
 * Who owes whom, pair by pair, without simplifying across people. Within each expense the
 * debtors are matched to the payers; settlements reduce the payer's debt to the receiver.
 * Opposite debts between two people cancel. Sorted by debtor, then creditor.
 */
export function pairwiseDebts(
  expenses: readonly BalanceExpense[],
  settlements: readonly BalanceSettlement[],
): Debt[] {
  // owed.get(`${a}\u0000${b}`) = how much a owes b in total.
  const owed = new Map<string, number>()
  const key = (a: string, b: string) => `${a}\u0000${b}`

  for (const expense of expenses) {
    const net = new Map<string, number>()
    for (const [uid, paid] of Object.entries(expense.paidBy)) add(net, uid, paid)
    for (const [uid, share] of Object.entries(expense.shares)) add(net, uid, -share)
    for (const d of matchInOrder(net)) add(owed, key(d.from, d.to), d.amount)
  }
  // Paying someone reduces what you owe them (or makes them owe you).
  for (const s of settlements) add(owed, key(s.fromUid, s.toUid), -s.amount)

  const pairs = new Set<string>()
  for (const k of owed.keys()) {
    const [a, b] = k.split('\u0000') as [string, string]
    pairs.add(byKey(a, b) <= 0 ? key(a, b) : key(b, a))
  }
  const debts: Debt[] = []
  for (const pair of pairs) {
    const [a, b] = pair.split('\u0000') as [string, string]
    const diff = (owed.get(key(a, b)) ?? 0) - (owed.get(key(b, a)) ?? 0)
    if (diff > 0) debts.push({ from: a, to: b, amount: diff })
    else if (diff < 0) debts.push({ from: b, to: a, amount: -diff })
  }
  return debts.sort((x, y) => byKey(x.from, y.from) || byKey(x.to, y.to))
}

/**
 * Minimum cash flow (greedy): repeatedly the member who owes the most pays the member who is
 * owed the most, the smaller of the two amounts. Ties go to the smaller uid, so the result is
 * deterministic. The balances must sum to zero (they always do for real group data).
 */
export function simplifyDebts(balances: ReadonlyMap<string, number>): Debt[] {
  const total = [...balances.values()].reduce((a, b) => a + b, 0)
  if (total !== 0) throw new RangeError(`Balances must sum to zero, got ${total}`)
  const left = new Map(balances)
  const pick = (sign: 1 | -1) => {
    let best: [string, number] | null = null
    for (const [uid, value] of left) {
      if (sign * value <= 0) continue
      if (!best || sign * value > sign * best[1] || (value === best[1] && byKey(uid, best[0]) < 0))
        best = [uid, value]
    }
    return best
  }
  const debts: Debt[] = []
  for (;;) {
    const creditor = pick(1)
    const debtor = pick(-1)
    if (!creditor || !debtor) break
    const amount = Math.min(creditor[1], -debtor[1])
    debts.push({ from: debtor[0], to: creditor[0], amount })
    left.set(creditor[0], creditor[1] - amount)
    left.set(debtor[0], debtor[1] + amount)
  }
  return debts
}

/** Debts for a group, simplified or pairwise depending on the group setting. */
export function groupDebts(
  expenses: readonly BalanceExpense[],
  settlements: readonly BalanceSettlement[],
  simplify: boolean,
): Debt[] {
  return simplify
    ? simplifyDebts(netBalances(expenses, settlements))
    : pairwiseDebts(expenses, settlements)
}

/** Totals for one person across balances: what they owe and what they are owed (both ≥ 0). */
export function owedSummary(balances: readonly number[]): { owe: number; owed: number } {
  let owe = 0
  let owed = 0
  for (const b of balances) {
    if (b < 0) owe -= b
    else owed += b
  }
  return { owe, owed }
}
