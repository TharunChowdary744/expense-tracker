import { readFileSync } from 'node:fs'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  Timestamp,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Firestore,
} from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { groupExpenseSchema, groupSchema, inviteSchema } from '../src/features/groups/schemas'
import { reminderDayKey } from '../src/features/groups/invites'
import {
  createGroup,
  createInvite,
  deleteExpense,
  joinGroup,
  leaveGroup,
  recordSettlement,
  removeMember,
  revokeEmailInvite,
  saveExpense,
  sendReminder,
  updateGroupSettings,
  type Actor,
} from '../src/features/groups/writes'
import { toPlain } from '../src/services/firestore'

let env: RulesTestEnvironment

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-ledgerly-groups',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  })
})

afterAll(async () => {
  await env.cleanup()
})

const past = Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'))
const stamps = (uid = 'alice') => ({ createdAt: past, updatedAt: past, createdBy: uid })
const DAY = 24 * 60 * 60 * 1000
const later = () => Timestamp.fromMillis(Date.now() + 3 * DAY)

const LINK = 'linktoken-aaaaaaaaaaaaaaaaaaaaaa'
const EMAIL_EVE = 'emailtoken-eve-aaaaaaaaaaaaaaaaa'
const EXPIRED = 'expiredtoken-aaaaaaaaaaaaaaaaaaa'

const people: Record<string, Actor & { emailVerified: boolean }> = {
  alice: { uid: 'alice', displayName: 'Alice', email: 'alice@example.com', emailVerified: true },
  bob: { uid: 'bob', displayName: 'Bob', email: 'bob@example.com', emailVerified: true },
  carol: { uid: 'carol', displayName: 'Carol', email: 'carol@example.com', emailVerified: true },
  dave: { uid: 'dave', displayName: 'Dave', email: 'dave@example.com', emailVerified: true },
  eve: { uid: 'eve', displayName: 'Eve', email: 'eve@example.com', emailVerified: true },
}

const asDb = (uid: string, token: Record<string, unknown> = {}) => {
  const person = people[uid]
  return env
    .authenticatedContext(uid, {
      email: person?.email ?? `${uid}@example.com`,
      email_verified: person?.emailVerified ?? true,
      ...token,
    })
    .firestore() as unknown as Firestore
}
const anon = () => env.unauthenticatedContext().firestore() as unknown as Firestore

const member = (name: string, role: string, extra: Record<string, unknown> = {}) => ({
  displayName: name,
  email: `${name.toLowerCase()}@example.com`,
  role,
  ...extra,
})

/** Group g1: Alice (owner), Bob and Carol; Dave was removed. Eve is an outsider. */
function storedGroup(over: Record<string, unknown> = {}) {
  return {
    name: 'Goa trip',
    emoji: '🏖️',
    currency: 'INR',
    memberIds: ['alice', 'bob', 'carol'],
    members: {
      alice: member('Alice', 'owner'),
      bob: member('Bob', 'member', { joinedVia: LINK }),
      carol: member('Carol', 'member', { joinedVia: LINK }),
      dave: member('Dave', 'former', { joinedVia: LINK }),
    },
    ownerId: 'alice',
    invitedEmails: ['eve@example.com'],
    simplifyDebts: false,
    ...stamps(),
    ...over,
  }
}

const storedExpense = (over: Record<string, unknown> = {}) => ({
  description: 'Dinner',
  amount: 100000,
  currency: 'INR',
  date: past,
  categoryId: 'food',
  paidBy: { alice: 100000 },
  splitType: 'equal',
  splitInput: { alice: 1, bob: 1, carol: 1 },
  shares: { alice: 33334, bob: 33333, carol: 33333 },
  note: '',
  attachments: [],
  ...stamps(),
  ...over,
})

/** A new expense as the client writes it. */
const newExpense = (uid: string, over: Record<string, unknown> = {}) => ({
  ...storedExpense(),
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  createdBy: uid,
  ...over,
})

