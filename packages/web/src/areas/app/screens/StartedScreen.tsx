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

interface StartedScreenProps {
  token: string;
  locale: UiLocale;
  navigate: (route: Route) => void;
  onUnauthorized: () => void;
}

/**
 * Every case this participant raised, whatever became of it.
 *
 * The inbox answers "what is waiting on me". This answers "what happened to
 * the thing I sent", which is a different question with a different shape: a
 * completed or cancelled case is the common answer here and never appears
 * there. So the list carries every status and sorts by nothing but the
 * server's own newest-first order.
 *
 * No filter, no sort, no grouping. The inbox carries those because a queue of
 * live work needs them. A register of what one person started does not, and
 * the load-more here needs no caveat about a sort it does not apply.
 */
export function StartedScreen({ token, locale, navigate, onUnauthorized }: StartedScreenProps) {
  const [error, setError] = useState<string | undefined>(undefined);
  const fail = useFail(onUnauthorized, (err) => setError(describeCaughtError(err, locale)));

  const fetchPage = useCallback(
    async (cursor?: string) => {
      setError(undefined);
      try {
        const page = await listInstances("started", token, { limit: 200, cursor });
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
      <h1>{t(locale, "started.title")}</h1>

      {error && <ErrorBanner error={error} locale={locale} onRetry={() => void load()} retryDisabled={loading} />}

      {items.length === 0 && !loading && !error && <p className="app-empty">{t(locale, "started.empty")}</p>}

      {items.length > 0 && (
        <ul className="app-task-list">
          {items.map((item) => (
            <li key={item.instanceId} className="app-task-row">
              <span className={`app-stamp app-stamp-${statusTone(item.status)}`}>{t(locale, statusKey(item.status))}</span>
              <button type="button" className="app-task-link" onClick={() => navigate({ name: "task", instanceId: item.instanceId })}>
                <span className="app-task-process">{processLabelOf(item, locale)}</span>
                <span className="app-task-step">{stepLabelOf(item, locale)}</span>
              </button>
              <span className="app-started-date">{startedOnLabel(item, locale)}</span>
            </li>
          ))}
        </ul>
      )}

      {cursor && (
        <div className="app-load-more">
          <button type="button" className="btn btn-secondary" onClick={() => void loadMore()} disabled={loading}>
            {t(locale, "started.loadMore")}
          </button>
        </div>
      )}
    </main>
  );
}
