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
 * requires one. Mechanical addition (render-frontend-error-states design.md:
 * this package is scheduled for deletion by `studio-tools-and-player`, "not
 * where the value is") — this package has no `else throw err` pattern to
 * begin with (`player/store.tsx`'s `run()` already sets an error state
 * instead of rethrowing), so this boundary is the only piece that applies
 * here, purely as a backstop for a render-time throw.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: undefined };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("editor: render-time error caught by ErrorBoundary", error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <main>
          <h1>Something broke while rendering this screen.</h1>
          <button type="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}