const invite = (over: Record<string, unknown> = {}) => ({
  groupId: 'g1',
  groupName: 'Goa trip',
  groupEmoji: '🏖️',
  invitedEmail: null,
  invitedBy: 'alice',
  invitedByName: 'Alice',
  expiresAt: later(),
  ...stamps(),
  ...over,
})

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'groups/g1'), storedGroup())
    await setDoc(doc(db, 'groups/g1/expenses/e1'), storedExpense())
    // Dave was in an older expense before he was removed.
    await setDoc(
      doc(db, 'groups/g1/expenses/old'),
      storedExpense({
        description: 'Taxi',
        amount: 900,
        paidBy: { dave: 900 },
        splitInput: { alice: 1, dave: 1, bob: 1 },
        shares: { alice: 300, dave: 300, bob: 300 },
      }),
    )
    await setDoc(doc(db, 'groups/g1/settlements/s1'), {
      fromUid: 'bob',
      toUid: 'alice',
      amount: 10000,
      date: past,
      note: '',
      ...stamps('bob'),
    })
    await setDoc(doc(db, 'groups/g1/activity/a1'), {
      actorUid: 'alice',
      action: 'group-created',
      summary: 'Alice created the group',
      ...stamps(),
    })
    await setDoc(doc(db, `invites/${LINK}`), invite())
    await setDoc(doc(db, `invites/${EMAIL_EVE}`), invite({ invitedEmail: 'eve@example.com' }))
    await setDoc(
      doc(db, `invites/${EXPIRED}`),
      invite({ expiresAt: Timestamp.fromMillis(Date.now() - DAY) }),
    )
    // Eve's own (unrelated) group.
    await setDoc(
      doc(db, 'groups/g2'),
      storedGroup({
        name: 'Flat',
        memberIds: ['eve'],
        members: { eve: member('Eve', 'owner') },
        ownerId: 'eve',
        invitedEmails: [],
        createdBy: 'eve',
      }),
    )
  })
})

const g1 = (db: Firestore) => doc(db, 'groups/g1')
const sub = (db: Firestore, name: string) => collection(db, 'groups/g1', name)

describe('reading groups', () => {
  it('lets members read the group and every subcollection', async () => {
    for (const uid of ['alice', 'bob', 'carol']) {
      const db = asDb(uid)
      await assertSucceeds(getDoc(g1(db)))
      await assertSucceeds(getDocs(sub(db, 'expenses')))
      await assertSucceeds(getDocs(sub(db, 'settlements')))
      await assertSucceeds(getDocs(sub(db, 'activity')))
    }
  })

  it('denies signed-out users', async () => {
    const db = anon()
    await assertFails(getDoc(g1(db)))
    await assertFails(getDocs(sub(db, 'expenses')))
    await assertFails(getDocs(sub(db, 'settlements')))
    await assertFails(getDocs(sub(db, 'activity')))
    await assertFails(getDocs(collection(db, 'groups')))
  })

  it('denies non-members', async () => {
    const db = asDb('eve')
    await assertFails(getDoc(g1(db)))
    await assertFails(getDoc(doc(db, 'groups/g1/expenses/e1')))
    await assertFails(getDocs(sub(db, 'expenses')))
    await assertFails(getDocs(sub(db, 'settlements')))
    await assertFails(getDocs(sub(db, 'activity')))
  })

  it('denies a removed member', async () => {
    const db = asDb('dave')
    await assertFails(getDoc(g1(db)))
    await assertFails(getDocs(sub(db, 'expenses')))
    await assertFails(getDocs(sub(db, 'settlements')))
    await assertFails(getDocs(sub(db, 'activity')))
  })

  it("lists only the user's own groups", async () => {
    const db = asDb('bob')
    const snap = await assertSucceeds(
      getDocs(query(collection(db, 'groups'), where('memberIds', 'array-contains', 'bob'))),
    )
    expect(snap.docs.map((d) => d.id)).toEqual(['g1'])
    await assertFails(getDocs(collection(db, 'groups')))
  })

  it('stored docs pass the zod schemas', async () => {
    const snap = await getDoc(g1(asDb('alice')))
    expect(groupSchema.safeParse(toPlain(snap.data())).success).toBe(true)
    const expense = await getDoc(doc(asDb('alice'), 'groups/g1/expenses/e1'))
    expect(groupExpenseSchema.safeParse(toPlain(expense.data())).success).toBe(true)
  })
})

