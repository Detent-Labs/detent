import { useEffect, useState } from "react";
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
        <table className="rep-table">
          <thead>
            <tr>
              <th scope="col">{t(locale, "table.step")}</th>
              <th scope="col">{t(locale, "bottleneck.medianDwell")}</th>
              <th scope="col">{t(locale, "table.traversals")}</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((step) => (
              <tr key={step.stepId}>
                <th scope="row">{stepName(step, baseLocale)}</th>
                <td className="rep-measure">
                  <DurationRule fraction={scale(step.medianMs)} />
                  <span className="rep-figure">{formatDuration(step.medianMs, locale)}</span>
                </td>
                <td className="rep-figure">{step.traversals}</td>
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
        <ul className="rep-wip">
          {view.workInProgress.map((step) => (
            <li key={step.stepId}>
              <span className="rep-wip-count">{step.running}</span>
              <span>{stepName(step, baseLocale)}</span>
            </li>
          ))}
        </ul>
      )}
      <SkippedNote count={view.skippedInstances} locale={locale} />
    </>
  );
}
