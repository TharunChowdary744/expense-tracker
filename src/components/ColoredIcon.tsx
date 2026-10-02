import { createElement } from 'react'
import { getIcon } from '@/components/icons'
import { cn } from '@/utils/cn'

interface Props {
  icon: string
  color: string
  className?: string
}

/** A round badge with a white icon on the item's colour. Decorative: the name is shown next to it. */
export function ColoredIcon({ icon, color, className }: Props) {
  return (
    <span
      aria-hidden
      className={cn('flex size-9 shrink-0 items-center justify-center rounded-full', className)}
      style={{ backgroundColor: color }}
    >
      {/* Looked up from a fixed map, so this is not a component created during render. */}
      {createElement(getIcon(icon), { className: 'size-4 text-white' })}
    </span>
  )
}
