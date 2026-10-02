import { LogOut, UserRound } from 'lucide-react'
import { Link } from 'react-router'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSignOutMutation } from '../api'
import { useAuth } from '../hooks'
import { UserAvatar } from './UserAvatar'

export function UserMenu() {
  const { user } = useAuth()
  const [signOut] = useSignOutMutation()
  if (!user) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <UserAvatar user={user} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <div className="px-2 py-1.5 text-sm">
          <p className="font-medium">{user.displayName || 'Your account'}</p>
          {user.email && <p className="text-xs text-muted-foreground">{user.email}</p>}
        </div>
        <DropdownMenuItem asChild>
          <Link to="/profile">
            <UserRound aria-hidden />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => signOut()}>
          <LogOut aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
