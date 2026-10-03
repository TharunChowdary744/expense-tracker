import { cn } from '@/utils/cn'
import { userInitial } from '../utils'
import type { AuthUser } from '../types'

export function UserAvatar({ user, className }: { user: AuthUser; className?: string }) {
  const box = cn(
    'inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-sm font-medium text-primary-foreground',
    className,
  )
  if (user.photoURL) {
    return (
      <img
        src={user.photoURL}
        alt=""
        referrerPolicy="no-referrer"
        className={cn(box, 'object-cover')}
      />
    )
  }
  return (
    <span aria-hidden className={box}>
      {userInitial(user)}
    </span>
  )
}
