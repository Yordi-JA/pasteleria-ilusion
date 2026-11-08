import { Component } from 'react'
import type { ReactNode } from 'react'

/**
 * Si el chunk de la escena 3D no llega o la escena falla al montar, no pinta nada y avisa con `onError`: quien la usa
 * deja su pastel fijo y la página sigue igual (la portada y "Diseña tu pastel").
 */
export default class SceneBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch() {
    this.props.onError()
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}