describe('creating and editing groups', () => {
  it('creates a group with the creator as the only member and owner', async () => {
    const db = asDb('bob')
    const { groupId, commit } = createGroup(db, people.bob as Actor, {
      name: 'Flatmates',
      currency: 'INR',
      emoji: '🏠',
    })
    await assertSucceeds(commit)
    const snap = await getDoc(doc(db, 'groups', groupId))
    expect(snap.data()?.memberIds).toEqual(['bob'])
    const activity = await getDocs(collection(db, 'groups', groupId, 'activity'))
    expect(activity.docs[0]?.data().action).toBe('group-created')
  })

  it('refuses a new group that lists other members or another owner', async () => {
    const db = asDb('bob')
    const base = {
      name: 'Sneaky',
      emoji: '👥',
      currency: 'INR',
      memberIds: ['bob'],
      members: { bob: member('Bob', 'owner') },
      ownerId: 'bob',
      invitedEmails: [],
      simplifyDebts: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: 'bob',
    }
    await assertSucceeds(setDoc(doc(db, 'groups/ok'), base))
    await assertFails(setDoc(doc(db, 'groups/x1'), { ...base, memberIds: ['bob', 'eve'] }))
    await assertFails(setDoc(doc(db, 'groups/x2'), { ...base, ownerId: 'eve' }))
    await assertFails(
      setDoc(doc(db, 'groups/x3'), {
        ...base,
        members: { bob: member('Bob', 'owner'), eve: member('Eve', 'member') },
      }),
    )
    await assertFails(setDoc(doc(db, 'groups/x4'), { ...base, currency: 'rupees' }))
    await assertFails(setDoc(doc(anon(), 'groups/x5'), base))
  })

  it('lets any member rename the group and toggle simplify debts', async () => {
    await assertSucceeds(
      updateGroupSettings(
        asDb('bob'),
        people.bob as Actor,
        'g1',
        { simplifyDebts: true },
        'Bob turned on simplify debts',
      ),
    )
    await assertSucceeds(
      updateGroupSettings(
        asDb('carol'),
        people.carol as Actor,
        'g1',
        { name: 'Goa 2026', emoji: '✈️' },
        'Carol renamed the group',
      ),
    )
  })

  it('refuses edits from outsiders and to currency, members or owner', async () => {
    await assertFails(updateDoc(g1(asDb('eve')), { name: 'Mine', updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(g1(asDb('dave')), { name: 'Mine', updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(g1(asDb('bob')), { currency: 'USD', updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(g1(asDb('bob')), { ownerId: 'bob', updatedAt: serverTimestamp() }))
    await assertFails(
      updateDoc(g1(asDb('bob')), { memberIds: arrayUnion('eve'), updatedAt: serverTimestamp() }),
    )
    await assertFails(
      updateDoc(g1(asDb('bob')), { 'members.bob.role': 'owner', updatedAt: serverTimestamp() }),
    )
    await assertFails(deleteDoc(g1(asDb('alice'))))
  })
})

describe('expenses', () => {
  it('lets a member add, edit and delete a valid expense (with activity)', async () => {
    const db = asDb('bob')
    const values = {
      description: 'Groceries',
      amount: 1000,
      currency: 'INR',
      date: '2026-10-03',
      note: '',
      paidBy: { bob: 1000 },
      splitType: 'shares' as const,
      splitInput: { alice: 2, bob: 1, carol: 1 },
      shares: { alice: 500, bob: 250, carol: 250 },
    }
    const created = saveExpense(db, {
      actor: people.bob as Actor,
      group: { id: 'g1', name: 'Goa trip' },
      values,
      date: new Date(),
      summary: 'Bob added Groceries',
    })
    await assertSucceeds(created.commit)
    await assertSucceeds(
      saveExpense(db, {
        actor: people.bob as Actor,
        group: { id: 'g1', name: 'Goa trip' },
        expenseId: created.expenseId,
        values: { ...values, categoryId: 'groceries', description: 'Groceries (market)' },
        date: new Date(),
        summary: 'Bob edited Groceries',
      }).commit,
    )
    await assertSucceeds(
      deleteExpense(db, people.bob as Actor, 'g1', created.expenseId, 'Bob deleted Groceries'),
    )
  })

  it('refuses non-members, removed members and signed-out users', async () => {
    await assertFails(setDoc(doc(asDb('eve'), 'groups/g1/expenses/x'), newExpense('eve')))
    await assertFails(setDoc(doc(asDb('dave'), 'groups/g1/expenses/x'), newExpense('dave')))
    await assertFails(setDoc(doc(anon(), 'groups/g1/expenses/x'), newExpense('alice')))
    await assertFails(deleteDoc(doc(asDb('dave'), 'groups/g1/expenses/e1')))
    await assertFails(updateDoc(doc(asDb('eve'), 'groups/g1/expenses/e1'), { note: 'hi' }))
  })

  it('requires paidBy, shares and splitInput keys to be current members', async () => {
    const db = asDb('alice')
    const ref = doc(db, 'groups/g1/expenses/x')
    await assertSucceeds(setDoc(ref, newExpense('alice')))
    await assertFails(setDoc(ref, newExpense('alice', { paidBy: { eve: 100000 } })))
    await assertFails(setDoc(ref, newExpense('alice', { paidBy: { dave: 100000 } })))
    await assertFails(setDoc(ref, newExpense('alice', { shares: { alice: 50000, eve: 50000 } })))
    await assertFails(setDoc(ref, newExpense('alice', { splitInput: { alice: 1, eve: 1 } })))
  })

  it('requires an integer amount > 0 in the group currency', async () => {
    const ref = doc(asDb('alice'), 'groups/g1/expenses/x')
    await assertFails(
      setDoc(ref, newExpense('alice', { amount: 0, paidBy: { alice: 0 }, shares: { alice: 0 } })),
    )
    await assertFails(
      setDoc(
        ref,
        newExpense('alice', { amount: 10.5, paidBy: { alice: 10.5 }, shares: { alice: 10.5 } }),
      ),
    )
    await assertFails(setDoc(ref, newExpense('alice', { amount: '100000' })))
    await assertFails(setDoc(ref, newExpense('alice', { currency: 'USD' })))
  })

  it('checks sum(paidBy) == amount == sum(shares)', async () => {
    const ref = doc(asDb('alice'), 'groups/g1/expenses/x')
    await assertFails(setDoc(ref, newExpense('alice', { paidBy: { alice: 99999 } })))
    await assertFails(
      setDoc(ref, newExpense('alice', { shares: { alice: 33333, bob: 33333, carol: 33333 } })),
    )
    await assertFails(setDoc(ref, newExpense('alice', { paidBy: { alice: 100001, bob: -1 } })))
    await assertSucceeds(setDoc(ref, newExpense('alice', { paidBy: { alice: 60000, bob: 40000 } })))
  })

  it('still allows editing an old expense that involves a former member', async () => {
    const ref = doc(asDb('bob'), 'groups/g1/expenses/old')
    await assertSucceeds(
      updateDoc(ref, { description: 'Taxi to airport', updatedAt: serverTimestamp() }),
    )
    // But changing who paid must use current members.
    await assertFails(
      updateDoc(ref, { paidBy: { dave: 450, eve: 450 }, updatedAt: serverTimestamp() }),
    )
  })

  it('accepts a 20-way split within the rules expression limits', async () => {
    const ids = ['alice', ...Array.from({ length: 19 }, (_, i) => `m${i}`)]
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), 'groups/big'),
        storedGroup({
          memberIds: ids,
          members: Object.fromEntries(
            ids.map((id) => [id, member(id, id === 'alice' ? 'owner' : 'member')]),
          ),
        }),
      )
    })
    const each = Object.fromEntries(ids.map((id) => [id, 500]))
    const ref = doc(asDb('alice'), 'groups/big/expenses/x')
    await assertSucceeds(
      setDoc(
        ref,
        newExpense('alice', {
          amount: 10000,
          paidBy: each,
          splitInput: Object.fromEntries(ids.map((id) => [id, 1])),
          shares: each,
        }),
      ),
    )
    await assertFails(
      setDoc(ref, newExpense('alice', { amount: 10001, paidBy: each, shares: each })),
    )
  })

  it('creates the linked personal expense for my share in the same batch', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/bob/accounts/cash'), {
        name: 'Cash',
        type: 'cash',
        currency: 'INR',
        openingBalance: 0,
        txTotal: 0,
        color: '#22c55e',
        icon: 'wallet',
        archived: false,
        ...stamps('bob'),
      })
    })
    const db = asDb('bob')
    const saved = saveExpense(db, {
      actor: people.bob as Actor,
      group: { id: 'g1', name: 'Goa trip' },
      values: {
        description: 'Dinner',
        amount: 100000,
        currency: 'INR',
        date: '2026-10-03',
        note: '',
        paidBy: { alice: 100000 },
        splitType: 'equal',
        splitInput: { alice: 1, bob: 1, carol: 1 },
        shares: { alice: 33334, bob: 33333, carol: 33333 },
        personal: {
          accountId: 'cash',
          amount: 33333,
          currency: 'INR',
          fxRateToBase: 1,
          baseAmount: 33333,
        },
      },
      date: new Date(),
      summary: 'Bob added Dinner',
      accountCurrencies: { cash: 'INR' },
    })
    await assertSucceeds(saved.commit)
    const tx = await getDoc(doc(db, 'users/bob/transactions', saved.personalId as string))
    expect(tx.data()?.groupExpenseRef).toBe(`groups/g1/expenses/${saved.expenseId}`)
    expect(tx.data()?.amount).toBe(33333)
    const account = await getDoc(doc(db, 'users/bob/accounts/cash'))
    expect(account.data()?.txTotal).toBe(-33333)
  })

  it('keeps createdBy and createdAt on edits', async () => {
    const ref = doc(asDb('bob'), 'groups/g1/expenses/e1')
    await assertFails(updateDoc(ref, { createdBy: 'bob', updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(ref, { note: 'x' }))
  })
})

