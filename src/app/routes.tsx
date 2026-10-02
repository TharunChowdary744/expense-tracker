import type { RouteObject } from 'react-router'
import { AppLayout } from './layout/AppLayout'
import { PageSkeleton } from './PageSkeleton'
import { RouteError } from './RouteError'

/** Route table. Pages are lazy-loaded; AppLayout wraps the outlet in Suspense. */
export const routes: RouteObject[] = [
  {
    path: '/',
    Component: AppLayout,
    ErrorBoundary: RouteError,
    HydrateFallback: PageSkeleton,
    children: [
      {
        index: true,
        lazy: async () => ({
          Component: (await import('@/features/dashboard/pages/DashboardPage')).DashboardPage,
        }),
      },
      {
        path: 'transactions',
        lazy: async () => ({
          Component: (await import('@/features/transactions/pages/TransactionsPage'))
            .TransactionsPage,
        }),
      },
      {
        path: 'budgets',
        lazy: async () => ({
          Component: (await import('@/features/budgets/pages/BudgetsPage')).BudgetsPage,
        }),
      },
      {
        path: 'recurring',
        lazy: async () => ({
          Component: (await import('@/features/recurring/pages/RecurringPage')).RecurringPage,
        }),
      },
      {
        path: 'groups',
        lazy: async () => ({
          Component: (await import('@/features/groups/pages/GroupsPage')).GroupsPage,
        }),
      },
      {
        path: 'reports',
        lazy: async () => ({
          Component: (await import('@/features/reports/pages/ReportsPage')).ReportsPage,
        }),
      },
      {
        path: 'settings',
        lazy: async () => ({
          Component: (await import('@/features/settings/pages/SettingsPage')).SettingsPage,
        }),
      },
      {
        path: '*',
        lazy: async () => ({
          Component: (await import('./pages/NotFoundPage')).NotFoundPage,
        }),
      },
    ],
  },
]
