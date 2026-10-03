import { X } from 'lucide-react'
import { Dialog as Primitive } from 'radix-ui'
import type { ComponentProps } from 'react'
import { cn } from '@/utils/cn'

export const Dialog = Primitive.Root
export const DialogTitle = Primitive.Title
export const DialogDescription = Primitive.Description
export const DialogClose = Primitive.Close

export function DialogContent({
  className,
  children,
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <Primitive.Content
        className={cn(
          'fixed top-1/2 left-1/2 z-50 grid w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-3 rounded-lg border bg-card p-6 text-card-foreground shadow-lg',
          className,
        )}
        {...props}
      >
        {children}
        <Primitive.Close
          aria-label="Close"
          className="absolute top-3 right-3 rounded-sm p-1 opacity-70 hover:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <X className="size-4" />
        </Primitive.Close>
      </Primitive.Content>
    </Primitive.Portal>
  )
}
