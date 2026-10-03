import { getDoc, limit, orderBy, query, where } from 'firebase/firestore'
import { getFirebase } from '@/lib/firebase'
import { api } from '@/services/api'
import {
  collectionListener,
  docListener,
  firestoreErrorMessage,
  firestoreWrite,
  parseSnapshot,
} from '@/services/firestore'
import {
  activitySchema,
  groupExpenseSchema,
  groupSchema,
  inviteSchema,
  settlementSchema,
} from './schemas'
import type { GroupFormValues } from './schemas'
import type { Activity, Group, GroupExpense, Invite, Settlement } from './types'
import {
  activityCol,
  createGroup,
  createInvite,
  deleteExpense,
  deleteSettlement,
  expensesCol,
  groupRef,
  groupsCol,
  inviteRef,
  joinGroup,
  leaveGroup,
  recordSettlement,
  removeMember,
  revokeEmailInvite,
  saveExpense,
  sendReminder,
  settlementsCol,
  updateGroupSettings,
  type Actor,
  type CreateInviteArg,
  type ReminderArg,
  type SaveExpenseArg,
  type SettlementArg,
} from './writes'

const LIST = { type: 'Group' as const, id: 'LIST' }

export interface GroupArg {
  /** The signed-in user, so listener errors after sign-out stay quiet. */
  uid: string
  groupId: string
}

/** Activity entries shown per group (newest first). */
export const ACTIVITY_LIMIT = 100

const byName = (a: Group, b: Group) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id)

const groupTag = (groupId: string) => ({ type: 'Group' as const, id: groupId })