describe('settlements and activity', () => {
  it('lets a member record a payment between two members', async () => {
    const { commit } = recordSettlement(asDb('bob'), {
      actor: people.bob as Actor,
      groupId: 'g1',
      fromUid: 'bob',
      toUid: 'alice',
      amount: 20000,
      date: new Date(),
      note: 'UPI',
      summary: 'Bob paid Alice ₹200.00',
    })
    await assertSucceeds(commit)
  })

  it('refuses invalid settlements', async () => {
    const ref = doc(asDb('bob'), 'groups/g1/settlements/x')
    const base = {
      fromUid: 'bob',
      toUid: 'alice',
      amount: 20000,
      date: past,
      note: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: 'bob',
    }
    await assertSucceeds(setDoc(ref, base))
    await assertFails(
      setDoc(doc(asDb('bob'), 'groups/g1/settlements/y'), { ...base, toUid: 'bob' }),
    )
    await assertFails(
      setDoc(doc(asDb('bob'), 'groups/g1/settlements/y'), { ...base, toUid: 'eve' }),
    )
    await assertFails(setDoc(doc(asDb('bob'), 'groups/g1/settlements/y'), { ...base, amount: 0 }))
    await assertFails(
      setDoc(doc(asDb('eve'), 'groups/g1/settlements/y'), { ...base, createdBy: 'eve' }),
    )
    await assertFails(updateDoc(doc(asDb('bob'), 'groups/g1/settlements/s1'), { amount: 1 }))
    await assertSucceeds(deleteDoc(doc(asDb('alice'), 'groups/g1/settlements/s1')))
  })

  it('keeps activity append-only and attributed to the writer', async () => {
    const db = asDb('bob')
    const entry = {
      actorUid: 'bob',
      action: 'expense-added',
      summary: 'Bob added Snacks',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: 'bob',
    }
    await assertSucceeds(setDoc(doc(db, 'groups/g1/activity/x'), entry))
    await assertFails(setDoc(doc(db, 'groups/g1/activity/y'), { ...entry, actorUid: 'alice' }))
    await assertFails(setDoc(doc(db, 'groups/g1/activity/y'), { ...entry, action: 'hacked' }))
    await assertFails(
      setDoc(doc(asDb('eve'), 'groups/g1/activity/y'), {
        ...entry,
        actorUid: 'eve',
        createdBy: 'eve',
      }),
    )
    await assertFails(updateDoc(doc(db, 'groups/g1/activity/a1'), { summary: 'changed' }))
    await assertFails(deleteDoc(doc(db, 'groups/g1/activity/a1')))
  })
})

