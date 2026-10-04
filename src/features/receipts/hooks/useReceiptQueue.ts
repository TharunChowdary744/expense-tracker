import { useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { receiptsEnabled } from '../flag'
import { startReceiptQueue } from '../queue'

/**
 * Runs the receipt upload/delete queue while a user is signed in (mounted in the app layout).
 * With receipts switched off it stays idle; queued jobs are kept and run once it is back on.
 */
export function useReceiptQueue() {
  const uid = useAppSelector((s) => s.auth.user?.uid)
  const dispatch = useAppDispatch()
  useEffect(() => {
    if (!uid || !receiptsEnabled) return
    return startReceiptQueue(dispatch, uid)
  }, [uid, dispatch])
}
