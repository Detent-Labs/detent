import { useCallback, useEffect, useState } from "react";
import { discardOutboxRow, listOutbox, retryOutboxRow, AdminClientError } from "../api/client.js";
import type { OutboxRow } from "../api/types.js";
import { useRefresh } from "../useRefresh.js";
import { describeCaughtError } from "../errors.js";

interface OutboxScreenProps {
  token: string;
  onUnauthorized: () => void;
}

const PAGE_LIMIT = 50;

const RETRY_CONFIRM =
  "Retrying re-runs this action's side effect. A handler that honours the idempotency key (e.g. http.request's Idempotency-Key header) deduplicates it downstream — one that doesn't may repeat it. Continue?";

export function OutboxScreen({ token, onUnauthorized }: OutboxScreenProps) {
  const [items, setItems] = useState<OutboxRow[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [statusFilter, setStatusFilter] = useState("");
  const [instanceIdFilter, setInstanceIdFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [busyKey, setBusyKey] = useState<string | undefined>(undefined);
  const { reloadToken, refresh } = useRefresh();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const page = await listOutbox(token, {
        status: statusFilter ? [statusFilter] : undefined,
        instanceId: instanceIdFilter || undefined,
        limit: PAGE_LIMIT,
      });
      setItems(page.items);
      setCursor(page.cursor);
      setCounts(page.counts);
    } catch (err) {
      if (err instanceof AdminClientError && err.status === 401) onUnauthorized();
      else setError(describeCaughtError(err));
    } finally {
      setLoading(false);
    }
  }, [token, statusFilter, instanceIdFilter, onUnauthorized]);

  const loadMore = useCallback(async () => {
    if (!cursor) return;
    setLoading(true);
    setError(undefined);
    try {
      const page = await listOutbox(token, {
        status: statusFilter ? [statusFilter] : undefined,
        instanceId: instanceIdFilter || undefined,
        limit: PAGE_LIMIT,
        cursor,
      });
      setItems((prev) => [...prev, ...page.items]);
      setCursor(page.cursor);
    } catch (err) {
      if (err instanceof AdminClientError && err.status === 401) onUnauthorized();
      else setError(describeCaughtError(err));
    } finally {
      setLoading(false);
    }
  }, [token, statusFilter, instanceIdFilter, cursor, onUnauthorized]);

  useEffect(() => {
    void load();
  }, [load, reloadToken]);

  const doRetry = async (key: string) => {
    if (!window.confirm(RETRY_CONFIRM)) return;
    setBusyKey(key);
    try {
      await retryOutboxRow(key, token);
      refresh();
    } catch (err) {
      if (err instanceof AdminClientError && err.status === 401) onUnauthorized();
      else setError(describeCaughtError(err));
    } finally {
      setBusyKey(undefined);
    }
  };

  const doDiscard = async (key: string) => {
    setBusyKey(key);
    try {
      await discardOutboxRow(key, token);
      refresh();
    } catch (err) {
      if (err instanceof AdminClientError && err.status === 401) onUnauthorized();
      else setError(describeCaughtError(err));
    } finally {
      setBusyKey(undefined);
    }
  };

  return (
    <main className="admin-screen">
      <h1>Outbox</h1>

      <div className="admin-counts">
        {Object.entries(counts).map(([status, n]) => (
          <span key={status} className="admin-count-pill">
            {status}: {n}
          </span>
        ))}
      </div>

      <div className="admin-controls">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="claimed">Claimed</option>
          <option value="delivered">Delivered</option>
          <option value="dead-letter">Dead letter</option>
          <option value="discarded">Discarded</option>
        </select>
        <input placeholder="Instance id" value={instanceIdFilter} onChange={(e) => setInstanceIdFilter(e.target.value)} />
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

      {items.length === 0 && !loading && !error && <p className="admin-empty">No outbox rows match these filters.</p>}

      {items.length > 0 && (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Instance</th>
              <th>Status</th>
              <th>Attempts</th>
              <th>Last error</th>
              <th>Idempotency key</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.idempotencyKey}>
                <td>{row.type}</td>
                <td>{row.instanceId}</td>
                <td>
                  <span className={`admin-badge admin-badge-${row.status}`}>{row.status}</span>
                </td>
                <td>{row.attempts}</td>
                <td>{row.lastError ?? "—"}</td>
                <td>{row.idempotencyKey}</td>
                <td>
                  {row.status === "dead-letter" && (
                    <>
                      <button type="button" onClick={() => void doRetry(row.idempotencyKey)} disabled={busyKey === row.idempotencyKey}>
                        Retry
                      </button>{" "}
                      <button type="button" onClick={() => void doDiscard(row.idempotencyKey)} disabled={busyKey === row.idempotencyKey}>
                        Discard
                      </button>
                    </>
                  )}
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
