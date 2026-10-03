import type { ComponentProps } from 'react'
import { cn } from '@/utils/cn'

export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div aria-hidden className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />
  )
}
