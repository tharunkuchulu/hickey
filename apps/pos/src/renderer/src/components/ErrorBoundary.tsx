import { Component, type ReactNode } from 'react'

interface State {
  error: Error | null
}

/** Last line of defence: a render crash shows a restart button instead of a blank white window. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error('[renderer] crashed', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 bg-gray-100 p-8 text-center">
        <div className="text-2xl font-bold text-red-600">Something went wrong</div>
        <div className="text-gray-600 max-w-xl break-words">{this.state.error.message}</div>
        <div className="text-sm text-gray-500">Your saved bills are safe. Restart the screen to continue.</div>
        <button onClick={() => window.location.reload()} className="px-6 rounded bg-brand-600 text-white font-semibold">
          Restart screen
        </button>
      </div>
    )
  }
}
