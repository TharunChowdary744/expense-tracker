import { labelEvery, niceScale, yOf } from './scale'

describe('niceScale', () => {
  it('covers the data with 1-2-5 steps from zero', () => {
    expect(niceScale(0, 950)).toEqual({ min: 0, max: 1000, ticks: [0, 500, 1000] })
    expect(niceScale(0, 950, 5).ticks).toEqual([0, 200, 400, 600, 800, 1000])
  })

  it('includes negative values', () => {
    const s = niceScale(-300, 700)
    expect(s.min).toBeLessThanOrEqual(-300)
    expect(s.max).toBeGreaterThanOrEqual(700)
    expect(s.ticks).toContain(0)
  })

  it('has a usable range when every value is zero', () => {
    expect(niceScale(0, 0)).toEqual({ min: 0, max: 1, ticks: [0, 1] })
  })
})

describe('yOf and labelEvery', () => {
  it('maps the top of the scale to 0 and the bottom to the height', () => {
    const s = { min: 0, max: 100, ticks: [] }
    expect(yOf(100, s, 200)).toBe(0)
    expect(yOf(0, s, 200)).toBe(200)
    expect(yOf(50, s, 200)).toBe(100)
  })

  it('thins labels to fit', () => {
    expect(labelEvery(12, 6)).toBe(2)
    expect(labelEvery(3, 6)).toBe(1)
  })
})
