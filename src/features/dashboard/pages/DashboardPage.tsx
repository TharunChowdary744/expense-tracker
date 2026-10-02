import { LayoutDashboard } from 'lucide-react'
import { PagePlaceholder } from '@/components/PagePlaceholder'

export function DashboardPage() {
  return (
    <PagePlaceholder
      title="Dashboard"
      description="Your balances, budgets and recent activity will appear here."
      icon={LayoutDashboard}
    />
  )
}
