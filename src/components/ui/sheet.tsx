import { X } from 'lucide-react'
import { Dialog as Primitive } from 'radix-ui'
import type { ComponentProps } from 'react'
import { cn } from '@/utils/cn'

export const Sheet = Primitive.Root
export const SheetTitle = Primitive.Title
export const SheetDescription = Primitive.Description
export const SheetClose = Primitive.Close

/**
 * A dialog that slides up from the bottom on small screens and in from the right on wider
 * ones. Focus is trapped and returned like any Radix dialog.
 */
export function SheetContent({
  className,
  children,
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <Primitive.Content
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 flex max-h-[95dvh] flex-col overflow-y-auto rounded-t-2xl border bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-card-foreground shadow-lg data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:w-[28rem] md:rounded-none md:rounded-l-2xl md:data-[state=open]:slide-in-from-right',
          className,
        )}
        {...props}
      >
        {children}
        <Primitive.Close
          aria-label="Close"
          className="absolute top-4 right-4 rounded-sm p-1 opacity-70 hover:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <X className="size-4" />
        </Primitive.Close>
      </Primitive.Content>
    </Primitive.Portal>
  )
}
