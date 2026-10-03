import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  EllipsisVertical,
  FolderPlus,
  GripVertical,
  Pencil,
} from 'lucide-react'
import { ColoredIcon } from '@/components/ColoredIcon'
import { PendingBadge } from '@/components/PendingBadge'
import type { DragHandleProps } from '@/components/SortableList'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/utils/cn'
import type { Category } from '../types'

interface Props {
  category: Category
  handle: DragHandleProps
  isDragging: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onEdit: () => void
  onToggleArchived: () => void
  /** Only top-level, active categories can get subcategories. */
  onAddSubcategory?: () => void
}

export function CategoryRow({
  category,
  handle,
  isDragging,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onEdit,
  onToggleArchived,
  onAddSubcategory,
}: Props) {
  const { ref, ...handleProps } = handle
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border bg-card p-2 pr-1',
        category.archived && 'opacity-70',
        isDragging && 'shadow-lg ring-2 ring-ring/50',
      )}
    >
      <button
        ref={ref}
        type="button"
        aria-label={`Reorder ${category.name}`}
        className="flex size-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 active:cursor-grabbing"
        {...handleProps}
      >
        <GripVertical className="size-4" aria-hidden />
      </button>
      <ColoredIcon icon={category.icon} color={category.color} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{category.name}</p>
        {(category.archived || category.pending) && (
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {category.archived && (
              <span className="rounded-full bg-muted px-2 py-0.5">Archived</span>
            )}
            {category.pending && <PendingBadge />}
          </p>
        )}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions for ${category.name}`}>
            <EllipsisVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {onAddSubcategory && (
            <DropdownMenuItem onSelect={onAddSubcategory}>
              <FolderPlus aria-hidden />
              Add subcategory
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil aria-hidden />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canMoveUp} onSelect={onMoveUp}>
            <ArrowUp aria-hidden />
            Move up
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canMoveDown} onSelect={onMoveDown}>
            <ArrowDown aria-hidden />
            Move down
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onToggleArchived}>
            {category.archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
            {category.archived ? 'Restore' : 'Archive'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
