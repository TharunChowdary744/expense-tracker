import { LayoutDashboard } from 'lucide-react'
import { BillsDueWidget } from '@/features/recurring/components/BillsDueWidget'

export function DashboardPage() {
  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <BillsDueWidget />
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
        <LayoutDashboard className="size-10 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">
          Your balances, budgets and recent activity will appear here.
        </p>
      </div>
    </section>
  )
}
