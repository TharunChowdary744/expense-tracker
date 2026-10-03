import { describe, expect, it } from 'vitest'
import { MAX_ZOOM, NO_ZOOM, clampZoom, zoomTo } from './zoom'

describe('zoom', () => {
  it('stays between 1× and the maximum', () => {
    expect(clampZoom(0.2)).toBe(1)
    expect(clampZoom(99)).toBe(MAX_ZOOM)
  })

  it('scales the offset with the zoom and recentres at 1×', () => {
    expect(zoomTo({ scale: 2, x: 10, y: -20 }, 4)).toEqual({ scale: 4, x: 20, y: -40 })
    expect(zoomTo({ scale: 2, x: 10, y: -20 }, 0.5)).toEqual(NO_ZOOM)
  })
})
