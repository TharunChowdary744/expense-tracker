import { TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function ErrorFallback({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const message = error instanceof Error ? error.message : 'Something went wrong.'
  return (
    <div
      role="alert"
      className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center gap-3 p-6 text-center"
    >
      <TriangleAlert className="size-10 text-destructive" aria-hidden />
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button onClick={onRetry}>Try again</Button>
    </div>
  )
}
