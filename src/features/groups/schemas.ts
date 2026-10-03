import { z } from 'zod'
import { attachmentsField } from '@/features/receipts/schemas'
import { currencyProblem } from '@/features/transactions/schemas'
import { CURRENCY_CODE } from '@/utils/currency'
import { evaluateAmount } from '@/utils/calc'
import { convertMinor, formatMoney, isValidRate } from '@/utils/money'
import {
  SPLIT_TYPES,
  computePaidBy,
  computeShares,
  percentToHundredths,
  type PaidOutcome,
  type SplitOutcome,
  type SplitType,
} from './split'

export const GROUP_NAME_MAX = 40
export const DESCRIPTION_MAX = 100
export const GROUP_NOTE_MAX = 500
export const SETTLEMENT_NOTE_MAX = 200
export const ACTIVITY_SUMMARY_MAX = 200
/** Most members a group can have (the rules check expense totals entry by entry, up to this). */
export const GROUP_MEMBER_MAX = 20
export const INVITED_EMAILS_MAX = 50
/** Invites stop working this many days after they are created. */
export const INVITE_DAYS = 7

export const GROUP_EMOJIS = [
  '👥',
  '🏠',
  '✈️',
  '🏖️',
  '🍕',
  '🍻',
  '🎉',
  '🚗',
  '⚽',
  '🎓',
  '💼',
  '🛒',
  '🏕️',
  '🎵',
  '🎮',
  '❤️',
] as const
export const DEFAULT_GROUP_EMOJI = '👥'

/** Group expenses use a fixed list of categories, because members have different personal ones. */
export const GROUP_CATEGORIES = [
  { id: 'general', label: 'General' },
  { id: 'food', label: 'Food & drink' },
  { id: 'groceries', label: 'Groceries' },
  { id: 'transport', label: 'Transport' },
  { id: 'travel', label: 'Travel' },
  { id: 'accommodation', label: 'Accommodation' },
  { id: 'rent', label: 'Rent' },
  { id: 'utilities', label: 'Utilities' },
  { id: 'entertainment', label: 'Entertainment' },
  { id: 'shopping', label: 'Shopping' },
  { id: 'other', label: 'Other' },
] as const
export type GroupCategoryId = (typeof GROUP_CATEGORIES)[number]['id']

export function groupCategoryLabel(id: string | undefined): string | null {
  return GROUP_CATEGORIES.find((c) => c.id === id)?.label ?? null
}

export const MEMBER_ROLES = ['owner', 'member', 'former'] as const
export type MemberRole = (typeof MEMBER_ROLES)[number]

export const ACTIVITY_ACTIONS = [
  'group-created',
  'group-updated',
  'member-joined',
  'member-left',
  'member-removed',
  'expense-added',
  'expense-edited',
  'expense-deleted',
  'settlement-added',
  'settlement-deleted',
] as const
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number]

const positiveMinor = z
  .number()
  .int()
  .positive()
  .refine(Number.isSafeInteger, 'Amount is too large')

const minorMap = z.record(z.string(), z.number().int().nonnegative().refine(Number.isSafeInteger))
const sum = (map: Record<string, number>) => Object.values(map).reduce((a, b) => a + b, 0)

const stamps = {
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.string(),
}

export const groupMemberSchema = z.object({
  displayName: z.string().catch('Member'),
  email: z.string().catch(''),
  role: z.enum(MEMBER_ROLES).catch('member'),
  /** The invite token a member joined with (absent for the creator). */
  joinedVia: z.string().optional(),
})

/** groups/{groupId} as read from Firestore. Former members stay in `members` for history. */
export const groupSchema = z.object({
  name: z.string(),
  emoji: z.string().catch(DEFAULT_GROUP_EMOJI),
  currency: z.string().regex(CURRENCY_CODE),
  memberIds: z.array(z.string()),
  members: z.record(z.string(), groupMemberSchema),
  ownerId: z.string(),
  invitedEmails: z.array(z.string()).catch([]),
  simplifyDebts: z.boolean().catch(false),
  ...stamps,
})

export type GroupDoc = z.output<typeof groupSchema>
export type GroupMember = z.output<typeof groupMemberSchema>

