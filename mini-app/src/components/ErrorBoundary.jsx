import { Component } from 'react'

// Last line of defence: a render error anywhere below would otherwise leave
// a blank screen. Show what broke and a way back instead.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Kindo crashed:', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="page crash">
        <p className="eyebrow">Kindo</p>
        <h2>Something went wrong.</h2>
        <p className="crash-detail">{String(this.state.error?.message || this.state.error)}</p>
        <button type="button" className="cta cta--block" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    )
  }
}

export default ErrorBoundary
