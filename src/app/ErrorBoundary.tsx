import { Component, type ErrorInfo, type ReactNode } from 'react'
import { ErrorFallback } from './ErrorFallback'

interface State {
  error: Error | null
}

/** Last line of defence: catches render errors anywhere below the providers. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorFallback error={this.state.error} onRetry={() => this.setState({ error: null })} />
      )
    }
    return this.props.children
  }
}
