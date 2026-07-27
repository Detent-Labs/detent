import { useCallback, useEffect, useState } from "react";
import { listPendingTimers, AdminClientError } from "../api/client.js";
import type { PendingTimer } from "../api/types.js";
import type { Route } from "../routing.js";
import { useRefresh } from "../useRefresh.js";
import { isOverdue } from "./timersLogic.js";

interface TimersScreenProps {
  token: string;
  navigate: (route: Route) => void;
  onUnauthorized: () => void;
}

const PAGE_LIMIT = 50;

export function TimersScreen({ token, navigate, onUnauthorized }: TimersScreenProps) {
  const [items, setItems] = useState<PendingTimer[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const { reloadToken, refresh } = useRefresh();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = await listPendingTimers(token, { limit: PAGE_LIMIT });
      setItems(page.items);
      setCursor(page.cursor);
    } catch (err) {
      if (err instanceof AdminClientError && err.status === 401) onUnauthorized();
      else throw err;
    } finally {
      setLoading(false);
    }
  }, [token, onUnauthorized]);

  const loadMore = useCallback(async () => {
    if (!cursor) return;
    setLoading(true);
    try {
      const page = await listPendingTimers(token, { limit: PAGE_LIMIT, cursor });
      setItems((prev) => [...prev, ...page.items]);
      setCursor(page.cursor);
    } catch (err) {
      if (err instanceof AdminClientError && err.status === 401) onUnauthorized();
      else throw err;
    } finally {
      setLoading(false);
    }
  }, [token, cursor, onUnauthorized]);

  useEffect(() => {
    void load();
  }, [load, reloadToken]);

  return (
    <main className="admin-screen">
      <h1>Timers</h1>

      <div className="admin-controls">
        <button type="button" onClick={refresh} disabled={loading}>
          Refresh
        </button>
      </div>

      {items.length === 0 && !loading && <p className="admin-empty">No pending timers.</p>}

      {items.length > 0 && (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Instance</th>
              <th>Process</th>
              <th>Current step</th>
              <th>Fire time</th>
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.instanceId} className="admin-row-clickable" onClick={() => navigate({ name: "instance", instanceId: t.instanceId })}>
                <td>{t.instanceId}</td>
                <td>{t.processId}</td>
                <td>{t.currentStepId}</td>
                <td>
                  {isOverdue(t.nextTimerAt) && <span className="admin-badge admin-badge-overdue">overdue</span>} {new Date(t.nextTimerAt).toLocaleString()}
                </td>
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
