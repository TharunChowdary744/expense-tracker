/**
 * Axis maths for the SVG charts: "nice" tick values (1, 2 or 5 × a power of ten) covering the
 * data, and the mapping from a value to a y coordinate.
 */
export interface Scale {
  min: number
  max: number
  ticks: number[]
}

function niceStep(span: number, count: number): number {
  const raw = span / Math.max(1, count)
  const power = 10 ** Math.floor(Math.log10(raw))
  const unit = raw / power
  const nice = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10
  return nice * power
}

/** Ticks from at most `min` (≤ 0) to at least `max` (≥ 0), about `count` steps apart. */
export function niceScale(min: number, max: number, count = 4): Scale {
  const lo = Math.min(0, min)
  const hi = Math.max(0, max)
  if (lo === hi) return { min: 0, max: 1, ticks: [0, 1] }
  const step = niceStep(hi - lo, count)
  const start = Math.floor(lo / step) * step
  const end = Math.ceil(hi / step) * step
  const ticks: number[] = []
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Math.round(v / step) * step)
  return { min: start, max: end, ticks }
}

/** The y coordinate of `value` on a chart `height` tall (0 at the top). */
export function yOf(value: number, scale: Scale, height: number): number {
  const span = scale.max - scale.min || 1
  return height - ((value - scale.min) / span) * height
}

/** Every n-th label, so about `max` of them fit along an axis. */
export function labelEvery(count: number, max: number): number {
  return Math.max(1, Math.ceil(count / Math.max(1, max)))
}
