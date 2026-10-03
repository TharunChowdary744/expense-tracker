import { zodResolver } from '@hookform/resolvers/zod'
import { useId, useMemo, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { FormMessage } from '@/components/form/FormMessage'
import { SelectField } from '@/components/form/SelectField'
import { TextField } from '@/components/form/TextField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import type { Account } from '@/features/accounts/types'
import { buildCategoryTree } from '@/features/categories/utils'
import type { Category } from '@/features/categories/types'
import { calendarDate } from '@/utils/dates'
import { cn } from '@/utils/cn'
import { formatMoney, fromMinor } from '@/utils/money'
import {
  DESCRIPTION_MAX,
  GROUP_CATEGORIES,
  groupExpenseFormSchema,
  paidProblem,
  previewSplit,
  splitProblem,
  type GroupExpenseFormInput,
  type GroupExpenseFormValues,
} from '../schemas'
import { SPLIT_TYPES, SPLIT_TYPE_LABELS, sumMap } from '../split'
import type { Group, GroupExpense } from '../types'
import { memberLabel } from '../utils'

interface Props {
  group: Group
  /** Members shown in the form, in group order (current members, plus any in `expense`). */
  memberIds: readonly string[]
  uid: string
  expense?: GroupExpense
  accounts: readonly Account[]
  categories: readonly Category[]
  baseCurrency: string
  locale: string
  /** Resolves to an error message, or null on success. */
  onSubmit: (values: GroupExpenseFormValues) => Promise<string | null>
  onDelete?: () => void
  onCancel: () => void
}

function defaults(
  group: Group,
  memberIds: readonly string[],
  uid: string,
  expense: GroupExpense | undefined,
  accounts: readonly Account[],
): GroupExpenseFormInput {
  const cur = group.currency
  const all = (value: string) => Object.fromEntries(memberIds.map((id) => [id, value]))
  const personalAccount =
    accounts.find((a) => !a.archived && a.currency === cur) ?? accounts.find((a) => !a.archived)
  const base: GroupExpenseFormInput = {
    description: '',
    amount: '',
    date: calendarDate(new Date()),
    categoryId: '',
    paidMode: 'single',
    payer: memberIds.includes(uid) ? uid : (memberIds[0] ?? ''),
    paid: all(''),
    splitType: 'equal',
    included: Object.fromEntries(memberIds.map((id) => [id, true])),
    exact: all(''),
    percent: all(''),
    shares: all('1'),
    note: '',
    addToPersonal: false,
    personalAccountId: personalAccount?.id ?? '',
    personalCategoryId: '',
    fxRate: '',
  }
  if (!expense) return base
  const payers = Object.keys(expense.paidBy)
  const input = (map: Record<string, string>, toText: (v: number) => string) => ({
    ...map,
    ...Object.fromEntries(Object.entries(expense.splitInput).map(([id, v]) => [id, toText(v)])),
  })
  return {
    ...base,
    description: expense.description,
    amount: fromMinor(expense.amount, cur),
    date: calendarDate(expense.date),
    categoryId: expense.categoryId ?? '',
    paidMode: payers.length === 1 ? 'single' : 'multiple',
    payer: payers.length === 1 ? (payers[0] as string) : base.payer,
    paid: {
      ...base.paid,
      ...Object.fromEntries(
        Object.entries(expense.paidBy).map(([id, v]) => [id, fromMinor(v, cur)]),
      ),
    },
    splitType: expense.splitType,
    included:
      expense.splitType === 'equal'
        ? Object.fromEntries(memberIds.map((id) => [id, (expense.splitInput[id] ?? 0) > 0]))
        : base.included,
    exact: expense.splitType === 'exact' ? input(all(''), (v) => fromMinor(v, cur)) : base.exact,
    percent: expense.splitType === 'percent' ? input(all(''), String) : base.percent,
    shares: expense.splitType === 'shares' ? input(all('0'), String) : base.shares,
    note: expense.note,
  }
}

export function ExpenseForm({
  group,
  memberIds,
  uid,
  expense,
  accounts,
  categories,
  baseCurrency,
  locale,
  onSubmit,
  onDelete,
  onCancel,
}: Props) {
  const ids = useId()
  const [error, setError] = useState<string | null>(null)
  const currency = group.currency
  const accountCurrency = useMemo(() => {
    const map = new Map(accounts.map((a) => [a.id, a.currency]))
    return (id: string) => map.get(id)
  }, [accounts])
  const schema = useMemo(
    () =>
      groupExpenseFormSchema({
        currency,
        memberOrder: memberIds,
        uid,
        baseCurrency,
        accountCurrency,
      }),
    [currency, memberIds, uid, baseCurrency, accountCurrency],
  )
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting, isSubmitted },
  } = useForm<GroupExpenseFormInput, unknown, GroupExpenseFormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults(group, memberIds, uid, expense, accounts),
  })
  const values = useWatch({ control }) as GroupExpenseFormInput
  const preview = useMemo(
    () => previewSplit(values, { currency, memberOrder: memberIds }),
    [values, currency, memberIds],
  )
  const money = (minor: number) => formatMoney(minor, currency, locale)
  const name = (id: string) => memberLabel(group, id, uid)
  const tree = useMemo(() => buildCategoryTree(categories, 'expense'), [categories])
  const activeAccounts = accounts.filter((a) => !a.archived)

  const paidText =
    preview.amount === null || values.paidMode === 'single'
      ? null
      : (paidProblem(preview.paid, currency, locale) ?? `Adds up to ${money(preview.amount)}`)
  const splitText =
    preview.amount === null
      ? null
      : (splitProblem(preview.split, values.splitType, currency, locale) ??
        `Adds up to ${money(preview.amount)}`)
  // `paid` is a map keyed by uid, so its own error sits beside the per-member ones.
  const paidError = (errors.paid as { message?: string } | undefined)?.message
  const splitOk = preview.split?.ok === true
  const shares = preview.split?.ok ? preview.split.shares : {}
  const myShare = shares[uid] ?? 0

  async function submit(v: GroupExpenseFormValues) {
    setError(null)
    const message = await onSubmit(v)
    if (message) setError(message)
  }

  return (
    <form onSubmit={handleSubmit(submit)} noValidate className="space-y-5">
      {error && <FormMessage kind="error">{error}</FormMessage>}
      <TextField
        label="Description"
        maxLength={DESCRIPTION_MAX}
        autoComplete="off"
        placeholder="e.g. Dinner at Thalassa"
        error={errors.description?.message}
        {...register('description')}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label={`Amount (${currency})`}
          inputMode="decimal"
          autoComplete="off"
          placeholder="1000"
          error={errors.amount?.message}
          {...register('amount')}
        />
        <TextField label="Date" type="date" error={errors.date?.message} {...register('date')} />
      </div>
      <SelectField label="Category" {...register('categoryId')}>
        <option value="">None</option>
        {GROUP_CATEGORIES.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </SelectField>

      {/* Who paid */}
      <fieldset className="space-y-2 rounded-md border p-3">
        <legend className="px-1 text-sm font-medium">Paid by</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              value="single"
              className="accent-primary"
              {...register('paidMode')}
            />
            One person
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              value="multiple"
              className="accent-primary"
              {...register('paidMode')}
            />
            Several people
          </label>
        </div>
        {values.paidMode === 'single' ? (
          <SelectField label="Who paid" error={errors.payer?.message} {...register('payer')}>
            {memberIds.map((id) => (
              <option key={id} value={id}>
                {name(id)}
              </option>
            ))}
          </SelectField>
        ) : (
          <div className="space-y-2">
            {memberIds.map((id) => (
              <div key={id} className="flex items-center gap-3">
                <label htmlFor={`${ids}-paid-${id}`} className="flex-1 truncate text-sm">
                  {name(id)}
                </label>
                <Input
                  id={`${ids}-paid-${id}`}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0"
                  className="w-32 text-right"
                  aria-invalid={preview.paidInvalid === id ? true : undefined}
                  {...register(`paid.${id}`)}
                />
              </div>
            ))}
            {paidText && (
              <p
                aria-live="polite"
                className={cn(
                  'text-xs',
                  preview.paid?.ok ? 'text-muted-foreground' : 'text-destructive',
                )}
              >
                {paidText}
              </p>
            )}
            {isSubmitted && paidError && !paidText && (
              <p className="text-xs text-destructive">{paidError}</p>
            )}
          </div>
        )}
      </fieldset>

      {/* How it's split */}
      <fieldset
        className="space-y-3 rounded-md border p-3"
        aria-describedby={splitText ? `${ids}-split-status` : undefined}
      >
        <legend className="px-1 text-sm font-medium">Split</legend>
        <div role="radiogroup" aria-label="Split type" className="flex flex-wrap gap-1.5">
          {SPLIT_TYPES.map((type) => (
            <label
              key={type}
              className={cn(
                'cursor-pointer rounded-md border px-3 py-1.5 text-sm has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50',
                values.splitType === type ? 'border-primary bg-primary/10 font-medium' : '',
              )}
            >
              <input type="radio" value={type} className="sr-only" {...register('splitType')} />
              {SPLIT_TYPE_LABELS[type]}
            </label>
          ))}
        </div>
        <ul className="space-y-2" aria-label="Shares">
          {memberIds.map((id) => {
            const share = shares[id] ?? 0
            const field =
              values.splitType === 'exact'
                ? 'exact'
                : values.splitType === 'percent'
                  ? 'percent'
                  : values.splitType === 'shares'
                    ? 'shares'
                    : null
            return (
              <li key={id} className="flex items-center gap-3">
                {values.splitType === 'equal' ? (
                  <label className="flex flex-1 items-center gap-2 truncate text-sm">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      {...register(`included.${id}`)}
                    />
                    {name(id)}
                  </label>
                ) : (
                  <label htmlFor={`${ids}-${field}-${id}`} className="flex-1 truncate text-sm">
                    {name(id)}
                  </label>
                )}
                {field && (
                  <div className="flex items-center gap-1">
                    <Input
                      id={`${ids}-${field}-${id}`}
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0"
                      className="w-24 text-right"
                      aria-invalid={preview.splitInvalid === id ? true : undefined}
                      {...register(`${field}.${id}`)}
                    />
                    <span className="w-4 text-xs text-muted-foreground" aria-hidden>
                      {field === 'percent' ? '%' : field === 'shares' ? '×' : ''}
                    </span>
                  </div>
                )}
                <span
                  className="w-24 text-right text-sm text-muted-foreground tabular-nums"
                  aria-label={`${name(id)}'s share`}
                >
                  {splitOk ? money(share) : '–'}
                </span>
              </li>
            )
          })}
        </ul>
        {splitText && (
          <p
            id={`${ids}-split-status`}
            aria-live="polite"
            className={cn('text-xs', splitOk ? 'text-muted-foreground' : 'text-destructive')}
          >
            {splitText}
            {splitOk && preview.amount !== null && sumMap(shares) === preview.amount ? ' ✓' : ''}
          </p>
        )}
      </fieldset>

      <TextField
        label="Note"
        autoComplete="off"
        error={errors.note?.message}
        {...register('note')}
      />

      {!expense && (
        <div className="space-y-3 rounded-md border p-3">
          <Controller
            control={control}
            name="addToPersonal"
            render={({ field }) => (
              <div className="flex items-start gap-3">
                <Switch
                  id={`${ids}-personal`}
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  aria-describedby={`${ids}-personal-hint`}
                  className="mt-0.5"
                />
                <div>
                  <label htmlFor={`${ids}-personal`} className="text-sm font-medium">
                    Also add my share to my personal transactions
                  </label>
                  <p id={`${ids}-personal-hint`} className="text-xs text-muted-foreground">
                    {myShare > 0
                      ? `Records an expense of ${money(myShare)} in one of your accounts, linked to this group expense.`
                      : 'Records your share as a personal expense, linked to this group expense.'}
                  </p>
                  {errors.addToPersonal?.message && (
                    <p className="text-xs text-destructive">{errors.addToPersonal.message}</p>
                  )}
                </div>
              </div>
            )}
          />
          {values.addToPersonal && (
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Account"
                error={errors.personalAccountId?.message}
                {...register('personalAccountId')}
              >
                <option value="">Choose an account</option>
                {activeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </option>
                ))}
              </SelectField>
              <SelectField label="Personal category" {...register('personalCategoryId')}>
                <option value="">None</option>
                {tree.flatMap(({ category, children }) => [
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>,
                  ...children.map((child) => (
                    <option key={child.id} value={child.id}>
                      {`  ${child.name}`}
                    </option>
                  )),
                ])}
              </SelectField>
              {currency !== baseCurrency && (
                <TextField
                  label={`1 ${currency} in ${baseCurrency}`}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="83.25"
                  hint="Exchange rate for your personal records."
                  error={errors.fxRate?.message}
                  {...register('fxRate')}
                />
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        {onDelete ? (
          <Button type="button" variant="ghost" className="text-destructive" onClick={onDelete}>
            Delete
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : expense ? 'Save changes' : 'Add expense'}
          </Button>
        </div>
      </div>
      {isSubmitted && errors.splitType?.message && (
        <p role="alert" className="text-xs text-destructive">
          {errors.splitType.message}
        </p>
      )}
    </form>
  )
}
