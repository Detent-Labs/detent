import { useCallback, useEffect, useState } from "react";
import { listPendingTimers } from "../api/client.js";
import type { PendingTimer } from "../api/types.js";
import type { Route } from "../routing.js";
import { useRefresh } from "../useRefresh.js";
import { describeCaughtError } from "../errors.js";
import { useFail } from "../../../shell/useFail.js";
import { isOverdue } from "./timersLogic.js";
import { t, tFill } from "../catalog.js";
import type { UiLocale } from "../../../i18n/locale.js";

interface TimersScreenProps {
  token: string;
  locale: UiLocale;
  navigate: (route: Route) => void;
  onUnauthorized: () => void;
}

const PAGE_LIMIT = 50;

export function TimersScreen({ token, locale, navigate, onUnauthorized }: TimersScreenProps) {
  const [items, setItems] = useState<PendingTimer[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const { reloadToken, refresh } = useRefresh();
  const fail = useFail(onUnauthorized, (err) => setError(describeCaughtError(err, locale)));

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const page = await listPendingTimers(token, { limit: PAGE_LIMIT });
      setItems(page.items);
      setCursor(page.cursor);
    } catch (err) {
      fail(err);
    } finally {
      setLoading(false);
    }
  }, [token, locale, fail]);

  const loadMore = useCallback(async () => {
    if (!cursor) return;
    setLoading(true);
    setError(undefined);
    try {
      const page = await listPendingTimers(token, { limit: PAGE_LIMIT, cursor });
      setItems((prev) => [...prev, ...page.items]);
      setCursor(page.cursor);
    } catch (err) {
      fail(err);
    } finally {
      setLoading(false);
    }
  }, [token, cursor, locale, fail]);

  useEffect(() => {
    void load();
  }, [load, reloadToken]);

  return (
    <main className="admin-screen">
      <h1>{t(locale, "timers.title")}</h1>

      <div className="admin-controls">
        <button type="button" className="btn btn-secondary" onClick={refresh} disabled={loading}>
          {t(locale, "common.refresh")}
        </button>
      </div>

      {error && (
        <div className="admin-error-banner" role="alert">
          <span className="admin-error-banner-stamp">{t(locale, "common.failed")}</span>
          <span className="admin-error-banner-message">{error}</span>
          <button type="button" className="btn btn-secondary" onClick={refresh} disabled={loading}>
            {t(locale, "common.retry")}
          </button>
        </div>
      )}

      {items.length === 0 && !loading && !error && <p className="admin-empty">{t(locale, "timers.empty")}</p>}

      {items.length > 0 && (
        <table className="admin-table">
          <thead>
            <tr>
              <th>{t(locale, "timers.colInstance")}</th>
              <th>{t(locale, "timers.colProcess")}</th>
              <th>{t(locale, "timers.colStep")}</th>
              <th>{t(locale, "timers.colFireTime")}</th>
            </tr>
          </thead>
          <tbody>
            {/* `row`, not `t`: the catalog lookup owns that name in this file now. */}
            {items.map((row) => (
              <tr key={row.instanceId}>
                <td>
                  <button
                    type="button"
                    className="admin-row-link"
                    aria-label={tFill(locale, "timers.openRow", { instance: row.instanceId, process: row.processId, step: row.currentStepId })}
                    onClick={() => navigate({ name: "instance", instanceId: row.instanceId })}
                  >
                    {row.instanceId}
                  </button>
                </td>
                <td>{row.processId}</td>
                <td>{row.currentStepId}</td>
                <td>
                  {isOverdue(row.nextTimerAt) && <span className="admin-badge admin-badge-overdue">{t(locale, "timers.overdue")}</span>}{" "}
                  {new Date(row.nextTimerAt).toLocaleString(locale)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {cursor && (
        <div className="admin-load-more">
          <button type="button" className="btn btn-secondary" onClick={() => void loadMore()} disabled={loading}>
            {t(locale, "common.loadMore")}
          </button>
        </div>
      )}
    </main>
  );
}
