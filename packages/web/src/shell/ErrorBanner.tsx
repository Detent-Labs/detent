import type { UiLocale } from "../i18n/locale.js";
import { t } from "./catalog.js";

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
    <div className="shell-error-banner" role="alert">
      <span className="shell-error-banner-stamp">{t(locale, "error.failed")}</span>
      <span className="shell-error-banner-message">{error}</span>
      {onRetry && (
        <button type="button" className="btn btn-secondary" onClick={onRetry} disabled={retryDisabled}>
          {t(locale, "error.retry")}
        </button>
      )}
    </div>
  );
}
