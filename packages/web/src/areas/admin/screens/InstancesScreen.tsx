import { useCallback, useEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import { listInstances } from "../api/client.js";
import type { DegradedInstanceSummary, InstanceStatus, InstanceSummaryItem } from "../api/types.js";
import type { Route } from "../routing.js";
import { useRefresh } from "../useRefresh.js";
import { describeCaughtError } from "../errors.js";
import { useFail } from "../../../shell/useFail.js";
import { usePagedList } from "../../../shell/usePagedList.js";
import { ErrorBanner } from "../../../shell/ErrorBanner.js";
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

/** `app.css`'s screen/controls/table/badge rules, as StyleX. `InstanceStatus`
 * is a closed union, so `badgeTone` is exhaustive (design.md D3). */
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

const badgeTone: Record<InstanceStatus, typeof styles.badgeOpen> = {
  running: styles.badgeOpen,
  completed: styles.badgeSettled,
  cancelled: styles.badgeDormant,
  faulted: styles.badgeRefusal,
};

export function InstancesScreen({ token, locale, navigate, onUnauthorized }: InstancesScreenProps) {
  const [error, setError] = useState<string | undefined>(undefined);
  const [filter, setFilter] = useState<InstanceFilterState>(EMPTY_INSTANCE_FILTER);
  const { reloadToken, refresh } = useRefresh();
  const fail = useFail(onUnauthorized, (err) => setError(describeCaughtError(err, locale)));

  const fetchPage = useCallback(
    async (cursor?: string) => {
      setError(undefined);
      try {
        const page = await listInstances(token, toListParams(filter, PAGE_LIMIT, cursor));
        return { items: page.items, cursor: page.cursor };
      } catch (err) {
        fail(err);
        throw err;
      }
    },
    [token, filter, fail],
  );
  const { items, cursor, loading, load, loadMore } = usePagedList<InstanceSummaryItem>(fetchPage);

  useEffect(() => {
    void load();
    // reloadToken bumps on window focus or an explicit refresh() — load()
    // itself changes identity whenever `filter` changes, so this effect also
    // re-runs on a filter edit.
  }, [load, reloadToken]);

  return (
    <main {...stylex.props(styles.screen)}>
      <h1>{t(locale, "instances.title")}</h1>

      <div {...stylex.props(styles.controls)}>
        {/* Every `value` here is the status token the route matches; only the label follows the locale. */}
        <select {...stylex.props(styles.controlsField)} value={filter.status} onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value }))}>
          <option value="">{t(locale, "common.allStatuses")}</option>
          <option value="running">{t(locale, "instances.statusRunning")}</option>
          <option value="completed">{t(locale, "instances.statusCompleted")}</option>
          <option value="cancelled">{t(locale, "instances.statusCancelled")}</option>
          <option value="faulted">{t(locale, "instances.statusFaulted")}</option>
        </select>
        <input
          {...stylex.props(styles.controlsField)}
          placeholder={t(locale, "instances.filterProcessId")}
          value={filter.processId}
          onChange={(e) => setFilter((f) => ({ ...f, processId: e.target.value }))}
        />
        <input
          {...stylex.props(styles.controlsField)}
          placeholder={t(locale, "instances.filterStepId")}
          value={filter.currentStepId}
          onChange={(e) => setFilter((f) => ({ ...f, currentStepId: e.target.value }))}
        />
        <input
          {...stylex.props(styles.controlsField)}
          placeholder={t(locale, "instances.filterStartedBy")}
          value={filter.startedBy}
          onChange={(e) => setFilter((f) => ({ ...f, startedBy: e.target.value }))}
        />
        <input
          {...stylex.props(styles.controlsField)}
          placeholder={t(locale, "instances.filterClaimedBy")}
          value={filter.claimedBy}
          onChange={(e) => setFilter((f) => ({ ...f, claimedBy: e.target.value }))}
        />
        {/* Every `value` here is the kind token the route matches; only the label follows the locale. */}
        <select {...stylex.props(styles.controlsField)} value={filter.kind} onChange={(e) => setFilter((f) => ({ ...f, kind: e.target.value }))}>
          <option value="">{t(locale, "instances.allKinds")}</option>
          <option value="published">{t(locale, "instances.kindPublished")}</option>
          <option value="test">{t(locale, "instances.kindTest")}</option>
        </select>
        <button type="button" className="btn btn-secondary" onClick={refresh} disabled={loading}>
          {t(locale, "common.refresh")}
        </button>
      </div>

      {error && <ErrorBanner error={error} locale={locale} onRetry={refresh} retryDisabled={loading} />}

      {items.length === 0 && !loading && !error && <p {...stylex.props(styles.empty)}>{t(locale, "instances.empty")}</p>}

      {items.length > 0 && (
        <table {...stylex.props(styles.table)}>
          <thead>
            <tr>
              <th {...stylex.props(styles.th)}>{t(locale, "instances.colProcess")}</th>
              <th {...stylex.props(styles.th)}>{t(locale, "instances.colStep")}</th>
              <th {...stylex.props(styles.th)}>{t(locale, "instances.colStatus")}</th>
              <th {...stylex.props(styles.th)}>{t(locale, "instances.colKind")}</th>
              <th {...stylex.props(styles.th)}>{t(locale, "instances.colStartedBy")}</th>
              <th {...stylex.props(styles.th)}>{t(locale, "instances.colClaimedBy")}</th>
              <th {...stylex.props(styles.th)}>{t(locale, "instances.colCreated")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) =>
              isDegraded(item) ? (
                <tr key={item.instanceId} {...stylex.props(styles.tr)}>
                  <td {...stylex.props(styles.td)}>{item.processId}</td>
                  <td {...stylex.props(styles.td)}>
                    <span {...stylex.props(styles.badge, styles.badgeRefusal)}>{item.reason}</span>
                  </td>
                  <td {...stylex.props(styles.td)}>
                    <span {...stylex.props(styles.badge, badgeTone[item.status])}>{item.status}</span>
                  </td>
                  <td {...stylex.props(styles.td)}>
                    {item.kind === "test" ? <span {...stylex.props(styles.badge, styles.badgeDormant)}>{item.kind}</span> : item.kind}
                  </td>
                  <td {...stylex.props(styles.td)}>{item.startedBy ?? "—"}</td>
                  <td {...stylex.props(styles.td)}>—</td>
                  <td {...stylex.props(styles.td)}>{new Date(item.createdAt).toLocaleString(locale)}</td>
                </tr>
              ) : (
                <tr key={item.instanceId} {...stylex.props(styles.tr)}>
                  <td {...stylex.props(styles.td)}>
                    <button
                      type="button"
                      {...stylex.props(styles.rowLink)}
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
                  <td {...stylex.props(styles.td)}>{labelText(item.stepLabel, item.processBaseLocale)}</td>
                  <td {...stylex.props(styles.td)}>
                    <span {...stylex.props(styles.badge, badgeTone[item.status])}>{item.status}</span>
                  </td>
                  <td {...stylex.props(styles.td)}>
                    {item.kind === "test" ? <span {...stylex.props(styles.badge, styles.badgeDormant)}>{item.kind}</span> : item.kind}
                  </td>
                  <td {...stylex.props(styles.td)}>{item.startedBy ?? "—"}</td>
                  <td {...stylex.props(styles.td)}>{item.assignment?.claimedBy ?? "—"}</td>
                  <td {...stylex.props(styles.td)}>{new Date(item.createdAt).toLocaleString(locale)}</td>
                </tr>
              ),
            )}
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
