import { useCallback, useEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import { listPendingTimers } from "../api/client.js";
import type { PendingTimer } from "../api/types.js";
import type { Route } from "../routing.js";
import { useRefresh } from "../useRefresh.js";
import { describeCaughtError } from "../errors.js";
import { useFail } from "../../../shell/useFail.js";
import { usePagedList } from "../../../shell/usePagedList.js";
import { ErrorBanner } from "../../../shell/ErrorBanner.js";
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

/** `app.css`'s screen/controls/table/badge/load-more rules, as StyleX. */
const styles = stylex.create({
  screen: {
    maxWidth: "60rem",
    marginInline: "auto",
    paddingTop: space.s4,
    paddingInline: space.s3,
    paddingBottom: space.s6,
  },
  controls: {
    display: "flex",
    flexWrap: "wrap",
    gap: space.s2,
    marginBottom: space.s3,
    alignItems: "center",
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
  rowLink: {
    background: "none",
    borderWidth: 0,
    margin: 0,
    padding: 0,
    font: "inherit",
    color: "inherit",
    textAlign: "left",
    cursor: "pointer",
    textDecoration: { default: "none", ":hover": "underline" },
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
  badgeOverdue: {
    color: colors.surface,
    backgroundColor: colors.refusal,
    borderColor: colors.refusal,
  },
  loadMore: {
    marginTop: space.s3,
  },
});

export function TimersScreen({ token, locale, navigate, onUnauthorized }: TimersScreenProps) {
  const [error, setError] = useState<string | undefined>(undefined);
  const { reloadToken, refresh } = useRefresh();
  const fail = useFail(onUnauthorized, (err) => setError(describeCaughtError(err, locale)));

  const fetchPage = useCallback(
    async (cursor?: string) => {
      setError(undefined);
      try {
        const page = await listPendingTimers(token, { limit: PAGE_LIMIT, cursor });
        return { items: page.items, cursor: page.cursor };
      } catch (err) {
        fail(err);
        throw err;
      }
    },
    [token, fail],
  );
  const { items, cursor, loading, load, loadMore } = usePagedList<PendingTimer>(fetchPage);

  useEffect(() => {
    void load();
  }, [load, reloadToken]);

  return (
    <main {...stylex.props(styles.screen)}>
      <h1>{t(locale, "timers.title")}</h1>

      <div {...stylex.props(styles.controls)}>
        <button type="button" className="btn btn-secondary" onClick={refresh} disabled={loading}>
          {t(locale, "common.refresh")}
        </button>
      </div>

      {error && <ErrorBanner error={error} locale={locale} onRetry={refresh} retryDisabled={loading} />}

      {items.length === 0 && !loading && !error && <p {...stylex.props(styles.empty)}>{t(locale, "timers.empty")}</p>}

      {items.length > 0 && (
        <table {...stylex.props(styles.table)}>
          <thead>
            <tr>
              <th {...stylex.props(styles.th)}>{t(locale, "timers.colInstance")}</th>
              <th {...stylex.props(styles.th)}>{t(locale, "timers.colProcess")}</th>
              <th {...stylex.props(styles.th)}>{t(locale, "timers.colStep")}</th>
              <th {...stylex.props(styles.th)}>{t(locale, "timers.colFireTime")}</th>
            </tr>
          </thead>
          <tbody>
            {/* `row`, not `t`: the catalog lookup owns that name in this file now. */}
            {items.map((row) => (
              <tr key={row.instanceId} {...stylex.props(styles.tr)}>
                <td {...stylex.props(styles.td)}>
                  <button
                    type="button"
                    {...stylex.props(styles.rowLink)}
                    aria-label={tFill(locale, "timers.openRow", { instance: row.instanceId, process: row.processId, step: row.currentStepId })}
                    onClick={() => navigate({ name: "instance", instanceId: row.instanceId })}
                  >
                    {row.instanceId}
                  </button>
                </td>
                <td {...stylex.props(styles.td)}>{row.processId}</td>
                <td {...stylex.props(styles.td)}>{row.currentStepId}</td>
                <td {...stylex.props(styles.td)}>
                  {isOverdue(row.nextTimerAt) && <span {...stylex.props(styles.badge, styles.badgeOverdue)}>{t(locale, "timers.overdue")}</span>}{" "}
                  {new Date(row.nextTimerAt).toLocaleString(locale)}
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
