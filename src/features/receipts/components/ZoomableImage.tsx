import { useRef, useState, type PointerEvent, type WheelEvent } from 'react'
import { cn } from '@/utils/cn'
import { NO_ZOOM, zoomTo, type Zoom } from '../zoom'

interface Props {
  src: string
  alt: string
  zoom: Zoom
  onZoomChange: (zoom: Zoom) => void
}

/**
 * An image that zooms with the wheel, a double click/tap or a pinch, and pans by dragging when
 * zoomed in. The buttons and keys for zooming live in the lightbox.
 */
export function ZoomableImage({ src, alt, zoom, onZoomChange }: Props) {
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ zoom: Zoom; distance: number; x: number; y: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  function distance() {
    const [a, b] = [...pointers.current.values()]
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    gesture.current = { zoom, distance: distance(), x: e.clientX, y: e.clientY }
    setDragging(true)
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const start = gesture.current
    if (pointers.current.size >= 2 && start.distance > 0) {
      onZoomChange(zoomTo(start.zoom, start.zoom.scale * (distance() / start.distance)))
    } else if (pointers.current.size === 1 && start.zoom.scale > 1) {
      onZoomChange({
        ...start.zoom,
        x: start.zoom.x + (e.clientX - start.x),
        y: start.zoom.y + (e.clientY - start.y),
      })
    }
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId)
    const [rest] = [...pointers.current.values()]
    gesture.current = rest ? { zoom, distance: 0, x: rest.x, y: rest.y } : null
    if (!rest) setDragging(false)
  }

  function onWheel(e: WheelEvent<HTMLDivElement>) {
    onZoomChange(zoomTo(zoom, zoom.scale * Math.exp(-e.deltaY * 0.002)))
  }

  return (
    <div
      className={cn(
        'flex size-full touch-none items-center justify-center overflow-hidden select-none',
        zoom.scale > 1 && (dragging ? 'cursor-grabbing' : 'cursor-grab'),
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      onDoubleClick={() => onZoomChange(zoom.scale > 1 ? NO_ZOOM : zoomTo(zoom, 2.5))}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        className={cn('max-h-full max-w-full object-contain', !dragging && 'transition-transform')}
        style={{ transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})` }}
      />
    </div>
  )
}