describe('invites', () => {
  it('can be read by anyone with the token, but not listed', async () => {
    const snap = await assertSucceeds(getDoc(doc(anon(), `invites/${LINK}`)))
    expect(inviteSchema.safeParse(toPlain(snap.data())).success).toBe(true)
    await assertSucceeds(getDoc(doc(asDb('eve'), `invites/${LINK}`)))
    await assertFails(getDocs(collection(asDb('alice'), 'invites')))
  })

  it('can be created only by group members', async () => {
    const token = 'newtoken-bbbbbbbbbbbbbbbbbbbbbbbbbb'
    await assertSucceeds(
      createInvite(asDb('bob'), {
        actor: people.bob as Actor,
        group: { id: 'g1', name: 'Goa trip', emoji: '🏖️' },
        token,
      }),
    )
    await assertSucceeds(
      createInvite(asDb('carol'), {
        actor: people.carol as Actor,
        group: { id: 'g1', name: 'Goa trip', emoji: '🏖️' },
        token: 'emailtoken-frank-ccccccccccccccccc',
        email: 'frank@example.com',
      }),
    )
    await assertFails(
      createInvite(asDb('eve'), {
        actor: people.eve as Actor,
        group: { id: 'g1', name: 'Goa trip', emoji: '🏖️' },
        token: 'evetoken-ddddddddddddddddddddddddd',
      }),
    )
    await assertFails(
      createInvite(asDb('dave'), {
        actor: people.dave as Actor,
        group: { id: 'g1', name: 'Goa trip', emoji: '🏖️' },
        token: 'davetoken-eeeeeeeeeeeeeeeeeeeeeeee',
      }),
    )
  })

  it('refuses short tokens, far expiry and edits by members', async () => {
    const db = asDb('alice')
    const fresh = {
      ...invite(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: 'alice',
    }
    await assertFails(setDoc(doc(db, 'invites/short'), fresh))
    await assertFails(
      setDoc(doc(db, 'invites/far-future-token-aaaaaaaaaaaa'), {
        ...fresh,
        expiresAt: Timestamp.fromMillis(Date.now() + 60 * DAY),
      }),
    )
    await assertFails(
      setDoc(doc(db, 'invites/someone-else-token-aaaaaaaa'), { ...fresh, invitedBy: 'bob' }),
    )
    await assertFails(updateDoc(doc(db, `invites/${LINK}`), { expiresAt: later() }))
    await assertSucceeds(deleteDoc(doc(db, `invites/${LINK}`)))
    await assertFails(deleteDoc(doc(asDb('eve'), `invites/${EMAIL_EVE}`)))
  })
})

describe('joining', () => {
  it('joins with a link invite and appends activity', async () => {
    const db = asDb('eve')
    const result = await assertSucceeds(
      joinGroup(db, people.eve as Actor & { emailVerified: boolean }, LINK),
    )
    expect(result.groupId).toBe('g1')
    const snap = await getDoc(g1(db))
    expect(snap.data()?.memberIds).toEqual(['alice', 'bob', 'carol', 'eve'])
    expect(snap.data()?.members.eve.joinedVia).toBe(LINK)
    // Eve was also invited by email; that pending invite is cleared.
    expect(snap.data()?.invitedEmails).toEqual([])
    await assertSucceeds(getDocs(sub(db, 'expenses')))
  })

  it('lets a removed member rejoin with a valid invite', async () => {
    await assertSucceeds(
      joinGroup(asDb('dave'), people.dave as Actor & { emailVerified: boolean }, LINK),
    )
  })

  it('joins with an email invite for that verified address, once', async () => {
    const db = asDb('eve')
    await assertSucceeds(joinGroup(db, people.eve as Actor & { emailVerified: boolean }, EMAIL_EVE))
    const inv = await getDoc(doc(db, `invites/${EMAIL_EVE}`))
    expect(inv.data()?.acceptedBy).toBe('eve')
  })

  it('refuses an expired invite', async () => {
    await expect(
      joinGroup(asDb('eve'), people.eve as Actor & { emailVerified: boolean }, EXPIRED),
    ).rejects.toThrow(/expired/)
    // And the rules refuse it even if the client skips the check.
    await assertFails(
      updateDoc(g1(asDb('eve')), {
        memberIds: arrayUnion('eve'),
        'members.eve': member('Eve', 'member', { joinedVia: EXPIRED }),
        updatedAt: serverTimestamp(),
      }),
    )
  })

  it('refuses an email invite for someone else, unverified or already used', async () => {
    const frank = {
      uid: 'frank',
      displayName: 'Frank',
      email: 'frank@example.com',
      emailVerified: true,
    }
    await expect(joinGroup(asDb('frank'), frank, EMAIL_EVE)).rejects.toThrow(/different email/)
    const raw = (uid: string, email: string, token = EMAIL_EVE) => ({
      memberIds: arrayUnion(uid),
      [`members.${uid}`]: { displayName: 'X', email, role: 'member', joinedVia: token },
      invitedEmails: arrayRemove(email),
      updatedAt: serverTimestamp(),
    })
    await assertFails(updateDoc(g1(asDb('frank')), raw('frank', 'frank@example.com')))
    // Eve with an unverified email.
    await assertFails(
      updateDoc(g1(asDb('eve', { email_verified: false })), raw('eve', 'eve@example.com')),
    )
    // Used: mark accepted, then try again as someone with the same (verified) address.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), `invites/${EMAIL_EVE}`), { acceptedBy: 'someone' })
    })
    await expect(
      joinGroup(asDb('eve'), people.eve as Actor & { emailVerified: boolean }, EMAIL_EVE),
    ).rejects.toThrow(/already been used/)
    await assertFails(updateDoc(g1(asDb('eve')), raw('eve', 'eve@example.com')))
  })

  it('refuses an email invite once it is revoked', async () => {
    await assertSucceeds(revokeEmailInvite(asDb('alice'), 'g1', 'eve@example.com'))
    await assertFails(
      joinGroup(asDb('eve'), people.eve as Actor & { emailVerified: boolean }, EMAIL_EVE),
    )
  })

  it('refuses joins that add someone else, claim a role or skip the invite', async () => {
    const db = asDb('eve')
    await assertFails(
      updateDoc(g1(db), {
        memberIds: arrayUnion('frank'),
        'members.frank': member('Frank', 'member', { joinedVia: LINK }),
        updatedAt: serverTimestamp(),
      }),
    )
    await assertFails(
      updateDoc(g1(db), {
        memberIds: arrayUnion('eve'),
        'members.eve': member('Eve', 'owner', { joinedVia: LINK }),
        updatedAt: serverTimestamp(),
      }),
    )
    await assertFails(
      updateDoc(g1(db), {
        memberIds: arrayUnion('eve'),
        'members.eve': member('Eve', 'member'),
        updatedAt: serverTimestamp(),
      }),
    )
    // An invite for another group.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), 'invites/othergroup-token-aaaaaaaaaaa'),
        invite({ groupId: 'g2' }),
      )
    })
    await assertFails(
      updateDoc(g1(db), {
        memberIds: arrayUnion('eve'),
        'members.eve': member('Eve', 'member', { joinedVia: 'othergroup-token-aaaaaaaaaaa' }),
        updatedAt: serverTimestamp(),
      }),
    )
  })

  it('refuses a join that would pass 20 members', async () => {
    const ids = Array.from({ length: 20 }, (_, i) => `m${i}`)
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), 'groups/g1'),
        storedGroup({
          memberIds: ids,
          members: Object.fromEntries(
            ids.map((id) => [id, member(id, id === 'm0' ? 'owner' : 'member')]),
          ),
          ownerId: 'm0',
        }),
      )
    })
    await assertFails(
      joinGroup(asDb('eve'), people.eve as Actor & { emailVerified: boolean }, LINK),
    )
  })
})

