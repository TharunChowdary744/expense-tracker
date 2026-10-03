import { CreditCard } from 'lucide-react'
import { ColoredIcon } from '@/components/ColoredIcon'
import { EmptyState } from '@/components/ListStates'
import type { Category } from '@/features/categories/types'
import { formatMoney } from '@/utils/money'
import { describeRule } from '../engine'
import type { RecurringRule } from '../types'
import { ruleSchedule, subscriptionSummary } from '../utils'
import { ruleLabel } from './ruleLabel'

interface Props {
  rules: readonly RecurringRule[]
  categories: ReadonlyMap<string, Category>
  baseCurrency: string
  locale?: string
}

/** Active recurring expenses with their monthly and yearly cost. */
export function SubscriptionsView({ rules, categories, baseCurrency, locale }: Props) {
  const summary = subscriptionSummary(rules)
  const money = (v: number) => formatMoney(v, baseCurrency, locale)

  if (summary.items.length === 0) {
    return (
      <EmptyState
        icon={CreditCard}
        title="No active recurring expenses"
        description="Subscriptions and bills you set to repeat are totalled here. Paused and ended rules are left out."
      />
    )
  }

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border bg-card p-4">
          <dt className="text-sm text-muted-foreground">Per month</dt>
          <dd className="text-2xl font-semibold tabular-nums">{money(summary.monthly)}</dd>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <dt className="text-sm text-muted-foreground">Per year</dt>
          <dd className="text-2xl font-semibold tabular-nums">{money(summary.yearly)}</dd>
        </div>
      </dl>
      <p className="text-xs text-muted-foreground">
        {summary.items.length} active recurring expense{summary.items.length === 1 ? '' : 's'}, in
        your base currency. Daily and weekly costs use an average month (30.44 days).
      </p>
      <table className="w-full text-sm">
        <caption className="sr-only">Recurring expenses by monthly cost</caption>
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th scope="col" className="pb-2 font-medium">
              Expense
            </th>
            <th scope="col" className="pb-2 text-right font-medium">
              Monthly
            </th>
            <th scope="col" className="pb-2 text-right font-medium">
              Yearly
            </th>
          </tr>
        </thead>
        <tbody>
          {summary.items.map(({ rule, monthly, yearly }) => {
            const { title, icon, color } = ruleLabel(rule, categories)
            return (
              <tr key={rule.id} className="border-t">
                <td className="py-2.5">
                  <div className="flex items-center gap-3">
                    <ColoredIcon icon={icon} color={color} className="size-8" />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatMoney(rule.template.amount, rule.template.currency, locale)} ·{' '}
                        {describeRule(ruleSchedule(rule), locale).toLowerCase()}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="py-2.5 text-right tabular-nums">{money(monthly)}</td>
                <td className="py-2.5 text-right tabular-nums">{money(yearly)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
