import { useLocation } from 'react-router'
import { navItems } from '../nav'
import { ThemeToggle } from './ThemeToggle'

export function TopBar() {
  const { pathname } = useLocation()
  const current = navItems.find((i) =>
    i.to === '/' ? pathname === '/' : pathname.startsWith(i.to),
  )

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/90 px-4 backdrop-blur md:px-6">
      <div className="flex items-center gap-2 font-semibold">
        <img src="/favicon.svg" alt="" className="size-6 md:hidden" />
        <span className="md:hidden">Ledgerly</span>
        <span className="hidden md:inline">{current?.label ?? 'Ledgerly'}</span>
      </div>
      <ThemeToggle />
    </header>
  )
}
