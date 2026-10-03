import type { Category } from '@/features/categories/types'
import { TRANSACTION_TYPE_LABELS } from '@/features/transactions/schemas'
import type { RecurringRule } from '../types'

const FALLBACK = { icon: 'receipt', color: '#64748b' }

/** Title and icon for a rule: its payee (or category, or type) and its category's icon. */
export function ruleLabel(
  rule: Pick<RecurringRule, 'template'>,
  categories: ReadonlyMap<string, Category>,
): { title: string; icon: string; color: string } {
  const t = rule.template
  const category = t.categoryId ? categories.get(t.categoryId) : undefined
  return {
    title: t.payee || category?.name || t.note || TRANSACTION_TYPE_LABELS[t.type],
    icon: category?.icon ?? FALLBACK.icon,
    color: category?.color ?? FALLBACK.color,
  }
}
