import { useEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import { fetchBottleneck } from "../api/client.js";
import { describeCaughtError, formatDuration, rankByMedian, scaleTo, stepName, type DateRange } from "./reportingLogic.js";
import { DurationRule, EmptyState, ErrorNote, ScopeNote, SkippedNote, WaitingNote } from "../components.js";
import { t } from "../catalog.js";
import type { UiLocale } from "../../../i18n/locale.js";
import type { BottleneckView, ClientError } from "../api/types.js";

/**
 * The same duration rule as Cycle-Time, re-sorted — which is the honest
 * picture, since both read the same per-step traversals. The two scopes differ
 * on purpose (this one counts every status), so each states its own.
 */
/** `app.css`'s table/measure/wip rules, as StyleX. `thRow` merges
 * `.rep-table th[scope="row"]`'s two source declarations (design.md D12). */
const styles = stylex.create({
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "0.9rem",
  },
  thCol: {
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
    fontWeight: 600,
  },
  thRow: {
    textAlign: "left",
    fontWeight: 500,
    padding: space.s2,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
    verticalAlign: "middle",
  },
  td: {
    padding: space.s2,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
    verticalAlign: "middle",
  },
  measure: {
    display: "flex",
    alignItems: "center",
    gap: space.s3,
    minWidth: "12rem",
  },
  figure: {
    fontFamily: fonts.mono,
    fontVariantNumeric: "tabular-nums",
    fontSize: "0.85rem",
    whiteSpace: "nowrap",
  },
  wip: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexWrap: "wrap",
    gap: space.s2,
  },
  wipItem: {
    display: "flex",
    alignItems: "baseline",
    gap: space.s2,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
    paddingBlock: space.s2,
    paddingInline: space.s3,
  },
  wipCount: {
    fontFamily: fonts.mono,
    fontVariantNumeric: "tabular-nums",
    fontSize: "1.1rem",
    fontWeight: 600,
  },
});

export function BottleneckScreen({
  processId,
  range,
  token,
  baseLocale,
  locale,
}: {
  processId: string;
  range: DateRange;
  token: string;
  baseLocale: string;
  locale: UiLocale;
}) {
  const [view, setView] = useState<BottleneckView | undefined>();
  const [error, setError] = useState<ClientError | undefined>();

  useEffect(() => {
    let cancelled = false;
    setView(undefined);
    setError(undefined);
    fetchBottleneck(processId, range, token)
      .then((v) => { if (!cancelled) setView(v); })
      .catch((cause: unknown) => { if (!cancelled) setError(describeCaughtError(cause)); });
    return () => { cancelled = true; };
  }, [processId, range, token]);

  if (error) return <ErrorNote error={error} locale={locale} />;
  if (!view) return <WaitingNote locale={locale} />;

  const ranked = rankByMedian(view.ranking);
  const scale = scaleTo(ranked.map((s) => s.medianMs));

  return (
    <>
      <h2>{t(locale, "bottleneck.title")}</h2>
      <ScopeNote>{t(locale, "bottleneck.scope")}</ScopeNote>
      {ranked.length === 0 ? (
        <EmptyState>{t(locale, "bottleneck.empty")}</EmptyState>
      ) : (
        <table {...stylex.props(styles.table)}>
          <thead>
            <tr>
              <th scope="col" {...stylex.props(styles.thCol)}>{t(locale, "table.step")}</th>
              <th scope="col" {...stylex.props(styles.thCol)}>{t(locale, "bottleneck.medianDwell")}</th>
              <th scope="col" {...stylex.props(styles.thCol)}>{t(locale, "table.traversals")}</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((step) => (
              <tr key={step.stepId}>
                <th scope="row" {...stylex.props(styles.thRow)}>{stepName(step, baseLocale)}</th>
                <td {...stylex.props(styles.td, styles.measure)}>
                  <DurationRule fraction={scale(step.medianMs)} />
                  <span {...stylex.props(styles.figure)}>{formatDuration(step.medianMs, locale)}</span>
                </td>
                <td {...stylex.props(styles.td, styles.figure)}>{step.traversals}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>{t(locale, "bottleneck.wipTitle")}</h2>
      <ScopeNote>{t(locale, "bottleneck.wipScope")}</ScopeNote>
      {view.workInProgress.length === 0 ? (
        <EmptyState>{t(locale, "bottleneck.wipEmpty")}</EmptyState>
      ) : (
        <ul {...stylex.props(styles.wip)}>
          {view.workInProgress.map((step) => (
            <li key={step.stepId} {...stylex.props(styles.wipItem)}>
              <span {...stylex.props(styles.wipCount)}>{step.running}</span>
              <span>{stepName(step, baseLocale)}</span>
            </li>
          ))}
        </ul>
      )}
      <SkippedNote count={view.skippedInstances} locale={locale} />
    </>
  );
}
