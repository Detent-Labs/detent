import { Component, type ErrorInfo, type ReactNode } from "react";
import { t } from "./catalog.js";
import type { UiLocale } from "../i18n/locale.js";

interface ErrorBoundaryProps {
  locale: UiLocale;
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | undefined;
}

/**
 * Backstop for throws during **render** only — a class component because
 * `getDerivedStateFromError`/`componentDidCatch` is the one case React still
 * requires one. This does NOT catch the async load/action failures the rest
 * of each area handles per-screen (TaskScreen's `withErrorHandling` +
 * `describeError`, and the other screens' `describeCaughtError`): React
 * error boundaries never see a throw from inside an `async` callback or a
 * promise handler, which is where every one of those lives. Do not delete
 * the per-screen handling as redundant with this.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: undefined };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("web: render-time error caught by ErrorBoundary", error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.error) {
      const locale = this.props.locale;
      return (
        <main className="shell-boundary-fallback">
          <span className="shell-boundary-stamp">{t(locale, "error.generic")}</span>
          <button type="button" onClick={() => window.location.reload()}>
            {t(locale, "error.retry")}
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}
