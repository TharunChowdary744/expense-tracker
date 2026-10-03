import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import { cn } from '@/utils/cn'

/** Props to spread on the element that starts a drag (the grip button). */
export type DragHandleProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  ref: Ref<HTMLButtonElement>
}

interface Props<T extends { id: string }> {
  items: readonly T[]
  /** Accessible name of the list, e.g. "Expense categories". */
  label: string
  /** Name of an item for screen-reader announcements. */
  nameOf: (item: T) => string
  /** Called once per drop with the dragged item and the item it was dropped on. */
  onMove: (activeId: string, overId: string) => void
  renderItem: (item: T, handle: DragHandleProps, isDragging: boolean) => ReactNode
  className?: string
}

/**
 * A vertical list reorderable by drag (mouse and touch, via the grip only) and by keyboard
 * (focus the grip, Space to pick up, arrows to move, Space to drop, Escape to cancel).
 */
export function SortableList<T extends { id: string }>({
  items,
  label,
  nameOf,
  onMove,
  renderItem,
  className,
}: Props<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const name = (id: UniqueIdentifier) => {
    const item = items.find((i) => i.id === id)
    return item ? nameOf(item) : 'item'
  }
  const position = (id: UniqueIdentifier) => items.findIndex((i) => i.id === id) + 1

  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `Picked up ${name(active.id)}, position ${position(active.id)} of ${items.length}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${name(active.id)} moved to position ${position(over.id)} of ${items.length}.`
        : `${name(active.id)} is no longer over the list.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `${name(active.id)} dropped at position ${position(over.id)} of ${items.length}.`
        : `${name(active.id)} dropped.`,
    onDragCancel: ({ active }) => `Moving ${name(active.id)} was cancelled.`,
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (over && active.id !== over.id) onMove(String(active.id), String(over.id))
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            'To reorder, press Space to pick up the item, use the arrow keys to move it, then press Space again to drop it or Escape to cancel.',
        },
      }}
    >
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <ul aria-label={label} className={cn('space-y-2', className)}>
          {items.map((item) => (
            <SortableItem key={item.id} id={item.id}>
              {(handle, isDragging) => renderItem(item, handle, isDragging)}
            </SortableItem>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}

function SortableItem({
  id,
  children,
}: {
  id: string
  children: (handle: DragHandleProps, isDragging: boolean) => ReactNode
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('relative', isDragging && 'z-10')}
    >
      {children({ ref: setActivatorNodeRef, ...attributes, ...listeners }, isDragging)}
    </li>
  )
}
