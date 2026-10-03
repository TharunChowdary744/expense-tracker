import { formatMoney } from '@/utils/money'
import type { Debt } from './balances'
import type { Group } from './types'

/** A member's display name, or "You" for the signed-in user. Former members keep their name. */
export function memberLabel(group: Pick<Group, 'members'>, uid: string, me?: string): string {
  if (me !== undefined && uid === me) return 'You'
  return group.members[uid]?.displayName ?? 'Former member'
}

/** Just the name, never "You" (for activity text other members read). */
export function memberName(group: Pick<Group, 'members'>, uid: string): string {
  return group.members[uid]?.displayName ?? 'Former member'
}

/** Current members in join order, the owner first. */
export function orderedMemberIds(group: Pick<Group, 'memberIds' | 'ownerId'>): string[] {
  return [group.ownerId, ...group.memberIds.filter((id) => id !== group.ownerId)].filter((id) =>
    group.memberIds.includes(id),
  )
}

/** "You owe Alice ₹333.33", "Bob owes you ₹10.00", "Bob owes Carol ₹5.00". */
export function debtSentence(
  group: Pick<Group, 'members'>,
  debt: Debt,
  me: string,
  currency: string,
  locale?: string,
): string {
  const amount = formatMoney(debt.amount, currency, locale)
  if (debt.from === me) return `You owe ${memberName(group, debt.to)} ${amount}`
  if (debt.to === me) return `${memberName(group, debt.from)} owes you ${amount}`
  return `${memberName(group, debt.from)} owes ${memberName(group, debt.to)} ${amount}`
}

/** "you owe ₹10.00" / "you are owed ₹10.00" / "settled up" for a net balance. */
export function balancePhrase(net: number, currency: string, locale?: string): string {
  if (net === 0) return 'settled up'
  const amount = formatMoney(Math.abs(net), currency, locale)
  return net < 0 ? `you owe ${amount}` : `you are owed ${amount}`
}

/** Debts that involve `me`, the ones I pay first. */
export function myDebts(debts: readonly Debt[], me: string): Debt[] {
  return debts
    .filter((d) => d.from === me || d.to === me)
    .sort((a, b) => Number(b.from === me) - Number(a.from === me) || b.amount - a.amount)
}

/** The member who becomes owner when the current owner leaves (next in join order). */
export function nextOwner(group: Pick<Group, 'memberIds' | 'ownerId'>): string | null {
  return group.memberIds.find((id) => id !== group.ownerId) ?? null
}

export interface ActivityText {
  actor: string
}

export const activity = {
  expenseAdded: (actor: string, description: string, amount: string) =>
    `${actor} added "${description}" (${amount})`,
  expenseEdited: (actor: string, description: string, amount: string) =>
    `${actor} edited "${description}" (${amount})`,
  expenseDeleted: (actor: string, description: string, amount: string) =>
    `${actor} deleted "${description}" (${amount})`,
  settlement: (actor: string, from: string, to: string, amount: string) =>
    actor === from
      ? `${from} paid ${to} ${amount}`
      : `${actor} recorded that ${from} paid ${to} ${amount}`,
  settlementDeleted: (actor: string, from: string, to: string, amount: string) =>
    `${actor} deleted the payment of ${amount} from ${from} to ${to}`,
  simplify: (actor: string, on: boolean) => `${actor} turned ${on ? 'on' : 'off'} simplify debts`,
  renamed: (actor: string, name: string) => `${actor} renamed the group to "${name}"`,
  updated: (actor: string) => `${actor} changed the group's cover`,
}
