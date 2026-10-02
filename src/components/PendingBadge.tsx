import { CloudOff } from 'lucide-react'

/** Marks an item whose latest change is saved on this device but not yet synced. */
export function PendingBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
      title="Saved on this device. It will sync when you are back online."
    >
      <CloudOff className="size-3" aria-hidden />
      Not synced
    </span>
  )
}
