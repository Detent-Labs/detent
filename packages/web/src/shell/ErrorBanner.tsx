import * as stylex from "@stylexjs/stylex";
import type { UiLocale } from "../i18n/locale.js";
import { t } from "./catalog.js";
import { colors, fonts, space } from "form-ui/tokens.stylex";

/** `.shell-error-banner`, its stamp and its message, from `shell.css`. */
const styles = stylex.create({
  banner: {
    display: "flex",
    alignItems: "baseline",
    gap: space.s3,
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: colors.refusal,
    paddingBlock: space.s2,
    paddingInline: space.s3,
    marginBlock: space.s3,
    marginInline: 0,
  },
  stamp: {
    flex: "none",
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: colors.refusal,
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: "currentcolor",
    paddingBlock: 2,
    paddingInline: 7,
    transform: "rotate(-2deg)",
  },
  message: {
    flex: 1,
    color: colors.text,
  },
});

interface ErrorBannerProps {
  error: string;
  locale: UiLocale;
  onRetry?: () => void;
  retryDisabled?: boolean;
}

/**
 * A failed request reported where the data it would have shown normally sits,
 * not a toast — the one shape every `app`/`admin` screen built inline before
 * this component existed. The retry button renders only when a call site
 * passes `onRetry`; `retryDisabled` has no effect without it, since no button
 * renders to disable.
 */
export function ErrorBanner({ error, locale, onRetry, retryDisabled }: ErrorBannerProps) {
  return (
    <div {...stylex.props(styles.banner)} role="alert">
      <span {...stylex.props(styles.stamp)}>{t(locale, "error.failed")}</span>
      <span {...stylex.props(styles.message)}>{error}</span>
      {onRetry && (
        <button type="button" className="btn btn-secondary" onClick={onRetry} disabled={retryDisabled}>
          {t(locale, "error.retry")}
        </button>
      )}
    </div>
  );
}
