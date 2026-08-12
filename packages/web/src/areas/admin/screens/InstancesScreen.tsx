import { useCallback, useEffect, useState } from "react";
import { listInstances, AdminClientError } from "../api/client.js";
import type { DegradedInstanceSummary, InstanceSummaryItem } from "../api/types.js";
import type { Route } from "../routing.js";
import { useRefresh } from "../useRefresh.js";
import { describeCaughtError } from "../errors.js";
import { EMPTY_INSTANCE_FILTER, toListParams, labelText, type InstanceFilterState } from "./instancesLogic.js";
import { t, tFill } from "../catalog.js";
import type { UiLocale } from "../../../i18n/locale.js";

interface InstancesScreenProps {
  token: string;
  locale: UiLocale;
  navigate: (route: Route) => void;
  onUnauthorized: () => void;
}

const PAGE_LIMIT = 50;

/** True for the item shape `listInstances` returns in place of a summary it could not resolve — see instance-query's degraded-summary requirement. */
function isDegraded(item: InstanceSummaryItem): item is DegradedInstanceSummary {
  return "degraded" in item;
}

export function InstancesScreen({ token, locale, navigate, onUnauthorized }: InstancesScreenProps) {
  const [items, setItems] = useState<InstanceSummaryItem[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [filter, setFilter] = useState<InstanceFilterState>(EMPTY_INSTANCE_FILTER);
  const { reloadToken, refresh } = useRefresh();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const page = await listInstances(token, toListParams(filter, PAGE_LIMIT));
      setItems(page.items);
      setCursor(page.cursor);
    } catch (err) {
      if (err instanceof AdminClientError && err.status === 401) onUnauthorized();
      else setError(describeCaughtError(err, locale));
    } finally {
      setLoading(false);
    }
  }, [token, filter, locale, onUnauthorized]);

  const loadMore = useCallback(async () => {
    if (!cursor) return;
    setLoading(true);
    setError(undefined);
    try {
      const page = await listInstances(token, toListParams(filter, PAGE_LIMIT, cursor));
      setItems((prev) => [...prev, ...page.items]);
      setCursor(page.cursor);
    } catch (err) {
      if (err instanceof AdminClientError && err.status === 401) onUnauthorized();
      else setError(describeCaughtError(err, locale));
    } finally {
      setLoading(false);
    }
  }, [token, filter, cursor, locale, onUnauthorized]);

  useEffect(() => {
    void load();
    // reloadToken bumps on window focus or an explicit refresh() — load()
    // itself changes identity whenever `filter` changes, so this effect also
    // re-runs on a filter edit.
  }, [load, reloadToken]);

  return (
    <main className="admin-screen">
      <h1>{t(locale, "instances.title")}</h1>

      <div className="admin-controls">
        {/* Every `value` here is the status token the route matches; only the label follows the locale. */}
        <select value={filter.status} onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value }))}>
          <option value="">{t(locale, "common.allStatuses")}</option>
          <option value="running">{t(locale, "instances.statusRunning")}</option>
          <option value="completed">{t(locale, "instances.statusCompleted")}</option>
          <option value="cancelled">{t(locale, "instances.statusCancelled")}</option>
          <option value="faulted">{t(locale, "instances.statusFaulted")}</option>
        </select>
        <input
          placeholder={t(locale, "instances.filterProcessId")}
          value={filter.processId}
          onChange={(e) => setFilter((f) => ({ ...f, processId: e.target.value }))}
        />
        <input
          placeholder={t(locale, "instances.filterStepId")}
          value={filter.currentStepId}
          onChange={(e) => setFilter((f) => ({ ...f, currentStepId: e.target.value }))}
        />
        <input
          placeholder={t(locale, "instances.filterStartedBy")}
          value={filter.startedBy}
          onChange={(e) => setFilter((f) => ({ ...f, startedBy: e.target.value }))}
        />
        <input
          placeholder={t(locale, "instances.filterClaimedBy")}
          value={filter.claimedBy}
          onChange={(e) => setFilter((f) => ({ ...f, claimedBy: e.target.value }))}
        />
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

      {items.length === 0 && !loading && !error && <p className="admin-empty">{t(locale, "instances.empty")}</p>}

      {items.length > 0 && (
        <table className="admin-table">
          <thead>
            <tr>
              <th>{t(locale, "instances.colProcess")}</th>
              <th>{t(locale, "instances.colStep")}</th>
              <th>{t(locale, "instances.colStatus")}</th>
              <th>{t(locale, "instances.colStartedBy")}</th>
              <th>{t(locale, "instances.colClaimedBy")}</th>
              <th>{t(locale, "instances.colCreated")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) =>
              isDegraded(item) ? (
                <tr key={item.instanceId}>
                  <td>{item.processId}</td>
                  <td>
                    <span className="admin-badge admin-badge-degraded">{item.reason}</span>
                  </td>
                  <td>
                    <span className={`admin-badge admin-badge-${item.status}`}>{item.status}</span>
                  </td>
                  <td>{item.startedBy ?? "—"}</td>
                  <td>—</td>
                  <td>{new Date(item.createdAt).toLocaleString(locale)}</td>
                </tr>
              ) : (
                <tr key={item.instanceId}>
                  <td>
                    <button
                      type="button"
                      className="admin-row-link"
                      aria-label={tFill(locale, "instances.openRow", {
                        process: labelText(item.processLabel, item.processBaseLocale),
                        step: labelText(item.stepLabel, item.processBaseLocale),
                        status: item.status,
                      })}
                      onClick={() => navigate({ name: "instance", instanceId: item.instanceId })}
                    >
                      {labelText(item.processLabel, item.processBaseLocale)}
                    </button>
                  </td>
                  <td>{labelText(item.stepLabel, item.processBaseLocale)}</td>
                  <td>
                    <span className={`admin-badge admin-badge-${item.status}`}>{item.status}</span>
                  </td>
                  <td>{item.startedBy ?? "—"}</td>
                  <td>{item.assignment?.claimedBy ?? "—"}</td>
                  <td>{new Date(item.createdAt).toLocaleString(locale)}</td>
                </tr>
              ),
            )}
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
