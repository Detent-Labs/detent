import { useCallback, useEffect, useState } from "react";
import { listMyTasks } from "../api/client.js";
import { AppClientError } from "../api/client.js";
import { describeCaughtError } from "../errors.js";
import { t } from "../i18n/catalog.js";
import type { UiLocale } from "../i18n/locale.js";
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

interface TasksScreenProps {
  token: string;
  actorId: string;
  locale: UiLocale;
  navigate: (route: Route) => void;
  onUnauthorized: () => void;
}

export function TasksScreen({ token, actorId, locale, navigate, onUnauthorized }: TasksScreenProps) {
  const [items, setItems] = useState<InstanceSummary[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [processFilter, setProcessFilter] = useState<string | "all">("all");
  const [sort, setSort] = useState<SortKey>("waiting");
  const [group, setGroup] = useState<GroupKey>("none");

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const page = await listMyTasks(token, { limit: 200 });
      setItems(page.items);
      setCursor(page.cursor);
    } catch (err) {
      if (err instanceof AppClientError && err.status === 401) onUnauthorized();
      else setError(describeCaughtError(err, locale));
    } finally {
      setLoading(false);
    }
  }, [token, onUnauthorized, locale]);

  const loadMore = useCallback(async () => {
    if (!cursor) return;
    setLoading(true);
    setError(undefined);
    try {
      const page = await listMyTasks(token, { limit: 200, cursor });
      setItems((prev) => [...prev, ...page.items]);
      setCursor(page.cursor);
    } catch (err) {
      if (err instanceof AppClientError && err.status === 401) onUnauthorized();
      else setError(describeCaughtError(err, locale));
    } finally {
      setLoading(false);
    }
  }, [token, cursor, onUnauthorized, locale]);

  useEffect(() => {
    void load();
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const visible = sortItems(filterByProcess(items, processFilter), sort, locale);
  const groups = groupItems(visible, group, locale);

  return (
    <main className="app-screen app-tasks">
      <h1>{t(locale, "tasks.title")}</h1>

      <div className="app-controls">
        <select value={processFilter} onChange={(e) => setProcessFilter(e.target.value)}>
          <option value="all">{t(locale, "tasks.filterAllProcesses")}</option>
          {processOptions(items, locale).map((p) => (
            <option key={p.processId} value={p.processId}>
              {p.label}
            </option>
          ))}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="waiting">{t(locale, "tasks.sortWaiting")}</option>
          <option value="recent">{t(locale, "tasks.sortRecent")}</option>
          <option value="process">{t(locale, "tasks.sortProcess")}</option>
        </select>
        <select value={group} onChange={(e) => setGroup(e.target.value as GroupKey)}>
          <option value="none">{t(locale, "tasks.groupNone")}</option>
          <option value="process">{t(locale, "tasks.groupByProcess")}</option>
        </select>
        <button type="button" onClick={() => void load()} disabled={loading}>
          {t(locale, "tasks.refresh")}
        </button>
      </div>

      {error && (
        <div className="app-error-banner" role="alert">
          <span className="app-error-banner-stamp">{t(locale, "error.failed")}</span>
          <span className="app-error-banner-message">{error}</span>
          <button type="button" onClick={() => void load()} disabled={loading}>
            {t(locale, "error.retry")}
          </button>
        </div>
      )}

      {visible.length === 0 && !loading && !error && <p className="app-empty">{t(locale, "tasks.empty")}</p>}

      {groups.map((g, gi) => (
        <section key={g.processId ?? gi} className="app-task-group">
          {g.label && <h2>{g.label}</h2>}
          <ul className="app-task-list">
            {g.items.map((item) => (
              <li key={item.instanceId} className="app-task-row" onClick={() => navigate({ name: "task", instanceId: item.instanceId })}>
                <span className={`app-stamp ${isClaimedByCurrentUser(item, actorId) ? "app-stamp-mine" : "app-stamp-open"}`}>
                  {isClaimedByCurrentUser(item, actorId) ? t(locale, "tasks.claimedByYou") : isUnclaimed(item) ? t(locale, "tasks.unclaimed") : ""}
                </span>
                <span className="app-task-process">{processLabelOf(item, locale)}</span>
                <span className="app-task-step">{stepLabelOf(item, locale)}</span>
                <span className="app-task-waiting">{waitingLabel(waitingSince(item), locale)}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {cursor && (
        <div className="app-load-more">
          <button type="button" onClick={() => void loadMore()} disabled={loading}>
            {t(locale, "tasks.loadMore")}
          </button>
          <p className="app-caveat">{t(locale, "tasks.loadMoreCaveat")}</p>
        </div>
      )}
    </main>
  );
}
