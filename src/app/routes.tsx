import type { RouteObject } from 'react-router'
import {
  ProtectedRoute,
  PublicOnlyRoute,
  UnverifiedAllowedRoute,
} from '@/features/auth/components/RouteGuards'
import { AppLayout } from './layout/AppLayout'
import { PageSkeleton } from './PageSkeleton'
import { RouteError } from './RouteError'

/** Route table. Pages are lazy-loaded; AppLayout wraps the outlet in Suspense. */
export const routes: RouteObject[] = [
  {
    Component: PublicOnlyRoute,
    ErrorBoundary: RouteError,
    HydrateFallback: PageSkeleton,
    children: [
      {
        path: 'sign-in',
        lazy: async () => ({
          Component: (await import('@/features/auth/pages/SignInPage')).SignInPage,
        }),
      },
      {
        path: 'sign-up',
        lazy: async () => ({
          Component: (await import('@/features/auth/pages/SignUpPage')).SignUpPage,
        }),
      },
      {
        path: 'forgot-password',
        lazy: async () => ({
          Component: (await import('@/features/auth/pages/ForgotPasswordPage')).ForgotPasswordPage,
        }),
      },
    ],
  },
  {
    Component: UnverifiedAllowedRoute,
    ErrorBoundary: RouteError,
    HydrateFallback: PageSkeleton,
    children: [
      {
        path: 'verify-email',
        lazy: async () => ({
          Component: (await import('@/features/auth/pages/VerifyEmailPage')).VerifyEmailPage,
        }),
      },
    ],
  },
  {
    Component: ProtectedRoute,
    ErrorBoundary: RouteError,
    HydrateFallback: PageSkeleton,
    children: [
      {
        path: '/',
        Component: AppLayout,
        ErrorBoundary: RouteError,
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
            path: 'accounts',
            lazy: async () => ({
              Component: (await import('@/features/accounts/pages/AccountsPage')).AccountsPage,
            }),
          },
          {
            path: 'categories',
            lazy: async () => ({
              Component: (await import('@/features/categories/pages/CategoriesPage'))
                .CategoriesPage,
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
            path: 'profile',
            lazy: async () => ({
              Component: (await import('@/features/auth/pages/ProfilePage')).ProfilePage,
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
    ],
  },
]
