import {
  Timestamp,
  arrayRemove,
  arrayUnion,
  collection,
  deleteField,
  doc,
  increment,
  runTransaction,
  serverTimestamp,
  writeBatch,
  type DocumentData,
  type DocumentReference,
  type Firestore,
} from 'firebase/firestore'
import { accountDeltas } from '@/features/transactions/utils'
import { UserFacingError, parseSnapshot } from '@/services/firestore'
import {
  INVITE_DAYS,
  inviteSchema,
  type GroupExpenseFormValues,
  type GroupFormValues,
} from './schemas'
import { inviteStatus, reminderId } from './invites'
import type { ActivityAction } from './schemas'
import type { Group } from './types'

/**
 * Every Firestore write behind groups. Each takes the Firestore instance so the rules tests run
 * the same code against the emulator. Writes that change a group also append an activity entry
 * in the same batch or transaction.
 */

export const groupsCol = (db: Firestore) => collection(db, 'groups')
export const groupRef = (db: Firestore, groupId: string) => doc(db, 'groups', groupId)
export const expensesCol = (db: Firestore, groupId: string) =>
  collection(db, 'groups', groupId, 'expenses')
export const settlementsCol = (db: Firestore, groupId: string) =>
  collection(db, 'groups', groupId, 'settlements')
export const activityCol = (db: Firestore, groupId: string) =>
  collection(db, 'groups', groupId, 'activity')
export const inviteRef = (db: Firestore, token: string) => doc(db, 'invites', token)

export interface Actor {
  uid: string
  /** Shown to other members. */
  displayName: string
  email: string
}

const stamps = (uid: string) => ({
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  createdBy: uid,
})

/** A write batch or a transaction. */
interface Writer {
  set(ref: DocumentReference, data: DocumentData): unknown
}

function addActivity(
  batch: Writer,
  db: Firestore,
  groupId: string,
  actorUid: string,
  action: ActivityAction,
  summary: string,
) {
  batch.set(doc(activityCol(db, groupId)), {
    actorUid,
    action,
    summary: summary.slice(0, 200),
    ...stamps(actorUid),
  })
}

/** Stored display names are 1–80 characters. */
export function actorName(actor: Pick<Actor, 'displayName' | 'email'>): string {
  const name = actor.displayName.trim() || actor.email.split('@')[0] || 'Member'
  return name.slice(0, 80)
}

// ---------------------------------------------------------------------------------------------
// Groups

export function createGroup(db: Firestore, actor: Actor, values: GroupFormValues) {
  const ref = doc(groupsCol(db))
  const batch = writeBatch(db)
  batch.set(ref, {
    name: values.name,
    emoji: values.emoji,
    currency: values.currency,
    memberIds: [actor.uid],
    members: {
      [actor.uid]: {
        displayName: actorName(actor),
        email: actor.email.toLowerCase(),
        role: 'owner',
      },
    },
    ownerId: actor.uid,
    invitedEmails: [],
    simplifyDebts: false,
    ...stamps(actor.uid),
  })
  addActivity(
    batch,
    db,
    ref.id,
    actor.uid,
    'group-created',
    `${actorName(actor)} created the group`,
  )
  return { groupId: ref.id, commit: batch.commit() }
}

export function updateGroupSettings(
  db: Firestore,
  actor: Actor,
  groupId: string,
  changes: Partial<Pick<Group, 'name' | 'emoji' | 'simplifyDebts'>>,
  summary: string,
) {
  const batch = writeBatch(db)
  batch.update(groupRef(db, groupId), { ...changes, updatedAt: serverTimestamp() })
  addActivity(batch, db, groupId, actor.uid, 'group-updated', summary)
  return batch.commit()
}

// ---------------------------------------------------------------------------------------------
// Invites

export interface CreateInviteArg {
  actor: Actor
  group: Pick<Group, 'id' | 'name' | 'emoji'>
  token: string
  /** Lower-case address for an email invite; omit for a link anyone can use. */
  email?: string
  now?: Date
}

export function createInvite(
  db: Firestore,
  { actor, group, token, email, now = new Date() }: CreateInviteArg,
) {
  const batch = writeBatch(db)
  batch.set(inviteRef(db, token), {
    groupId: group.id,
    groupName: group.name,
    groupEmoji: group.emoji,
    invitedEmail: email ?? null,
    invitedBy: actor.uid,
    invitedByName: actorName(actor),
    expiresAt: Timestamp.fromMillis(now.getTime() + INVITE_DAYS * 24 * 60 * 60 * 1000),
    ...stamps(actor.uid),
  })
  if (email) {
    batch.update(groupRef(db, group.id), {
      invitedEmails: arrayUnion(email),
      updatedAt: serverTimestamp(),
    })
  }
  return batch.commit()
}

