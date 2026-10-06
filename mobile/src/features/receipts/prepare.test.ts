import { scaledSize } from './prepare'

describe('scaledSize', () => {
  it('shrinks the longest side to the limit, keeping the shape', () => {
    expect(scaledSize(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 })
    expect(scaledSize(1000, 3200, 1600)).toEqual({ width: 500, height: 1600 })
  })

  it('leaves small or unknown sizes alone', () => {
    expect(scaledSize(800, 600, 1600)).toBeNull()
    expect(scaledSize(0, 0, 1600)).toBeNull()
  })
})
