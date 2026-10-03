/** Lightbox zoom state: scale around the centre, then an offset in pixels. */
export const MIN_ZOOM = 1
export const MAX_ZOOM = 5

export interface Zoom {
  scale: number
  x: number
  y: number
}

export const NO_ZOOM: Zoom = { scale: 1, x: 0, y: 0 }

export function clampZoom(scale: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale))
}

/** Zooms around the centre; back at 1× the image is centred again. */
export function zoomTo(zoom: Zoom, scale: number): Zoom {
  const next = clampZoom(scale)
  if (next === MIN_ZOOM) return NO_ZOOM
  const ratio = next / zoom.scale
  return { scale: next, x: zoom.x * ratio, y: zoom.y * ratio }
}