/** Revoking a pending email invite: its token stops working once the email isn't pending. */
export function revokeEmailInvite(db: Firestore, groupId: string, email: string) {
  return writeBatch(db)
    .update(groupRef(db, groupId), {
      invitedEmails: arrayRemove(email),
      updatedAt: serverTimestamp(),
    })
    .commit()
}

/**
 * Joins a group with an invite token, in one transaction: adds the user to memberIds, marks an
 * email invite accepted and appends a "joined" activity entry. Throws a UserFacingError when
 * the invite can't be used.
 */
export async function joinGroup(
  db: Firestore,
  actor: Actor & { emailVerified: boolean },
  token: string,
  now: Date = new Date(),
): Promise<{ groupId: string }> {
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(inviteRef(db, token))
    if (!snap.exists()) throw new UserFacingError('This invite link is not valid.')
    const parsed = parseSnapshot(snap, inviteSchema)
    if (!parsed.ok) throw new UserFacingError('This invite has unexpected data.')
    const invite = parsed.value
    const status = inviteStatus(
      invite,
      { email: actor.email, emailVerified: actor.emailVerified },
      now,
    )
    if (status.kind !== 'ok') throw new UserFacingError(inviteProblem(status.kind))

    const email = actor.email.toLowerCase()
    const name = actorName(actor)
    tx.update(groupRef(db, invite.groupId), {
      memberIds: arrayUnion(actor.uid),
      [`members.${actor.uid}`]: { displayName: name, email, role: 'member', joinedVia: token },
      invitedEmails: arrayRemove(email),
      updatedAt: serverTimestamp(),
    })
    if (invite.invitedEmail !== null) {
      tx.update(inviteRef(db, token), { acceptedBy: actor.uid, updatedAt: serverTimestamp() })
    }
    addActivity(tx, db, invite.groupId, actor.uid, 'member-joined', `${name} joined the group`)
    return { groupId: invite.groupId }
  })
}

export function inviteProblem(kind: 'expired' | 'used' | 'wrong-email' | 'unverified'): string {
  switch (kind) {
    case 'expired':
      return 'This invite has expired. Ask for a new one.'
    case 'used':
      return 'This invite has already been used.'
    case 'wrong-email':
      return 'This invite was sent to a different email address.'
    case 'unverified':
      return 'Verify your email address first, then open the invite again.'
  }
}

/**
 * Leave a group. The member stays in `members` as "former" so history keeps their name. An
 * owner hands ownership to the next member in join order.
 */
export function leaveGroup(
  db: Firestore,
  actor: Actor,
  group: Pick<Group, 'id' | 'memberIds' | 'ownerId'>,
) {
  const remaining = group.memberIds.filter((id) => id !== actor.uid)
  const nextOwner = remaining[0]
  if (!nextOwner) throw new UserFacingError("You're the only member, so you can't leave.")
  const batch = writeBatch(db)
  batch.update(groupRef(db, group.id), {
    memberIds: arrayRemove(actor.uid),
    [`members.${actor.uid}.role`]: 'former',
    ...(group.ownerId === actor.uid
      ? { ownerId: nextOwner, [`members.${nextOwner}.role`]: 'owner' }
      : {}),
    updatedAt: serverTimestamp(),
  })
  addActivity(batch, db, group.id, actor.uid, 'member-left', `${actorName(actor)} left the group`)
  return batch.commit()
}

export function removeMember(
  db: Firestore,
  actor: Actor,
  groupId: string,
  target: { uid: string; displayName: string },
) {
  const batch = writeBatch(db)
  batch.update(groupRef(db, groupId), {
    memberIds: arrayRemove(target.uid),
    [`members.${target.uid}.role`]: 'former',
    updatedAt: serverTimestamp(),
  })
  addActivity(
    batch,
    db,
    groupId,
    actor.uid,
    'member-removed',
    `${actorName(actor)} removed ${target.displayName}`,
  )
  return batch.commit()
}

// ---------------------------------------------------------------------------------------------
// Expenses

export interface SaveExpenseArg {
  actor: Actor
  group: Pick<Group, 'id' | 'name'>
  /** Edit this expense; omit to add one. */
  expenseId?: string
  values: GroupExpenseFormValues
  /** When the expense happened (the form's date at local noon), as an ISO string. */
  dateIso: string
  summary: string
  /** Currencies of the actor's accounts, for the linked personal expense's balance change. */
  accountCurrencies?: Record<string, string>
}

/**
 * Adds or edits a group expense with its activity entry. With `values.personal` (new expenses
 * only) it also creates the actor's linked personal expense for their share, moving that
 * account's cached balance, in the same batch.
 */
