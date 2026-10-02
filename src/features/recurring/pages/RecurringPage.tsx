import { Repeat } from 'lucide-react'
import { PagePlaceholder } from '@/components/PagePlaceholder'

export function RecurringPage() {
  return (
    <PagePlaceholder
      title="Recurring"
      description="Repeating transactions and reminders will be managed here."
      icon={Repeat}
    />
  )
}
