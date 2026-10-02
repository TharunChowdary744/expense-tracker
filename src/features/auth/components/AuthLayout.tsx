import type { ReactNode } from 'react'
import { Toaster } from '@/features/ui/components/Toaster'

interface Props {
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
}

/** Centered card used by every signed-out screen. */
export function AuthLayout({ title, description, children, footer }: Props) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <main id="main" className="w-full max-w-sm space-y-6">
        <div className="flex items-center justify-center gap-2 text-lg font-semibold">
          <img src="/favicon.svg" alt="" className="size-7" />
          Ledgerly
        </div>
        <div className="space-y-6 rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
          {children}
        </div>
        {footer && <div className="text-center text-sm text-muted-foreground">{footer}</div>}
      </main>
      <Toaster />
    </div>
  )
}