export function saveExpense(db: Firestore, arg: SaveExpenseArg) {
  const { actor, group, expenseId, values, dateIso, summary } = arg
  const date = new Date(dateIso)
  const ref = expenseId ? doc(expensesCol(db, group.id), expenseId) : doc(expensesCol(db, group.id))
  const batch = writeBatch(db)
  const fields = {
    description: values.description,
    amount: values.amount,
    currency: values.currency,
    date: Timestamp.fromDate(date),
    paidBy: values.paidBy,
    splitType: values.splitType,
    splitInput: values.splitInput,
    shares: values.shares,
    note: values.note,
  }
  if (expenseId) {
    batch.update(ref, {
      ...fields,
      // A cleared category is removed (the rules only allow a non-empty string).
      ...(values.categoryId ? { categoryId: values.categoryId } : { categoryId: deleteField() }),
      updatedAt: serverTimestamp(),
    })
  } else {
    batch.set(ref, {
      ...fields,
      ...(values.categoryId ? { categoryId: values.categoryId } : {}),
      attachments: [],
      ...stamps(actor.uid),
    })
  }
  addActivity(
    batch,
    db,
    group.id,
    actor.uid,
    expenseId ? 'expense-edited' : 'expense-added',
    summary,
  )

  let personalId: string | null = null
  if (!expenseId && values.personal) {
    const p = values.personal
    const txRef = doc(collection(db, 'users', actor.uid, 'transactions'))
    personalId = txRef.id
    batch.set(txRef, {
      type: 'expense',
      amount: p.amount,
      currency: p.currency,
      fxRateToBase: p.fxRateToBase,
      baseAmount: p.baseAmount,
      accountId: p.accountId,
      ...(p.categoryId ? { categoryId: p.categoryId } : {}),
      tags: [],
      payee: group.name.slice(0, 80),
      note: values.description,
      date: Timestamp.fromDate(date),
      attachments: [],
      groupExpenseRef: ref.path,
      ...stamps(actor.uid),
    })
    const currencies = arg.accountCurrencies ?? {}
    const deltas = accountDeltas(
      [],
      [
        {
          type: 'expense',
          amount: p.amount,
          baseAmount: p.baseAmount,
          currency: p.currency,
          accountId: p.accountId,
        },
      ],
      (id) => currencies[id],
    )
    for (const [accountId, delta] of deltas) {
      batch.update(doc(db, 'users', actor.uid, 'accounts', accountId), {
        txTotal: increment(delta),
        updatedAt: serverTimestamp(),
      })
    }
  }
  return { expenseId: ref.id, personalId, commit: batch.commit() }
}

export function deleteExpense(
  db: Firestore,
  actor: Actor,
  groupId: string,
  expenseId: string,
  summary: string,
) {
  const batch = writeBatch(db)
  batch.delete(doc(expensesCol(db, groupId), expenseId))
  addActivity(batch, db, groupId, actor.uid, 'expense-deleted', summary)
  return batch.commit()
}

// ---------------------------------------------------------------------------------------------
// Settlements and reminders

export interface SettlementArg {
  actor: Actor
  groupId: string
  fromUid: string
  toUid: string
  amount: number
  /** ISO string. */
  dateIso: string
  note: string
  summary: string
}

export function recordSettlement(db: Firestore, arg: SettlementArg) {
  const ref = doc(settlementsCol(db, arg.groupId))
  const batch = writeBatch(db)
  batch.set(ref, {
    fromUid: arg.fromUid,
    toUid: arg.toUid,
    amount: arg.amount,
    date: Timestamp.fromDate(new Date(arg.dateIso)),
    note: arg.note,
    ...stamps(arg.actor.uid),
  })
  addActivity(batch, db, arg.groupId, arg.actor.uid, 'settlement-added', arg.summary)
  return { settlementId: ref.id, commit: batch.commit() }
}

export function deleteSettlement(
  db: Firestore,
  actor: Actor,
  groupId: string,
  settlementId: string,
  summary: string,
) {
  const batch = writeBatch(db)
  batch.delete(doc(settlementsCol(db, groupId), settlementId))
  addActivity(batch, db, groupId, actor.uid, 'settlement-deleted', summary)
  return batch.commit()
}

export interface ReminderArg {
  fromUid: string
  toUid: string
  groupId: string
  title: string
  body: string
  now?: Date
}

/** A notification in the debtor's inbox. One per sender, group and (UTC) day. */
export function reminderRef(
  db: Firestore,
  arg: Pick<ReminderArg, 'fromUid' | 'toUid' | 'groupId' | 'now'>,
): DocumentReference {
  return doc(
    db,
    'users',
    arg.toUid,
    'notifications',
    reminderId(arg.groupId, arg.fromUid, arg.now ?? new Date()),
  )
}

export function sendReminder(db: Firestore, arg: ReminderArg) {
  return writeBatch(db)
    .set(reminderRef(db, arg), {
      type: 'settle-reminder',
      title: arg.title.slice(0, 120),
      body: arg.body.slice(0, 300),
      link: `/groups/${arg.groupId}`,
      read: false,
      ...stamps(arg.fromUid),
    })
    .commit()
}
