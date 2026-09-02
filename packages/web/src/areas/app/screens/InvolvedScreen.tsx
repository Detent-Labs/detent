import { useCallback, useEffect, useState } from "react";
import { listInstances } from "../api/client.js";
import { describeCaughtError } from "../errors.js";
import { useFail } from "../../../shell/useFail.js";
import { usePagedList } from "../../../shell/usePagedList.js";
import { ErrorBanner } from "../../../shell/ErrorBanner.js";
import { t } from "../catalog.js";
import type { UiLocale } from "../../../i18n/locale.js";
import type { InstanceSummary } from "../api/types.js";
import type { Route } from "../routing.js";
import { processLabelOf, startedOnLabel, statusKey, statusTone, stepLabelOf } from "./startedLogic.js";

interface InvolvedScreenProps {
  token: string;
  locale: UiLocale;
  navigate: (route: Route) => void;
  onUnauthorized: () => void;
}

/**
 * Every case this participant reached, whoever raised it.
 *
 * Three lists, three questions. The inbox asks what awaits this participant
 * now. Cases I started asks what became of what they raised. This one asks
 * what they took part in at all — as starter, as claimant, or as a candidate
 * on a step the case has long since left. `scope=visible` answers it from the
 * engine's principal set (`instance-visibility-set`), so a revocation removes
 * a case here and a live assignment holds one in place.
 *
 * The row is the started screen's row, down to the view model it imports. A
 * participant who learned one list has learned this one, and one drifting
 * copy of `statusTone` would be a defect no test catches.
 */
export function InvolvedScreen({ token, locale, navigate, onUnauthorized }: InvolvedScreenProps) {
  const [error, setError] = useState<string | undefined>(undefined);
  const fail = useFail(onUnauthorized, (err) => setError(describeCaughtError(err, locale)));

  const fetchPage = useCallback(
    async (cursor?: string) => {
      setError(undefined);
      try {
        const page = await listInstances("visible", token, { limit: 200, cursor });
        return { items: page.items, cursor: page.cursor };
      } catch (err) {
        fail(err);
        throw err;
      }
    },
    [token, fail],
  );
  const { items, cursor, loading, load, loadMore } = usePagedList<InstanceSummary>(fetchPage);

  useEffect(() => {
    void load();
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  return (
    <main className="app-screen app-tasks">
      <h1>{t(locale, "involved.title")}</h1>

      {error && <ErrorBanner error={error} locale={locale} onRetry={() => void load()} retryDisabled={loading} />}

      {items.length === 0 && !loading && !error && <p className="app-empty">{t(locale, "involved.empty")}</p>}

      {items.length > 0 && (
        <ul className="app-task-list">
          {items.map((item) => (
            <li key={item.instanceId} className="app-task-row">
              <span className={`app-stamp app-stamp-${statusTone(item.status)}`}>{t(locale, statusKey(item.status))}</span>
              <button type="button" className="app-task-link" onClick={() => navigate({ name: "task", instanceId: item.instanceId })}>
                <span className="app-task-process">{processLabelOf(item, locale)}</span>
                <span className="app-task-step">{stepLabelOf(item, locale)}</span>
              </button>
              {/* The class says `started` and serves both lists: one row shape, one set of classes. */}
              <span className="app-started-date">{startedOnLabel(item, locale)}</span>
            </li>
          ))}
        </ul>
      )}

      {cursor && (
        <div className="app-load-more">
          <button type="button" className="btn btn-secondary" onClick={() => void loadMore()} disabled={loading}>
            {t(locale, "involved.loadMore")}
          </button>
        </div>
      )}
    </main>
  );
}
