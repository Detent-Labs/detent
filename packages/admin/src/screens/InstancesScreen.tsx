import { useCallback, useEffect, useState } from "react";
import { listInstances, AdminClientError } from "../api/client.js";
import type { InstanceSummary } from "../api/types.js";
import type { Route } from "../routing.js";
import { useRefresh } from "../useRefresh.js";
import { describeCaughtError } from "../errors.js";
import { EMPTY_INSTANCE_FILTER, toListParams, labelText, type InstanceFilterState } from "./instancesLogic.js";

interface InstancesScreenProps {
  token: string;
  navigate: (route: Route) => void;
  onUnauthorized: () => void;
}

const PAGE_LIMIT = 50;

export function InstancesScreen({ token, navigate, onUnauthorized }: InstancesScreenProps) {
  const [items, setItems] = useState<InstanceSummary[]>([]);
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
      else setError(describeCaughtError(err));
    } finally {
      setLoading(false);
    }
  }, [token, filter, onUnauthorized]);

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
      else setError(describeCaughtError(err));
    } finally {
      setLoading(false);
    }
  }, [token, filter, cursor, onUnauthorized]);

  useEffect(() => {
    void load();
    // reloadToken bumps on window focus or an explicit refresh() — load()
    // itself changes identity whenever `filter` changes, so this effect also
    // re-runs on a filter edit.
  }, [load, reloadToken]);

  return (
    <main className="admin-screen">
      <h1>Instances</h1>

      <div className="admin-controls">
        <select value={filter.status} onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value }))}>
          <option value="">All statuses</option>
          <option value="running">Running</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="faulted">Faulted</option>
        </select>
        <input placeholder="Process id" value={filter.processId} onChange={(e) => setFilter((f) => ({ ...f, processId: e.target.value }))} />
        <input placeholder="Current step id" value={filter.currentStepId} onChange={(e) => setFilter((f) => ({ ...f, currentStepId: e.target.value }))} />
        <input placeholder="Started by" value={filter.startedBy} onChange={(e) => setFilter((f) => ({ ...f, startedBy: e.target.value }))} />
        <input placeholder="Claimed by" value={filter.claimedBy} onChange={(e) => setFilter((f) => ({ ...f, claimedBy: e.target.value }))} />
        <button type="button" onClick={refresh} disabled={loading}>
          Refresh
        </button>
      </div>

      {error && (
        <div className="admin-error-banner" role="alert">
          <span className="admin-error-banner-stamp">Failed</span>
          <span className="admin-error-banner-message">{error}</span>
          <button type="button" onClick={refresh} disabled={loading}>
            Retry
          </button>
        </div>
      )}

      {items.length === 0 && !loading && !error && <p className="admin-empty">No instances match these filters.</p>}

      {items.length > 0 && (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Process</th>
              <th>Step</th>
              <th>Status</th>
              <th>Started by</th>
              <th>Claimed by</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.instanceId} className="admin-row-clickable" onClick={() => navigate({ name: "instance", instanceId: item.instanceId })}>
                <td>{labelText(item.processLabel, item.processBaseLocale)}</td>
                <td>{labelText(item.stepLabel, item.processBaseLocale)}</td>
                <td>
                  <span className={`admin-badge admin-badge-${item.status}`}>{item.status}</span>
                </td>
                <td>{item.startedBy ?? "—"}</td>
                <td>{item.assignment?.claimedBy ?? "—"}</td>
                <td>{new Date(item.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {cursor && (
        <div className="admin-load-more">
          <button type="button" onClick={() => void loadMore()} disabled={loading}>
            Load more
          </button>
        </div>
      )}
    </main>
  );
}
