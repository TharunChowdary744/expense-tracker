import { Ellipsis } from 'lucide-react'
import { NavLink, useLocation } from 'react-router'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/utils/cn'
import { navItems, primaryMobilePaths } from '../nav'

const itemClass =
  'flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'

export function BottomNav() {
  const { pathname } = useLocation()
  const primary = navItems.filter((i) => primaryMobilePaths.includes(i.to))
  const more = navItems.filter((i) => !primaryMobilePaths.includes(i.to))
  const moreActive = more.some((i) => pathname.startsWith(i.to))

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {primary.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            cn(itemClass, isActive ? 'text-primary' : 'text-muted-foreground')
          }
        >
          <Icon className="size-5" aria-hidden />
          {label}
        </NavLink>
      ))}
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(itemClass, moreActive ? 'text-primary' : 'text-muted-foreground')}
        >
          <Ellipsis className="size-5" aria-hidden />
          More
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top">
          {more.map(({ to, label, icon: Icon }) => (
            <DropdownMenuItem key={to} asChild>
              <NavLink to={to}>
                <Icon aria-hidden />
                {label}
              </NavLink>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  )
}