/** groups/{groupId}/expenses/{id}. Invariant: sum(paidBy) == amount == sum(shares). */
export const groupExpenseSchema = z
  .object({
    description: z.string(),
    amount: positiveMinor,
    currency: z.string().regex(CURRENCY_CODE),
    date: z.string(),
    categoryId: z.string().optional(),
    paidBy: minorMap,
    splitType: z.enum(SPLIT_TYPES),
    splitInput: z.record(z.string(), z.number().nonnegative()),
    shares: minorMap,
    note: z.string().catch(''),
    attachments: attachmentsField,
    ...stamps,
  })
  .refine((e) => sum(e.paidBy) === e.amount && sum(e.shares) === e.amount, {
    message: 'paid and shares must add up to the amount',
  })

export type GroupExpenseDoc = z.output<typeof groupExpenseSchema>

export const settlementSchema = z.object({
  fromUid: z.string(),
  toUid: z.string(),
  amount: positiveMinor,
  date: z.string(),
  note: z.string().catch(''),
  ...stamps,
})

export type SettlementDoc = z.output<typeof settlementSchema>

export const activitySchema = z.object({
  actorUid: z.string(),
  action: z.string(),
  summary: z.string(),
  ...stamps,
})

export type ActivityDoc = z.output<typeof activitySchema>

/** invites/{token}. `invitedEmail` null means a link invite anyone with the link can use. */
export const inviteSchema = z.object({
  groupId: z.string(),
  groupName: z.string(),
  groupEmoji: z.string().catch(DEFAULT_GROUP_EMOJI),
  invitedEmail: z.string().nullable(),
  invitedBy: z.string(),
  invitedByName: z.string().catch(''),
  expiresAt: z.string(),
  acceptedBy: z.string().optional(),
  ...stamps,
})

export type InviteDoc = z.output<typeof inviteSchema>

// ---------------------------------------------------------------------------------------------
// Forms

export const groupFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Enter a name')
    .max(GROUP_NAME_MAX, `Use at most ${GROUP_NAME_MAX} characters`),
  currency: z.string().regex(CURRENCY_CODE, 'Choose a currency'),
  emoji: z.string().min(1, 'Choose a cover emoji'),
})

export type GroupFormValues = z.output<typeof groupFormSchema>

const EMAIL = z.email('Enter a valid email address')

export const inviteEmailSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(EMAIL)
    .refine((v) => v.length <= 120, 'Use at most 120 characters'),
})

/**
 * Add/edit group expense form. Amount fields are text (calculator expressions allowed) and
 * become minor units of the group currency; percentages and share weights are plain numbers.
 */
