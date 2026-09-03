import { useEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import { fetchCycleTime } from "../api/client.js";
import { describeCaughtError, formatDuration, scaleTo, stepName, type DateRange } from "./reportingLogic.js";
import { DurationRule, EmptyState, ErrorNote, ScopeNote, SkippedNote, WaitingNote } from "../components.js";
import { t, tCount } from "../catalog.js";
import type { UiLocale } from "../../../i18n/locale.js";
import type { ClientError, CycleTimeView } from "../api/types.js";

/**
 * The hero is p50 with the sample size stated directly beneath it, not a large
 * figure standing alone: a p99 computed over four instances must not read as
 * authoritative. The per-step rules below it run in workflow order, so the
 * column reads left-to-right as the process itself.
 */
/** `app.css`'s percentiles/table/measure rules, as StyleX. `thRow` merges
 * `.rep-table th[scope="row"]`'s two source declarations (design.md D12). */
const styles = stylex.create({
  percentiles: {
    display: "flex",
    flexWrap: "wrap",
    gap: space.s8,
    margin: 0,
  },
  percentileTerm: {
    fontFamily: fonts.body,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: colors.textMuted,
  },
  percentileValue: {
    marginTop: space.s1,
    marginInline: 0,
    marginBottom: 0,
    fontFamily: fonts.mono,
    fontSize: "1.75rem",
    fontVariantNumeric: "tabular-nums",
    letterSpacing: "-0.02em",
  },
  sample: {
    marginTop: space.s2,
    marginInline: 0,
    marginBottom: 0,
    fontSize: "0.85rem",
    color: colors.textMuted,
  },
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
});

export function CycleTimeScreen({
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
  const [view, setView] = useState<CycleTimeView | undefined>();
  const [error, setError] = useState<ClientError | undefined>();

  useEffect(() => {
    let cancelled = false;
    setView(undefined);
    setError(undefined);
    fetchCycleTime(processId, range, token)
      .then((v) => { if (!cancelled) setView(v); })
      .catch((cause: unknown) => { if (!cancelled) setError(describeCaughtError(cause)); });
    return () => { cancelled = true; };
  }, [processId, range, token]);

  if (error) return <ErrorNote error={error} locale={locale} />;
  if (!view) return <WaitingNote locale={locale} />;

  const scale = scaleTo(view.perStep.map((s) => s.averageMs));

  return (
    <>
      <h2>{t(locale, "cycle.totalTitle")}</h2>
      <ScopeNote>{t(locale, "cycle.totalScope")}</ScopeNote>
      {view.sampleSize === 0 ? (
        <EmptyState>{t(locale, "cycle.totalEmpty")}</EmptyState>
      ) : (
        <>
          <dl {...stylex.props(styles.percentiles)}>
            {([["p50", view.p50Ms], ["p90", view.p90Ms], ["p99", view.p99Ms]] as const).map(([label, ms]) => (
              <div key={label}>
                <dt {...stylex.props(styles.percentileTerm)}>{label}</dt>
                <dd {...stylex.props(styles.percentileValue)}>{ms === null ? "—" : formatDuration(ms, locale)}</dd>
              </div>
            ))}
          </dl>
          <p {...stylex.props(styles.sample)}>{tCount(locale, view.sampleSize === 1 ? "cycle.sampleOne" : "cycle.sampleMany", view.sampleSize)}</p>
        </>
      )}

      <h2>{t(locale, "cycle.perStepTitle")}</h2>
      <ScopeNote>{t(locale, "cycle.perStepScope")}</ScopeNote>
      {view.perStep.length === 0 ? (
        <EmptyState>{t(locale, "cycle.perStepEmpty")}</EmptyState>
      ) : (
        <table {...stylex.props(styles.table)}>
          <thead>
            <tr>
              <th scope="col" {...stylex.props(styles.thCol)}>{t(locale, "table.step")}</th>
              <th scope="col" {...stylex.props(styles.thCol)}>{t(locale, "cycle.averageDwell")}</th>
              <th scope="col" {...stylex.props(styles.thCol)}>{t(locale, "table.traversals")}</th>
            </tr>
          </thead>
          <tbody>
            {view.perStep.map((step) => (
              <tr key={step.stepId}>
                <th scope="row" {...stylex.props(styles.thRow)}>{stepName(step, baseLocale)}</th>
                <td {...stylex.props(styles.td, styles.measure)}>
                  <DurationRule fraction={scale(step.averageMs)} />
                  <span {...stylex.props(styles.figure)}>{formatDuration(step.averageMs, locale)}</span>
                </td>
                <td {...stylex.props(styles.td, styles.figure)}>{step.traversals}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <SkippedNote count={view.skippedInstances} locale={locale} />
    </>
  );
}