describe('leaving and removing members', () => {
  const group = { id: 'g1', memberIds: ['alice', 'bob', 'carol'], ownerId: 'alice' }

  it('lets a member leave, after which they lose access', async () => {
    await assertSucceeds(leaveGroup(asDb('carol'), people.carol as Actor, group))
    const after = await getDoc(g1(asDb('alice')))
    expect(after.data()?.memberIds).toEqual(['alice', 'bob'])
    expect(after.data()?.members.carol.role).toBe('former')
    await assertFails(getDoc(g1(asDb('carol'))))
    await assertFails(getDocs(sub(asDb('carol'), 'expenses')))
    await assertFails(setDoc(doc(asDb('carol'), 'groups/g1/expenses/x'), newExpense('carol')))
  })

  it('makes an owner who leaves hand ownership to a remaining member', async () => {
    await assertSucceeds(leaveGroup(asDb('alice'), people.alice as Actor, group))
    const after = await getDoc(g1(asDb('bob')))
    expect(after.data()?.ownerId).toBe('bob')
    expect(after.data()?.members.bob.role).toBe('owner')
    // Without the hand-over the rules refuse it.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'groups/g1'), storedGroup())
    })
    await assertFails(
      updateDoc(g1(asDb('alice')), {
        memberIds: arrayRemove('alice'),
        'members.alice.role': 'former',
        updatedAt: serverTimestamp(),
      }),
    )
  })

  it("doesn't let the last member leave", async () => {
    await assertFails(
      updateDoc(doc(asDb('eve'), 'groups/g2'), {
        memberIds: arrayRemove('eve'),
        'members.eve.role': 'former',
        updatedAt: serverTimestamp(),
      }),
    )
  })

  it('lets only the owner remove another member', async () => {
    await assertFails(
      removeMember(asDb('bob'), people.bob as Actor, 'g1', { uid: 'carol', displayName: 'Carol' }),
    )
    await assertSucceeds(
      removeMember(asDb('alice'), people.alice as Actor, 'g1', {
        uid: 'carol',
        displayName: 'Carol',
      }),
    )
    await assertFails(getDoc(g1(asDb('carol'))))
    // Removing oneself this way (an owner leaving without a hand-over) is refused.
    await assertFails(
      updateDoc(g1(asDb('alice')), {
        memberIds: ['bob'],
        'members.alice.role': 'former',
        updatedAt: serverTimestamp(),
      }),
    )
  })

  it('refuses removing two members at once', async () => {
    await assertFails(
      updateDoc(g1(asDb('alice')), {
        memberIds: ['alice'],
        'members.bob.role': 'former',
        'members.carol.role': 'former',
        updatedAt: serverTimestamp(),
      }),
    )
  })
})

