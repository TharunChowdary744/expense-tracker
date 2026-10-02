import {
  ArrowLeftRight,
  ChartPie,
  LayoutDashboard,
  Repeat,
  Settings,
  Target,
  Users,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

export const navItems: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { to: '/budgets', label: 'Budgets', icon: Target },
  { to: '/recurring', label: 'Recurring', icon: Repeat },
  { to: '/groups', label: 'Groups', icon: Users },
  { to: '/reports', label: 'Reports', icon: ChartPie },
  { to: '/settings', label: 'Settings', icon: Settings },
]

/** Bottom nav shows these; the rest live under "More". */
export const primaryMobilePaths = ['/', '/transactions', '/budgets', '/groups']
