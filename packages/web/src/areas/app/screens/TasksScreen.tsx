import { useCallback, useEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import { listInstances } from "../api/client.js";
import { describeCaughtError } from "../errors.js";
import { useFail } from "../../../shell/useFail.js";
import { usePagedList } from "../../../shell/usePagedList.js";
import { ErrorBanner } from "../../../shell/ErrorBanner.js";
import { t } from "../catalog.js";
import type { UiLocale } from "../../../i18n/locale.js";
import type { InstanceSummary } from "../api/types.js";
import type { Route } from "../routing.js";
import {
  filterByProcess,
  groupItems,
  isClaimedByCurrentUser,
  isUnclaimed,
  processLabelOf,
  processOptions,
  sortItems,
  stepLabelOf,
  waitingLabel,
  waitingSince,
  type GroupKey,
  type SortKey,
} from "./inboxLogic.js";

/** `app.css`'s row/list/stamp rules, as StyleX. `.app-stamp-mine` and
 * `.app-stamp-open` render identically (both accent-colored), so one
 * `stampOpen` style stands in for both. The hover-underline treatment on
 * `.app-task-step` uses `stylex.when.ancestor` (design.md D4), verified
 * against a real build; the link marks itself with `stylex.defaultMarker()`. */
const styles = stylex.create({
  screen: {
    maxWidth: "46rem",
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
  controlsSelect: {
    backgroundColor: colors.surface,
    color: colors.text,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
  },
  stamp: {
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
  stampOpen: {
    color: colors.accent,
  },
  taskList: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: colors.border,
  },
  taskRow: {
    display: "grid",
    gridTemplateColumns: { default: "auto 1fr auto", "@media (max-width: 40rem)": "1fr" },
    alignItems: "center",
    gap: space.s3,
    paddingBlock: space.s2,
    paddingInline: 0,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
    background: { default: "none", ":hover": colors.surfaceMuted },
  },
  taskLink: {
    display: "flex",
    alignItems: "baseline",
    gap: space.s2,
    width: "100%",
    background: "none",
    borderWidth: 0,
    margin: 0,
    paddingBlock: space.s1,
    paddingInline: 0,
    font: "inherit",
    color: "inherit",
    textAlign: "left",
    cursor: "pointer",
  },
  taskProcess: {
    color: colors.textMuted,
    fontSize: 13,
  },
  taskStep: {
    fontWeight: 600,
    textDecoration: { default: "none", [stylex.when.ancestor(":hover")]: "underline" },
  },
  taskWaiting: {
    fontFamily: fonts.mono,
    fontVariantNumeric: "tabular-nums",
    color: colors.textMuted,
    textAlign: { default: "right", "@media (max-width: 40rem)": "left" },
  },
  empty: {
    color: colors.textMuted,
    paddingBlock: space.s4,
    paddingInline: 0,
  },
  loadMore: {
    marginTop: space.s3,
  },
  caveat: {
    fontSize: "0.8rem",
    color: colors.textMuted,
  },
});

interface TasksScreenProps {
  token: string;
  actorId: string;
  locale: UiLocale;
  navigate: (route: Route) => void;
  onUnauthorized: () => void;
}

export function TasksScreen({ token, actorId, locale, navigate, onUnauthorized }: TasksScreenProps) {
  const [error, setError] = useState<string | undefined>(undefined);
  const fail = useFail(onUnauthorized, (err) => setError(describeCaughtError(err, locale)));
  const [processFilter, setProcessFilter] = useState<string | "all">("all");
  const [sort, setSort] = useState<SortKey>("waiting");
  const [group, setGroup] = useState<GroupKey>("none");

  const fetchPage = useCallback(
    async (cursor?: string) => {
      setError(undefined);
      try {
        const page = await listInstances("mine", token, { limit: 200, cursor });
        return { items: page.items, cursor: page.cursor };
      } catch (err) {
        fail(err);
        throw err;
      }
    },
    [token, fail],
  );
  const { items, cursor, loading, load, loadMore } = usePagedList<InstanceSummary>(fetchPage);

  useEffect(() => {
    void load();
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const visible = sortItems(filterByProcess(items, processFilter), sort, locale);
  const groups = groupItems(visible, group, locale);

  const screenProps = stylex.props(styles.screen);
  return (
    <main className={`app-tasks ${screenProps.className}`} style={screenProps.style}>
      <h1>{t(locale, "tasks.title")}</h1>

      <div {...stylex.props(styles.controls)}>
        <select {...stylex.props(styles.controlsSelect)} value={processFilter} onChange={(e) => setProcessFilter(e.target.value)}>
          <option value="all">{t(locale, "tasks.filterAllProcesses")}</option>
          {processOptions(items, locale).map((p) => (
            <option key={p.processId} value={p.processId}>
              {p.label}
            </option>
          ))}
        </select>
        <select {...stylex.props(styles.controlsSelect)} value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="waiting">{t(locale, "tasks.sortWaiting")}</option>
          <option value="recent">{t(locale, "tasks.sortRecent")}</option>
          <option value="process">{t(locale, "tasks.sortProcess")}</option>
        </select>
        <select {...stylex.props(styles.controlsSelect)} value={group} onChange={(e) => setGroup(e.target.value as GroupKey)}>
          <option value="none">{t(locale, "tasks.groupNone")}</option>
          <option value="process">{t(locale, "tasks.groupByProcess")}</option>
        </select>
        <button type="button" className="btn btn-secondary" onClick={() => void load()} disabled={loading}>
          {t(locale, "tasks.refresh")}
        </button>
      </div>

      {error && <ErrorBanner error={error} locale={locale} onRetry={() => void load()} retryDisabled={loading} />}

      {visible.length === 0 && !loading && !error && <p {...stylex.props(styles.empty)}>{t(locale, "tasks.empty")}</p>}

      {groups.map((g, gi) => (
        <section key={g.processId ?? gi} className="app-task-group">
          {g.label && <h2>{g.label}</h2>}
          <ul {...stylex.props(styles.taskList)}>
            {g.items.map((item) => (
              <li key={item.instanceId} {...stylex.props(styles.taskRow)}>
                <span {...stylex.props(styles.stamp, styles.stampOpen)}>
                  {isClaimedByCurrentUser(item, actorId) ? t(locale, "tasks.claimedByYou") : isUnclaimed(item) ? t(locale, "tasks.unclaimed") : ""}
                </span>
                <button
                  type="button"
                  {...stylex.props(styles.taskLink, stylex.defaultMarker())}
                  onClick={() => navigate({ name: "task", instanceId: item.instanceId })}
                >
                  <span {...stylex.props(styles.taskProcess)}>{processLabelOf(item, locale)}</span>
                  <span {...stylex.props(styles.taskStep)}>{stepLabelOf(item, locale)}</span>
                </button>
                <span {...stylex.props(styles.taskWaiting)}>{waitingLabel(waitingSince(item), locale)}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {cursor && (
        <div {...stylex.props(styles.loadMore)}>
          <button type="button" className="btn btn-secondary" onClick={() => void loadMore()} disabled={loading}>
            {t(locale, "tasks.loadMore")}
          </button>
          <p {...stylex.props(styles.caveat)}>{t(locale, "tasks.loadMoreCaveat")}</p>
        </div>
      )}
    </main>
  );
}
