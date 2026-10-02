import { Target } from 'lucide-react'
import { PagePlaceholder } from '@/components/PagePlaceholder'

export function BudgetsPage() {
  return (
    <PagePlaceholder
      title="Budgets"
      description="Spending limits and alerts will be managed here."
      icon={Target}
    />
  )
}
