import { ArrowLeftRight } from 'lucide-react'
import { PagePlaceholder } from '@/components/PagePlaceholder'

export function TransactionsPage() {
  return (
    <PagePlaceholder
      title="Transactions"
      description="Expenses, income and transfers will be listed here."
      icon={ArrowLeftRight}
    />
  )
}
