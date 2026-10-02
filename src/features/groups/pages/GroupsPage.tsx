import { Users } from 'lucide-react'
import { PagePlaceholder } from '@/components/PagePlaceholder'

export function GroupsPage() {
  return (
    <PagePlaceholder
      title="Groups"
      description="Shared expenses and settle-up will live here."
      icon={Users}
    />
  )
}
