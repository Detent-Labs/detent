import { useCallback, useEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
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

/** `app.css`'s screen/counts/controls/table/badge rules, as StyleX.
 * `OutboxRow.status` is a bare `string` (open-ended), so `badgeTone` is a
 * partial lookup: an unmatched status (e.g. `claimed`, which `app.css`
 * never gave its own rule either) falls back to the bare `badge` style,
 * with no color override (design.md D3). */
const styles = stylex.create({
  screen: {
    maxWidth: "60rem",
    marginInline: "auto",
    paddingTop: space.s4,
    paddingInline: space.s3,
    paddingBottom: space.s6,
  },
  counts: {
    display: "flex",
    flexWrap: "wrap",
    gap: space.s2,
    marginBottom: space.s3,
  },
  countPill: {
    fontFamily: fonts.mono,
    fontSize: 12,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
    paddingBlock: 2,
    paddingInline: 8,
  },
  controls: {
    display: "flex",
    flexWrap: "wrap",
    gap: space.s2,
    marginBottom: space.s3,
    alignItems: "center",
  },
  controlsField: {
    backgroundColor: colors.surface,
    color: colors.text,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
  },
  empty: {
    color: colors.textMuted,
    paddingBlock: space.s4,
    paddingInline: 0,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "0.9rem",
  },
  th: {
    textAlign: "left",
    fontFamily: fonts.body,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: colors.textMuted,
    padding: space.s2,
    borderBottomWidth: 2,
    borderBottomStyle: "solid",
    borderBottomColor: colors.divider,
  },
  td: {
    padding: space.s2,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
    verticalAlign: "top",
  },
  tr: {
    background: { default: "none", ":hover": colors.surfaceMuted },
  },
  badge: {
    display: "inline-block",
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: "currentcolor",
    paddingBlock: 2,
    paddingInline: 7,
  },
  badgeOpen: {
    color: colors.accent,
  },
  badgeSettled: {
    color: colors.text,
  },
  badgeDormant: {
    color: { default: "#726e6e", "@media (prefers-color-scheme: dark)": colors.neutral500 },
  },
  badgeRefusal: {
    color: colors.surface,
    backgroundColor: colors.refusal,
    borderColor: colors.refusal,
  },
  loadMore: {
    marginTop: space.s3,
  },
});

const badgeTone: Partial<Record<string, typeof styles.badgeOpen>> = {
  pending: styles.badgeOpen,
  delivered: styles.badgeSettled,
  discarded: styles.badgeDormant,
  "dead-letter": styles.badgeRefusal,
};

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
    <main {...stylex.props(styles.screen)}>
      <h1>{t(locale, "outbox.title")}</h1>

      <div {...stylex.props(styles.counts)}>
        {Object.entries(counts).map(([status, n]) => (
          <span key={status} {...stylex.props(styles.countPill)}>
            {status}: {n}
          </span>
        ))}
      </div>

      <div {...stylex.props(styles.controls)}>
        {/* Every `value` here is the status token the route matches; only the label follows the locale. */}
        <select {...stylex.props(styles.controlsField)} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">{t(locale, "common.allStatuses")}</option>
          <option value="pending">{t(locale, "outbox.statusPending")}</option>
          <option value="claimed">{t(locale, "outbox.statusClaimed")}</option>
          <option value="delivered">{t(locale, "outbox.statusDelivered")}</option>
          <option value="dead-letter">{t(locale, "outbox.statusDeadLetter")}</option>
          <option value="discarded">{t(locale, "outbox.statusDiscarded")}</option>
        </select>
        <input
          {...stylex.props(styles.controlsField)}
          placeholder={t(locale, "outbox.filterInstanceId")}
          value={instanceIdFilter}
          onChange={(e) => setInstanceIdFilter(e.target.value)}
        />
        <button type="button" className="btn btn-secondary" onClick={refresh} disabled={loading}>
          {t(locale, "common.refresh")}
        </button>
      </div>

      {error && <ErrorBanner error={error} locale={locale} onRetry={refresh} retryDisabled={loading} />}

      {items.length === 0 && !loading && !error && <p {...stylex.props(styles.empty)}>{t(locale, "outbox.empty")}</p>}

      {items.length > 0 && (
        <table {...stylex.props(styles.table)}>
          <thead>
            <tr>
              <th {...stylex.props(styles.th)}>{t(locale, "outbox.colType")}</th>
              <th {...stylex.props(styles.th)}>{t(locale, "outbox.colInstance")}</th>
              <th {...stylex.props(styles.th)}>{t(locale, "outbox.colStatus")}</th>
              <th {...stylex.props(styles.th)}>{t(locale, "outbox.colAttempts")}</th>
              <th {...stylex.props(styles.th)}>{t(locale, "outbox.colLastError")}</th>
              <th {...stylex.props(styles.th)}>{t(locale, "outbox.colIdempotencyKey")}</th>
              <th {...stylex.props(styles.th)} />
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.idempotencyKey} {...stylex.props(styles.tr)}>
                <td {...stylex.props(styles.td)}>{row.type}</td>
                <td {...stylex.props(styles.td)}>{row.instanceId}</td>
                <td {...stylex.props(styles.td)}>
                  <span {...stylex.props(styles.badge, badgeTone[row.status])}>{row.status}</span>
                </td>
                <td {...stylex.props(styles.td)}>{row.attempts}</td>
                <td {...stylex.props(styles.td)}>{row.lastError ?? "—"}</td>
                <td {...stylex.props(styles.td)}>{row.idempotencyKey}</td>
                <td {...stylex.props(styles.td)}>
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
        <div {...stylex.props(styles.loadMore)}>
          <button type="button" className="btn btn-secondary" onClick={() => void loadMore()} disabled={loading}>
            {t(locale, "common.loadMore")}
          </button>
        </div>
      )}
    </main>
  );
}
