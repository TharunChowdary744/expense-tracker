import { X } from 'lucide-react'
import { Toast as Primitive } from 'radix-ui'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { cn } from '@/utils/cn'
import { toastDismissed } from '../slice'
import type { ToastVariant } from '../types'

const variantClass: Record<ToastVariant, string> = {
  default: 'border-border',
  success: 'border-success',
  error: 'border-destructive',
}

export function Toaster() {
  const toasts = useAppSelector((s) => s.ui.toasts)
  const dispatch = useAppDispatch()

  return (
    <Primitive.Provider swipeDirection="right" duration={5000} label="Notification">
      {toasts.map((t) => (
        <Primitive.Root
          key={t.id}
          type={t.variant === 'error' ? 'foreground' : 'background'}
          onOpenChange={(open) => {
            if (!open) dispatch(toastDismissed(t.id))
          }}
          className={cn(
            'relative grid gap-1 rounded-lg border bg-card p-4 pr-9 text-card-foreground shadow-lg data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-2',
            variantClass[t.variant],
          )}
        >
          <Primitive.Title className="text-sm font-medium">{t.title}</Primitive.Title>
          {t.description && (
            <Primitive.Description className="text-sm text-muted-foreground">
              {t.description}
            </Primitive.Description>
          )}
          {t.action && (
            <Primitive.Action
              altText={t.action.altText}
              onClick={() => t.action && dispatch(t.action.onAction)}
              className="mt-1 inline-flex h-8 w-fit items-center rounded-md border px-3 text-sm font-medium hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {t.action.label}
            </Primitive.Action>
          )}
          <Primitive.Close
            aria-label="Dismiss notification"
            className="absolute top-2.5 right-2.5 rounded-sm p-1 opacity-70 hover:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <X className="size-4" />
          </Primitive.Close>
        </Primitive.Root>
      ))}
      <Primitive.Viewport className="fixed right-0 bottom-20 z-[100] m-0 flex w-full max-w-sm list-none flex-col gap-2 p-4 outline-none md:bottom-0" />
    </Primitive.Provider>
  )
}
