import { Component } from 'react'

// A failed optional formatting chunk must not erase the conversation or draft.
export default class ContentBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}
