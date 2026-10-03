/// <reference lib="webworker" />
import { computeReport, type ReportParams } from './compute'
import type { ReportCategory, ReportTx } from './types'

/** Computes large reports off the main thread. Messages carry an id so stale results are ignored. */
export interface ReportRequest {
  id: number
  txs: ReportTx[]
  categories: ReportCategory[]
  params: ReportParams
}

self.onmessage = (event: MessageEvent<ReportRequest>) => {
  const { id, txs, categories, params } = event.data
  try {
    self.postMessage({ id, report: computeReport(txs, categories, params) })
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) })
  }
}
