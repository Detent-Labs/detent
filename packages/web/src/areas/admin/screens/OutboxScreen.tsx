import { useCallback, useEffect, useState } from "react";
import { discardOutboxRow, listOutbox, retryOutboxRow } from "../api/client.js";
import type { OutboxRow } from "../api/types.js";
import { useRefresh } from "../useRefresh.js";
import { describeCaughtError } from "../errors.js";
import { useFail } from "../../../shell/useFail.js";
import { usePagedList } from "../../../shell/usePagedList.js";
import { ErrorBanner } from "../../../shell/ErrorBanner.js";
import { t } from "../catalog.js";
import type { UiLocale } from "../../../i18n/locale.js";

interface OutboxScreenProps {
  token: string;
  locale: UiLocale;
  onUnauthorized: () => void;
}

const PAGE_LIMIT = 50;

export function OutboxScreen({ token, locale, onUnauthorized }: OutboxScreenProps) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [statusFilter, setStatusFilter] = useState("");
  const [instanceIdFilter, setInstanceIdFilter] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [busyKey, setBusyKey] = useState<string | undefined>(undefined);
  const { reloadToken, refresh } = useRefresh();
  const fail = useFail(onUnauthorized, (err) => setError(describeCaughtError(err, locale)));

  const fetchPage = useCallback(
    async (cursor?: string) => {
      setError(undefined);
      try {
        const page = await listOutbox(token, {
          status: statusFilter ? [statusFilter] : undefined,
          instanceId: instanceIdFilter || undefined,
          limit: PAGE_LIMIT,
          cursor,
        });
        // Only the initial load refreshes the pill counts; today's loadMore
        // never touched them, and an unconditional call here would start
        // refreshing them on every page, a real behavior change.
        if (cursor === undefined) setCounts(page.counts);
        return { items: page.items, cursor: page.cursor };
      } catch (err) {
        fail(err);
        throw err;
      }
    },
    [token, statusFilter, instanceIdFilter, fail],
  );
  const { items, cursor, loading, load, loadMore } = usePagedList<OutboxRow>(fetchPage);

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
      fail(err);
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
      fail(err);
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

      {error && <ErrorBanner error={error} locale={locale} onRetry={refresh} retryDisabled={loading} />}

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
