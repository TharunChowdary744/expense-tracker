import { describe, expect, it } from 'vitest'
import type { Group } from './types'
import {
  activity,
  balancePhrase,
  debtSentence,
  memberLabel,
  myDebts,
  nextOwner,
  orderedMemberIds,
} from './utils'

const group = {
  memberIds: ['b', 'a', 'c'],
  ownerId: 'a',
  members: {
    a: { displayName: 'Asha', email: '', role: 'owner' },
    b: { displayName: 'Bilal', email: '', role: 'member' },
    c: { displayName: 'Chen', email: '', role: 'member' },
    d: { displayName: 'Dev', email: '', role: 'former' },
  },
} as Pick<Group, 'memberIds' | 'ownerId' | 'members'>

const plain = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ')

describe('members', () => {
  it('labels the signed-in user as You and keeps former members named', () => {
    expect(memberLabel(group, 'a', 'a')).toBe('You')
    expect(memberLabel(group, 'b', 'a')).toBe('Bilal')
    expect(memberLabel(group, 'd', 'a')).toBe('Dev')
    expect(memberLabel(group, 'zz', 'a')).toBe('Former member')
  })

  it('orders current members owner first, then join order', () => {
    expect(orderedMemberIds(group)).toEqual(['a', 'b', 'c'])
  })

  it('picks the next owner in join order', () => {
    expect(nextOwner(group)).toBe('b')
    expect(nextOwner({ memberIds: ['a'], ownerId: 'a' })).toBeNull()
  })
})

describe('sentences', () => {
  it('describes debts from my point of view', () => {
    expect(
      plain(debtSentence(group, { from: 'a', to: 'b', amount: 33333 }, 'a', 'INR', 'en-IN')),
    ).toBe('You owe Bilal ₹333.33')
    expect(
      plain(debtSentence(group, { from: 'c', to: 'a', amount: 100 }, 'a', 'INR', 'en-IN')),
    ).toBe('Chen owes you ₹1.00')
    expect(
      plain(debtSentence(group, { from: 'c', to: 'b', amount: 100 }, 'a', 'INR', 'en-IN')),
    ).toBe('Chen owes Bilal ₹1.00')
  })

  it('phrases a net balance', () => {
    expect(balancePhrase(0, 'INR', 'en-IN')).toBe('settled up')
    expect(balancePhrase(-500, 'INR', 'en-IN')).toBe('you owe ₹5.00')
    expect(balancePhrase(500, 'INR', 'en-IN')).toBe('you are owed ₹5.00')
  })

  it('writes activity summaries with the actor', () => {
    expect(activity.settlement('Bilal', 'Bilal', 'Asha', '₹200.00')).toBe('Bilal paid Asha ₹200.00')
    expect(activity.settlement('Asha', 'Bilal', 'Asha', '₹200.00')).toBe(
      'Asha recorded that Bilal paid Asha ₹200.00',
    )
    expect(activity.expenseAdded('Asha', 'Dinner', '₹1,000.00')).toBe(
      'Asha added "Dinner" (₹1,000.00)',
    )
  })
})

describe('myDebts', () => {
  it('lists debts involving me, what I owe first', () => {
    const debts = [
      { from: 'b', to: 'a', amount: 10 },
      { from: 'c', to: 'b', amount: 50 },
      { from: 'a', to: 'c', amount: 5 },
    ]
    expect(myDebts(debts, 'a')).toEqual([
      { from: 'a', to: 'c', amount: 5 },
      { from: 'b', to: 'a', amount: 10 },
    ])
  })
})