export const groupExpenseFormBase = z.object({
  description: z
    .string()
    .trim()
    .min(1, 'Enter a description')
    .max(DESCRIPTION_MAX, `Use at most ${DESCRIPTION_MAX} characters`),
  amount: z.string().trim(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date'),
  categoryId: z.string(),
  paidMode: z.enum(['single', 'multiple']),
  payer: z.string(),
  paid: z.record(z.string(), z.string()),
  splitType: z.enum(SPLIT_TYPES),
  included: z.record(z.string(), z.boolean()),
  exact: z.record(z.string(), z.string()),
  percent: z.record(z.string(), z.string()),
  shares: z.record(z.string(), z.string()),
  note: z.string().trim().max(GROUP_NOTE_MAX, `Use at most ${GROUP_NOTE_MAX} characters`),
  addToPersonal: z.boolean(),
  personalAccountId: z.string(),
  personalCategoryId: z.string(),
  fxRate: z.string().trim(),
})

export type GroupExpenseFormInput = z.input<typeof groupExpenseFormBase>

export interface GroupExpenseFormContext {
  currency: string
  /** Current members, in group order (decides who gets remainders). */
  memberOrder: readonly string[]
  /** The signed-in user. */
  uid: string
  baseCurrency: string
  accountCurrency: (accountId: string) => string | undefined
}

export interface PersonalShareValues {
  accountId: string
  categoryId?: string
  amount: number
  currency: string
  fxRateToBase: number
  baseAmount: number
}

export interface GroupExpenseFormValues {
  description: string
  amount: number
  currency: string
  /** yyyy-MM-dd in the user's timezone. */
  date: string
  categoryId?: string
  note: string
  paidBy: Record<string, number>
  splitType: SplitType
  splitInput: Record<string, number>
  shares: Record<string, number>
  /** Set when "also add my share to my personal transactions" is on. */
  personal?: PersonalShareValues
}

function parseMinorOrZero(text: string | undefined, currency: string): number | null {
  const trimmed = (text ?? '').trim()
  if (trimmed === '') return 0
  try {
    return evaluateAmount(trimmed, currency)
  } catch {
    return null
  }
}

function parseNumberOrZero(text: string | undefined): number | null {
  const trimmed = (text ?? '').trim()
  if (trimmed === '') return 0
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null
  return Number(trimmed)
}

export interface SplitPreview {
  /** The amount in minor units, or null while it isn't valid. */
  amount: number | null
  amountError: string | null
  paid: PaidOutcome | null
  /** The member whose input couldn't be read, for pointing the error at it. */
  paidInvalid: string | null
  split: SplitOutcome | null
  splitInvalid: string | null
  splitInput: Record<string, number>
}

/** Reads the form's money and split inputs. Used for live feedback and on submit. */
export function previewSplit(
  v: GroupExpenseFormInput,
  ctx: Pick<GroupExpenseFormContext, 'currency' | 'memberOrder'>,
): SplitPreview {
  const preview: SplitPreview = {
    amount: null,
    amountError: null,
    paid: null,
    paidInvalid: null,
    split: null,
    splitInvalid: null,
    splitInput: {},
  }
  try {
    const amount = evaluateAmount(v.amount, ctx.currency)
    if (amount <= 0) preview.amountError = 'Enter an amount greater than zero'
    else preview.amount = amount
  } catch (error) {
    preview.amountError = v.amount.trim() === '' ? 'Enter an amount' : (error as Error).message
  }
  const amount = preview.amount
  if (amount === null) return preview

  // Who paid.
  if (v.paidMode === 'single') {
    preview.paid = v.payer
      ? computePaidBy(amount, { [v.payer]: amount })
      : { ok: false, reason: 'none' }
  } else {
    const payers: Record<string, number> = {}
    for (const uid of ctx.memberOrder) {
      const value = parseMinorOrZero(v.paid[uid], ctx.currency)
      if (value === null || value < 0) {
        preview.paidInvalid = uid
        break
      }
      payers[uid] = value
    }
    preview.paid = preview.paidInvalid
      ? { ok: false, reason: 'invalid' }
      : computePaidBy(amount, payers)
  }

  // How it's split.
  const input: Record<string, number> = {}
  for (const uid of ctx.memberOrder) {
    let value: number | null
    switch (v.splitType) {
      case 'equal':
        value = v.included[uid] ? 1 : 0
        break
      case 'exact':
        value = parseMinorOrZero(v.exact[uid], ctx.currency)
        break
      case 'percent':
        value = parseNumberOrZero(v.percent[uid])
        if (value !== null && percentToHundredths(value) === null) value = null
        break
      case 'shares':
        value = parseNumberOrZero(v.shares[uid])
        break
    }
    if (value === null || value < 0) {
      preview.splitInvalid = uid
      break
    }
    if (value > 0) input[uid] = value
  }
  preview.splitInput = input
  preview.split = preview.splitInvalid
    ? { ok: false, reason: 'invalid' }
    : computeShares(amount, v.splitType, input, ctx.memberOrder)
  return preview
}

/** "₹100.00 left to assign" / "₹100.00 too much", for a total that doesn't match. */
export function moneyDifferenceMessage(difference: number, currency: string, locale?: string) {
  const text = formatMoney(Math.abs(difference), currency, locale)
  return difference < 0 ? `${text} left to assign` : `${text} too much`
}

export function percentDifferenceMessage(differenceHundredths: number) {
  const text = `${(Math.abs(differenceHundredths) / 100).toString()}%`
  return differenceHundredths < 0 ? `${text} left to assign` : `${text} too much`
}

export function paidProblem(paid: PaidOutcome | null, currency: string, locale?: string) {
  if (!paid || paid.ok) return null
  if (paid.reason === 'none') return 'Choose who paid'
  if (paid.reason === 'invalid') return 'Enter valid amounts for who paid'
  return `Paid amounts must add up to the total: ${moneyDifferenceMessage(paid.difference ?? 0, currency, locale)}`
}

export function splitProblem(
  split: SplitOutcome | null,
  splitType: SplitType,
  currency: string,
  locale?: string,
) {
  if (!split || split.ok) return null
  if (split.reason === 'none') {
    return splitType === 'equal' ? 'Choose at least one person' : 'Give at least one person a share'
  }
  if (split.reason === 'invalid') {
    return splitType === 'percent'
      ? 'Enter percentages with up to 2 decimal places'
      : splitType === 'shares'
        ? 'Enter share numbers like 2 or 1.5'
        : 'Enter valid amounts'
  }
  return splitType === 'percent'
    ? `Percentages must add up to 100%: ${percentDifferenceMessage(split.difference ?? 0)}`
    : `Amounts must add up to the total: ${moneyDifferenceMessage(split.difference ?? 0, currency, locale)}`
}

export function groupExpenseFormSchema(ctx: GroupExpenseFormContext) {
  return groupExpenseFormBase.transform((v, zctx): GroupExpenseFormValues => {
    const fail = (path: string, message: string) => {
      zctx.addIssue({ code: 'custom', path: [path], message })
      return z.NEVER
    }
    const preview = previewSplit(v, ctx)
    if (preview.amountError || preview.amount === null) {
      return fail('amount', preview.amountError ?? 'Enter an amount')
    }
    const amount = preview.amount
    const paidMessage = paidProblem(preview.paid, ctx.currency)
    if (paidMessage || !preview.paid?.ok) {
      return fail(v.paidMode === 'single' ? 'payer' : 'paid', paidMessage ?? 'Choose who paid')
    }
    const splitMessage = splitProblem(preview.split, v.splitType, ctx.currency)
    if (splitMessage || !preview.split?.ok) {
      return fail('splitType', splitMessage ?? 'Check the split')
    }
    const shares = preview.split.shares

    let personal: PersonalShareValues | undefined
    if (v.addToPersonal) {
      const myShare = shares[ctx.uid] ?? 0
      if (myShare <= 0) return fail('addToPersonal', "You don't have a share in this expense")
      if (!v.personalAccountId) return fail('personalAccountId', 'Choose an account')
      const problem = currencyProblem(
        ctx.currency,
        ctx.accountCurrency(v.personalAccountId),
        ctx.baseCurrency,
      )
      if (problem) return fail('personalAccountId', problem)
      let fxRateToBase = 1
      let baseAmount = myShare
      if (ctx.currency !== ctx.baseCurrency) {
        if (!isValidRate(v.fxRate)) {
          return fail('fxRate', `Enter how many ${ctx.baseCurrency} one ${ctx.currency} is worth`)
        }
        fxRateToBase = Number(v.fxRate)
        baseAmount = convertMinor(myShare, ctx.currency, ctx.baseCurrency, v.fxRate)
        if (baseAmount <= 0) return fail('fxRate', 'The converted amount rounds to zero')
      }
      personal = {
        accountId: v.personalAccountId,
        ...(v.personalCategoryId ? { categoryId: v.personalCategoryId } : {}),
        amount: myShare,
        currency: ctx.currency,
        fxRateToBase,
        baseAmount,
      }
    }

    return {
      description: v.description,
      amount,
      currency: ctx.currency,
      date: v.date,
      ...(v.categoryId ? { categoryId: v.categoryId } : {}),
      note: v.note,
      paidBy: preview.paid.paidBy,
      splitType: v.splitType,
      splitInput: preview.splitInput,
      shares,
      ...(personal ? { personal } : {}),
    }
  })
}

/** Record a payment from one member to another. */
export function settlementFormSchema(currency: string) {
  return z
    .object({
      fromUid: z.string().min(1, 'Choose who paid'),
      toUid: z.string().min(1, 'Choose who was paid'),
      amount: z.string().trim(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date'),
      note: z
        .string()
        .trim()
        .max(SETTLEMENT_NOTE_MAX, `Use at most ${SETTLEMENT_NOTE_MAX} characters`),
    })
    .transform((v, zctx) => {
      if (v.fromUid === v.toUid) {
        zctx.addIssue({ code: 'custom', path: ['toUid'], message: 'Choose two different people' })
        return z.NEVER
      }
      let amount: number
      try {
        amount = evaluateAmount(v.amount, currency)
      } catch (error) {
        zctx.addIssue({
          code: 'custom',
          path: ['amount'],
          message: v.amount === '' ? 'Enter an amount' : (error as Error).message,
        })
        return z.NEVER
      }
      if (amount <= 0) {
        zctx.addIssue({
          code: 'custom',
          path: ['amount'],
          message: 'Enter an amount greater than zero',
        })
        return z.NEVER
      }
      return { fromUid: v.fromUid, toUid: v.toUid, amount, date: v.date, note: v.note }
    })
}

export type SettlementFormInput = z.input<ReturnType<typeof settlementFormSchema>>
export type SettlementFormValues = z.output<ReturnType<typeof settlementFormSchema>>