export const groupsApi = api.injectEndpoints({
  endpoints: (build) => ({
    /** Live list of the groups the user belongs to. */
    getGroups: build.query<Group[], string>({
      ...collectionListener({
        label: 'groups',
        uidOf: (uid: string) => uid,
        schema: groupSchema,
        query: (uid, db) => query(groupsCol(db), where('memberIds', 'array-contains', uid)),
        sort: byName,
      }),
      providesTags: (result) => [LIST, ...(result ?? []).map((g) => groupTag(g.id))],
    }),

    /** One group, live. Fails with permission denied for anyone who isn't a member. */
    getGroup: build.query<Group | null, GroupArg>({
      ...docListener({
        label: 'group',
        deniedMeansGone: true,
        uidOf: (arg: GroupArg) => arg.uid,
        schema: groupSchema,
        doc: (arg, db) => groupRef(db, arg.groupId),
      }),
      // Tagged even on error, so joining refetches a group that was unreadable a moment ago.
      providesTags: (_r, _e, arg) => [groupTag(arg.groupId)],
    }),

    getGroupExpenses: build.query<GroupExpense[], GroupArg>({
      ...collectionListener({
        label: 'group expenses',
        deniedMeansGone: true,
        uidOf: (arg: GroupArg) => arg.uid,
        schema: groupExpenseSchema,
        query: (arg, db) => query(expensesCol(db, arg.groupId), orderBy('date', 'desc')),
      }),
      providesTags: (_r, _e, arg) => [{ type: 'GroupExpense', id: arg.groupId }],
    }),

    getGroupSettlements: build.query<Settlement[], GroupArg>({
      ...collectionListener({
        label: 'settlements',
        deniedMeansGone: true,
        uidOf: (arg: GroupArg) => arg.uid,
        schema: settlementSchema,
        query: (arg, db) => query(settlementsCol(db, arg.groupId), orderBy('date', 'desc')),
      }),
      providesTags: (_r, _e, arg) => [{ type: 'Settlement', id: arg.groupId }],
    }),

    getGroupActivity: build.query<Activity[], GroupArg>({
      ...collectionListener({
        label: 'activity',
        deniedMeansGone: true,
        uidOf: (arg: GroupArg) => arg.uid,
        schema: activitySchema,
        query: (arg, db) =>
          query(activityCol(db, arg.groupId), orderBy('createdAt', 'desc'), limit(ACTIVITY_LIMIT)),
      }),
    }),

    /** One read of an invite (anyone with the token may read it). Null when it doesn't exist. */
    getInvite: build.query<Invite | null, string>({
      async queryFn(token) {
        try {
          const snap = await getDoc(inviteRef(getFirebase().db, token))
          if (!snap.exists()) return { data: null }
          const parsed = parseSnapshot(snap, inviteSchema)
          return parsed.ok ? { data: parsed.value } : { error: 'This invite has unexpected data.' }
        } catch (error) {
          return { error: firestoreErrorMessage(error) }
        }
      },
      keepUnusedDataFor: 0,
    }),

    createGroup: build.mutation<{ id: string }, { actor: Actor; values: GroupFormValues }>({
      queryFn: ({ actor, values }, { dispatch }) =>
        firestoreWrite(dispatch, 'Could not create the group', () => {
          const { groupId, commit } = createGroup(getFirebase().db, actor, values)
          return { commit, result: { id: groupId } }
        }),
    }),

    updateGroupSettings: build.mutation<
      null,
      {
        actor: Actor
        groupId: string
        changes: Partial<Pick<Group, 'name' | 'emoji' | 'simplifyDebts'>>
        summary: string
      }
    >({
      queryFn: ({ actor, groupId, changes, summary }, { dispatch }) =>
        firestoreWrite(dispatch, 'Could not save the group', () => ({
          commit: updateGroupSettings(getFirebase().db, actor, groupId, changes, summary),
          result: null,
        })),
    }),

    createInvite: build.mutation<null, CreateInviteArg>({
      queryFn: (arg, { dispatch }) =>
        firestoreWrite(dispatch, 'Could not create the invite', () => ({
          commit: createInvite(getFirebase().db, arg),
          result: null,
        })),
    }),

    revokeEmailInvite: build.mutation<null, { groupId: string; email: string }>({
      queryFn: ({ groupId, email }, { dispatch }) =>
        firestoreWrite(dispatch, 'Could not cancel the invite', () => ({
          commit: revokeEmailInvite(getFirebase().db, groupId, email),
          result: null,
        })),
    }),

    /** A Firestore transaction, so it needs a connection (it can't be queued offline). */
    joinGroup: build.mutation<
      { groupId: string },
      { actor: Actor & { emailVerified: boolean }; token: string }
    >({
      async queryFn({ actor, token }) {
        try {
          return { data: await joinGroup(getFirebase().db, actor, token) }
        } catch (error) {
          console.error('[groups] join failed', error)
          return { error: firestoreErrorMessage(error) }
        }
      },
      invalidatesTags: (result) => (result ? [groupTag(result.groupId)] : []),
    }),

    leaveGroup: build.mutation<
      null,
      { actor: Actor; group: Pick<Group, 'id' | 'memberIds' | 'ownerId'> }
    >({
      queryFn: ({ actor, group }, { dispatch }) =>
        firestoreWrite(dispatch, 'Could not leave the group', () => ({
          commit: leaveGroup(getFirebase().db, actor, group),
          result: null,
        })),
    }),

    removeMember: build.mutation<
      null,
      { actor: Actor; groupId: string; target: { uid: string; displayName: string } }
    >({
      queryFn: ({ actor, groupId, target }, { dispatch }) =>
        firestoreWrite(dispatch, 'Could not remove the member', () => ({
          commit: removeMember(getFirebase().db, actor, groupId, target),
          result: null,
        })),
    }),

    saveGroupExpense: build.mutation<{ id: string; personalId: string | null }, SaveExpenseArg>({
      queryFn: (arg, { dispatch }) =>
        firestoreWrite(dispatch, 'Could not save the expense', () => {
          const { expenseId, personalId, commit } = saveExpense(getFirebase().db, arg)
          return { commit, result: { id: expenseId, personalId } }
        }),
    }),

    deleteGroupExpense: build.mutation<
      null,
      { actor: Actor; groupId: string; expenseId: string; summary: string }
    >({
      queryFn: ({ actor, groupId, expenseId, summary }, { dispatch }) =>
        firestoreWrite(dispatch, 'Could not delete the expense', () => ({
          commit: deleteExpense(getFirebase().db, actor, groupId, expenseId, summary),
          result: null,
        })),
    }),

    recordSettlement: build.mutation<{ id: string }, SettlementArg>({
      queryFn: (arg, { dispatch }) =>
        firestoreWrite(dispatch, 'Could not record the payment', () => {
          const { settlementId, commit } = recordSettlement(getFirebase().db, arg)
          return { commit, result: { id: settlementId } }
        }),
    }),

    deleteSettlement: build.mutation<
      null,
      { actor: Actor; groupId: string; settlementId: string; summary: string }
    >({
      queryFn: ({ actor, groupId, settlementId, summary }, { dispatch }) =>
        firestoreWrite(dispatch, 'Could not delete the payment', () => ({
          commit: deleteSettlement(getFirebase().db, actor, groupId, settlementId, summary),
          result: null,
        })),
    }),

    /**
     * Leaves a reminder in the debtor's notifications. Waits for the server, because the rules
     * refuse a second reminder on the same day and that should be reported, not queued.
     */
    sendReminder: build.mutation<null, ReminderArg>({
      async queryFn(arg) {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          return { error: "You're offline. Send the reminder when you're back online." }
        }
        try {
          await sendReminder(getFirebase().db, arg)
          return { data: null }
        } catch (error) {
          const code = (error as { code?: string }).code
          if (code === 'permission-denied') {
            return { error: 'You already reminded them today. Try again tomorrow.' }
          }
          return { error: firestoreErrorMessage(error) }
        }
      },
    }),
  }),
})

export const {
  useGetGroupsQuery,
  useGetGroupQuery,
  useGetGroupExpensesQuery,
  useGetGroupSettlementsQuery,
  useGetGroupActivityQuery,
  useGetInviteQuery,
  useCreateGroupMutation,
  useUpdateGroupSettingsMutation,
  useCreateInviteMutation,
  useRevokeEmailInviteMutation,
  useJoinGroupMutation,
  useLeaveGroupMutation,
  useRemoveMemberMutation,
  useSaveGroupExpenseMutation,
  useDeleteGroupExpenseMutation,
  useRecordSettlementMutation,
  useDeleteSettlementMutation,
  useSendReminderMutation,
} = groupsApi
