import { useEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import { fetchSla } from "../api/client.js";
import { describeCaughtError, formatPercent, stepName, type DateRange } from "./reportingLogic.js";
import { DurationRule, EmptyState, ErrorNote, ScopeNote, SkippedNote, WaitingNote } from "../components.js";
import { t } from "../catalog.js";
import type { UiLocale } from "../../../i18n/locale.js";
import type { ClientError, SlaView } from "../api/types.js";

/**
 * The same rule again, this time filled to the breach rate rather than scaled
 * against the widest value — a rate is already 0..1, so the full width means
 * "every traversal breached". Colour appears only here, and it means breached,
 * not large.
 */
/** `app.css`'s table/measure rules, as StyleX. `thRow` merges `.rep-table
 * th[scope="row"]`'s two source declarations (design.md D12). */
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
});

export function SlaScreen({
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
  const [view, setView] = useState<SlaView | undefined>();
  const [error, setError] = useState<ClientError | undefined>();

  useEffect(() => {
    let cancelled = false;
    setView(undefined);
    setError(undefined);
    fetchSla(processId, range, token)
      .then((v) => { if (!cancelled) setView(v); })
      .catch((cause: unknown) => { if (!cancelled) setError(describeCaughtError(cause)); });
    return () => { cancelled = true; };
  }, [processId, range, token]);

  if (error) return <ErrorNote error={error} locale={locale} />;
  if (!view) return <WaitingNote locale={locale} />;

  return (
    <>
      <h2>{t(locale, "sla.title")}</h2>
      <ScopeNote>{t(locale, "sla.scope")}</ScopeNote>
      {view.steps.length === 0 ? (
        <EmptyState>{t(locale, "sla.empty")}</EmptyState>
      ) : (
        <table {...stylex.props(styles.table)}>
          <thead>
            <tr>
              <th scope="col" {...stylex.props(styles.thCol)}>{t(locale, "table.step")}</th>
              <th scope="col" {...stylex.props(styles.thCol)}>{t(locale, "sla.breachRate")}</th>
              <th scope="col" {...stylex.props(styles.thCol)}>{t(locale, "sla.breached")}</th>
              <th scope="col" {...stylex.props(styles.thCol)}>{t(locale, "table.traversals")}</th>
            </tr>
          </thead>
          <tbody>
            {view.steps.map((step) => (
              <tr key={step.stepId}>
                <th scope="row" {...stylex.props(styles.thRow)}>{stepName(step, baseLocale)}</th>
                <td {...stylex.props(styles.td, styles.measure)}>
                  <DurationRule fraction={step.breachRate} tone="danger" />
                  <span {...stylex.props(styles.figure)}>{formatPercent(step.breachRate, locale)}</span>
                </td>
                <td {...stylex.props(styles.td, styles.figure)}>{step.breached}</td>
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
