import { NavLink } from 'react-router'
import { cn } from '@/utils/cn'
import { navItems } from '../nav'

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r bg-card md:flex">
      <div className="flex h-14 items-center gap-2 px-5 text-lg font-semibold">
        <img src="/favicon.svg" alt="" className="size-6" />
        Ledgerly
      </div>
      <nav aria-label="Main" className="flex flex-1 flex-col gap-1 p-3">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                isActive
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
              )
            }
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
