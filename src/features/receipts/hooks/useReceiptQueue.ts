import { useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { startReceiptQueue } from '../queue'

/** Runs the receipt upload/delete queue while a user is signed in (mounted in the app layout). */
export function useReceiptQueue() {
  const uid = useAppSelector((s) => s.auth.user?.uid)
  const dispatch = useAppDispatch()
  useEffect(() => {
    if (!uid) return
    return startReceiptQueue(dispatch, uid)
  }, [uid, dispatch])
}
