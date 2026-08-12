import { useEffect, useState } from "react";
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
          <dl className="rep-percentiles">
            {([["p50", view.p50Ms], ["p90", view.p90Ms], ["p99", view.p99Ms]] as const).map(([label, ms]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{ms === null ? "—" : formatDuration(ms, locale)}</dd>
              </div>
            ))}
          </dl>
          <p className="rep-sample">{tCount(locale, view.sampleSize === 1 ? "cycle.sampleOne" : "cycle.sampleMany", view.sampleSize)}</p>
        </>
      )}

      <h2>{t(locale, "cycle.perStepTitle")}</h2>
      <ScopeNote>{t(locale, "cycle.perStepScope")}</ScopeNote>
      {view.perStep.length === 0 ? (
        <EmptyState>{t(locale, "cycle.perStepEmpty")}</EmptyState>
      ) : (
        <table className="rep-table">
          <thead>
            <tr>
              <th scope="col">{t(locale, "table.step")}</th>
              <th scope="col">{t(locale, "cycle.averageDwell")}</th>
              <th scope="col">{t(locale, "table.traversals")}</th>
            </tr>
          </thead>
          <tbody>
            {view.perStep.map((step) => (
              <tr key={step.stepId}>
                <th scope="row">{stepName(step, baseLocale)}</th>
                <td className="rep-measure">
                  <DurationRule fraction={scale(step.averageMs)} />
                  <span className="rep-figure">{formatDuration(step.averageMs, locale)}</span>
                </td>
                <td className="rep-figure">{step.traversals}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <SkippedNote count={view.skippedInstances} locale={locale} />
    </>
  );
}
