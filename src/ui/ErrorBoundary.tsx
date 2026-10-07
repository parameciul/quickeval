import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  failed: boolean;
}

// Catches a page that crashes while it draws, so the reader sees a Romanian
// message and a reload button instead of an empty screen. Give it a new key
// on every page change, so moving to another page clears the error.
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Page error:', error.message, info.componentStack ?? '');
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="alert" role="alert">
        <p className="alert-text">Pagina nu s-a putut afișa. Reîncarcă pagina și încearcă din nou.</p>
        <button type="button" className="button-quiet button-small" onClick={() => window.location.reload()}>
          Reîncarcă pagina
        </button>
      </div>
    );
  }
}
