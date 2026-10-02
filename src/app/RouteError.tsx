import { useRouteError } from 'react-router'
import { ErrorFallback } from './ErrorFallback'

/** Router-level errorElement: loader/lazy/render errors inside a route. */
export function RouteError() {
  const error = useRouteError()
  return <ErrorFallback error={error} onRetry={() => window.location.reload()} />
}
