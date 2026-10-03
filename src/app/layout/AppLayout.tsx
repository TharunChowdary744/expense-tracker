import { Suspense } from 'react'
import { Outlet } from 'react-router'
import { useSettleReminders } from '@/features/groups/hooks/useSettleReminders'
import { useRecurringRunner } from '@/features/recurring/hooks/useRecurringRunner'
import { useQuickAddShortcut } from '@/features/transactions/hooks/useQuickAddShortcut'
import { GlobalDialogHost } from '@/features/ui/components/GlobalDialogHost'
import { Toaster } from '@/features/ui/components/Toaster'
import { PageSkeleton } from '../PageSkeleton'
import { BottomNav } from './BottomNav'
import { QuickAddButton } from './QuickAddButton'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

export function AppLayout() {
  useQuickAddShortcut()
  useRecurringRunner()
  useSettleReminders()
  return (
    <div className="min-h-dvh">
      <Sidebar />
      <div className="flex min-h-dvh flex-col md:pl-60">
        <TopBar />
        <main id="main" className="flex-1 p-4 pb-28 md:p-6 md:pb-28">
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <BottomNav />
      <QuickAddButton />
      <GlobalDialogHost />
      <Toaster />
    </div>
  )
}
