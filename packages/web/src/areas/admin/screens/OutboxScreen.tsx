import { useCallback, useEffect, useState } from "react";
import { discardOutboxRow, listOutbox, retryOutboxRow, AdminClientError } from "../api/client.js";
import type { OutboxRow } from "../api/types.js";
import { useRefresh } from "../useRefresh.js";
import { describeCaughtError } from "../errors.js";
import { t } from "../catalog.js";
import type { UiLocale } from "../../../i18n/locale.js";

interface OutboxScreenProps {
  token: string;
  locale: UiLocale;
  onUnauthorized: () => void;
}

const PAGE_LIMIT = 50;

export function OutboxScreen({ token, locale, onUnauthorized }: OutboxScreenProps) {
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
      else setError(describeCaughtError(err, locale));
    } finally {
      setLoading(false);
    }
  }, [token, statusFilter, instanceIdFilter, locale, onUnauthorized]);

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
      else setError(describeCaughtError(err, locale));
    } finally {
      setLoading(false);
    }
  }, [token, statusFilter, instanceIdFilter, cursor, locale, onUnauthorized]);

  useEffect(() => {
    void load();
  }, [load, reloadToken]);

  const doRetry = async (key: string) => {
    if (!window.confirm(t(locale, "outbox.retryConfirm"))) return;
    setBusyKey(key);
    try {
      await retryOutboxRow(key, token);
      refresh();
    } catch (err) {
      if (err instanceof AdminClientError && err.status === 401) onUnauthorized();
      else setError(describeCaughtError(err, locale));
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
      else setError(describeCaughtError(err, locale));
    } finally {
      setBusyKey(undefined);
    }
  };

  return (
    <main className="admin-screen">
      <h1>{t(locale, "outbox.title")}</h1>

      <div className="admin-counts">
        {Object.entries(counts).map(([status, n]) => (
          <span key={status} className="admin-count-pill">
            {status}: {n}
          </span>
        ))}
      </div>

      <div className="admin-controls">
        {/* Every `value` here is the status token the route matches; only the label follows the locale. */}
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">{t(locale, "common.allStatuses")}</option>
          <option value="pending">{t(locale, "outbox.statusPending")}</option>
          <option value="claimed">{t(locale, "outbox.statusClaimed")}</option>
          <option value="delivered">{t(locale, "outbox.statusDelivered")}</option>
          <option value="dead-letter">{t(locale, "outbox.statusDeadLetter")}</option>
          <option value="discarded">{t(locale, "outbox.statusDiscarded")}</option>
        </select>
        <input placeholder={t(locale, "outbox.filterInstanceId")} value={instanceIdFilter} onChange={(e) => setInstanceIdFilter(e.target.value)} />
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

      {items.length === 0 && !loading && !error && <p className="admin-empty">{t(locale, "outbox.empty")}</p>}

      {items.length > 0 && (
        <table className="admin-table">
          <thead>
            <tr>
              <th>{t(locale, "outbox.colType")}</th>
              <th>{t(locale, "outbox.colInstance")}</th>
              <th>{t(locale, "outbox.colStatus")}</th>
              <th>{t(locale, "outbox.colAttempts")}</th>
              <th>{t(locale, "outbox.colLastError")}</th>
              <th>{t(locale, "outbox.colIdempotencyKey")}</th>
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
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => void doRetry(row.idempotencyKey)}
                        disabled={busyKey === row.idempotencyKey}
                      >
                        {t(locale, "common.retry")}
                      </button>{" "}
                      <button
                        type="button"
                        className="btn btn-secondary btn-destructive"
                        onClick={() => void doDiscard(row.idempotencyKey)}
                        disabled={busyKey === row.idempotencyKey}
                      >
                        {t(locale, "outbox.discard")}
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
          <button type="button" className="btn btn-secondary" onClick={() => void loadMore()} disabled={loading}>
            {t(locale, "common.loadMore")}
          </button>
        </div>
      )}
    </main>
  );
}
