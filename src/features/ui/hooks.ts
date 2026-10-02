import { useCallback } from 'react'
import { useAppDispatch } from '@/app/hooks'
import { toastAdded } from './slice'
import type { Toast } from './types'

export function useToast() {
  const dispatch = useAppDispatch()
  return useCallback(
    (toast: Omit<Toast, 'id' | 'variant'> & { variant?: Toast['variant'] }) => {
      dispatch(toastAdded(toast))
    },
    [dispatch],
  )
}
