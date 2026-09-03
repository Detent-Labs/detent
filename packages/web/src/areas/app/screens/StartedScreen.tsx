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
import { processLabelOf, startedOnLabel, statusKey, statusTone, stepLabelOf } from "./startedLogic.js";

/** `app.css`'s row/list/stamp rules, as StyleX. `statusTone` already
 * narrows to the four closed tone values `design-language.md` fixes, so
 * `stampTone` is exhaustive with no fallback branch to reach (design.md
 * D3). The hover-underline on `.app-task-step` uses `stylex.when.ancestor`
 * (design.md D4), the same shape `TasksScreen.tsx` already verified. */
const styles = stylex.create({
  screen: {
    maxWidth: "46rem",
    marginInline: "auto",
    paddingTop: space.s4,
    paddingInline: space.s3,
    paddingBottom: space.s6,
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
  stampSettled: {
    color: colors.text,
  },
  stampDormant: {
    color: { default: "#726e6e", "@media (prefers-color-scheme: dark)": colors.neutral500 },
  },
  stampRefusal: {
    color: colors.surface,
    backgroundColor: colors.refusal,
    borderColor: colors.refusal,
  },
  empty: {
    color: colors.textMuted,
    paddingBlock: space.s4,
    paddingInline: 0,
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
  startedDate: {
    marginLeft: "auto",
    fontFamily: fonts.mono,
    fontSize: 13,
    color: colors.textMuted,
    whiteSpace: "nowrap",
  },
  loadMore: {
    marginTop: space.s3,
  },
});

const stampTone: Record<ReturnType<typeof statusTone>, typeof styles.stampOpen> = {
  open: styles.stampOpen,
  settled: styles.stampSettled,
  dormant: styles.stampDormant,
  refusal: styles.stampRefusal,
};

interface StartedScreenProps {
  token: string;
  locale: UiLocale;
  navigate: (route: Route) => void;
  onUnauthorized: () => void;
}

/**
 * Every case this participant raised, whatever became of it.
 *
 * The inbox answers "what is waiting on me". This answers "what happened to
 * the thing I sent", which is a different question with a different shape: a
 * completed or cancelled case is the common answer here and never appears
 * there. So the list carries every status and sorts by nothing but the
 * server's own newest-first order.
 *
 * No filter, no sort, no grouping. The inbox carries those because a queue of
 * live work needs them. A register of what one person started does not, and
 * the load-more here needs no caveat about a sort it does not apply.
 */
export function StartedScreen({ token, locale, navigate, onUnauthorized }: StartedScreenProps) {
  const [error, setError] = useState<string | undefined>(undefined);
  const fail = useFail(onUnauthorized, (err) => setError(describeCaughtError(err, locale)));

  const fetchPage = useCallback(
    async (cursor?: string) => {
      setError(undefined);
      try {
        const page = await listInstances("started", token, { limit: 200, cursor });
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

  const screenProps = stylex.props(styles.screen);
  return (
    <main className={`app-tasks ${screenProps.className}`} style={screenProps.style}>
      <h1>{t(locale, "started.title")}</h1>

      {error && <ErrorBanner error={error} locale={locale} onRetry={() => void load()} retryDisabled={loading} />}

      {items.length === 0 && !loading && !error && <p {...stylex.props(styles.empty)}>{t(locale, "started.empty")}</p>}

      {items.length > 0 && (
        <ul {...stylex.props(styles.taskList)}>
          {items.map((item) => (
            <li key={item.instanceId} {...stylex.props(styles.taskRow)}>
              <span {...stylex.props(styles.stamp, stampTone[statusTone(item.status)])}>{t(locale, statusKey(item.status))}</span>
              <button
                type="button"
                {...stylex.props(styles.taskLink, stylex.defaultMarker())}
                onClick={() => navigate({ name: "task", instanceId: item.instanceId })}
              >
                <span {...stylex.props(styles.taskProcess)}>{processLabelOf(item, locale)}</span>
                <span {...stylex.props(styles.taskStep)}>{stepLabelOf(item, locale)}</span>
              </button>
              <span {...stylex.props(styles.startedDate)}>{startedOnLabel(item, locale)}</span>
            </li>
          ))}
        </ul>
      )}

      {cursor && (
        <div {...stylex.props(styles.loadMore)}>
          <button type="button" className="btn btn-secondary" onClick={() => void loadMore()} disabled={loading}>
            {t(locale, "started.loadMore")}
          </button>
        </div>
      )}
    </main>
  );
}
