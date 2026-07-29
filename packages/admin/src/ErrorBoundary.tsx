import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | undefined;
}

/**
 * Backstop for throws during **render** only — a class component because
 * `getDerivedStateFromError`/`componentDidCatch` is the one case React still
 * requires one. This does NOT catch the 25 async load/action failures the
 * rest of this package handles per-screen (`describeCaughtError` +
 * `setError`): React error boundaries never see a throw from inside an
 * `async` callback or a promise handler, which is where every one of those
 * lives. Do not delete the per-screen handling as redundant with this.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: undefined };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("admin: render-time error caught by ErrorBoundary", error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <main className="admin-boundary-fallback">
          <span className="admin-boundary-stamp">System error</span>
          <p>Something broke while rendering this screen.</p>
          <button type="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}