describe('settle-up reminders', () => {
  const ref = (db: Firestore, from: string, to: string, key = reminderDayKey(new Date())) =>
    doc(db, 'users', to, 'notifications', `remind_g1_${from}_${key}`)
  const body = (from: string) => ({
    type: 'settle-reminder',
    title: 'Settle up in Goa trip',
    body: 'Alice reminded you that you owe ₹333.33.',
    link: '/groups/g1',
    read: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: from,
  })

  it('lets a member remind another member once a day', async () => {
    const reminder = {
      fromUid: 'alice',
      toUid: 'bob',
      groupId: 'g1',
      title: 'Settle up in Goa trip',
      body: 'Alice reminded you that you owe ₹333.33.',
    }
    await assertSucceeds(sendReminder(asDb('alice'), reminder))
    await assertFails(sendReminder(asDb('alice'), reminder))
    // The debtor can read it and mark it read; the sender can't read it.
    const bobRef = ref(asDb('bob'), 'alice', 'bob')
    await assertSucceeds(getDoc(bobRef))
    await assertSucceeds(updateDoc(bobRef, { read: true, updatedAt: serverTimestamp() }))
    await assertFails(getDoc(ref(asDb('alice'), 'alice', 'bob')))
  })

  it('refuses reminders from outsiders, to outsiders, for other days or with other content', async () => {
    await assertFails(setDoc(ref(asDb('eve'), 'eve', 'bob'), body('eve')))
    await assertFails(setDoc(ref(asDb('dave'), 'dave', 'bob'), body('dave')))
    await assertFails(setDoc(ref(asDb('alice'), 'alice', 'eve'), body('alice')))
    await assertFails(setDoc(ref(asDb('alice'), 'alice', 'bob', '20200101'), body('alice')))
    await assertFails(setDoc(ref(asDb('alice'), 'bob', 'carol'), body('alice')))
    await assertFails(
      setDoc(ref(asDb('alice'), 'alice', 'bob'), { ...body('alice'), link: '/budgets' }),
    )
    await assertFails(
      setDoc(ref(asDb('alice'), 'alice', 'bob'), { ...body('alice'), type: 'budget-threshold' }),
    )
  })
})
