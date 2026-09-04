import { Component, type ErrorInfo, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import * as stylex from "@stylexjs/stylex";
import { t } from "./catalog.js";
import type { UiLocale } from "../i18n/locale.js";
import { colors, fonts, space } from "form-ui/tokens.stylex";

/** `.shell-boundary-fallback` (merged with the shared `.shell-empty` base
 * it overrides) and `.shell-boundary-stamp`, from `shell.css`. */
const styles = stylex.create({
  fallback: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: space.s3,
    maxWidth: "46rem",
    marginInline: "auto",
    marginBlock: 0,
    padding: space.s8,
    color: colors.textMuted,
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: colors.divider,
    backgroundColor: colors.surfaceMuted,
  },
  stamp: {
    display: "inline-flex",
    alignItems: "center",
    gap: space.s1,
    fontFamily: fonts.mono,
    fontSize: 16,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: colors.refusal,
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: "currentcolor",
    paddingBlock: 4,
    paddingInline: 12,
    transform: "rotate(-2deg)",
  },
});

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
        <main {...stylex.props(styles.fallback)}>
          <span {...stylex.props(styles.stamp)}>
            <TriangleAlert size={18} strokeWidth={1.75} aria-hidden="true" />
            {t(locale, "error.generic")}
          </span>
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            {t(locale, "error.retry")}
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}
