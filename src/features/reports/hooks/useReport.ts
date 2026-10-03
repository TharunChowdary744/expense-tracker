import { useEffect, useRef, useState } from 'react'
import type { Report, ReportParams } from '../compute'
import { selectReport } from '../selectors'
import type { ReportCategory, ReportTx } from '../types'

/** Above this many loaded transactions the report is computed in a Web Worker. */
export const WORKER_THRESHOLD = 5000

interface WorkerReply {
  id: number
  report?: Report
  error?: string
}

let worker: Worker | null = null
function getWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null
  worker ??= new Worker(new URL('../report.worker.ts', import.meta.url), { type: 'module' })
  return worker
}

/**
 * The report for the loaded transactions. Small datasets use the memoised selector on the
 * main thread; large ones are sent to a worker and `computing` is true until it answers (the
 * previous report stays on screen meanwhile).
 */
export function useReport(
  txs: readonly ReportTx[] | undefined,
  categories: readonly ReportCategory[] | undefined,
  params: ReportParams,
): { report: Report | null; computing: boolean; error: string | null } {
  const large = (txs?.length ?? 0) > WORKER_THRESHOLD && getWorker() !== null
  const sync = !large && txs && categories ? selectReport(txs, categories, params) : null

  const [result, setResult] = useState<{
    input: readonly unknown[] | null
    report: Report | null
    error: string | null
  }>({ input: null, report: null, error: null })
  const requestId = useRef(0)

  useEffect(() => {
    if (!large || !txs || !categories) return
    const w = getWorker()
    if (!w) return
    const id = ++requestId.current
    const input = [txs, categories, params] as const
    const onMessage = (event: MessageEvent<WorkerReply>) => {
      if (event.data.id !== id) return
      setResult({ input, report: event.data.report ?? null, error: event.data.error ?? null })
    }
    w.addEventListener('message', onMessage)
    w.postMessage({ id, txs, categories, params })
    return () => w.removeEventListener('message', onMessage)
  }, [large, txs, categories, params])

  if (!large) return { report: sync, computing: false, error: null }
  const [t, c, p] = result.input ?? []
  const current = t === txs && c === categories && p === params
  return { report: result.report, computing: !current, error: current ? result.error : null }
}
