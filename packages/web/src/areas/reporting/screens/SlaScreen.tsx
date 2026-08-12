import { useEffect, useState } from "react";
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
        <table className="rep-table">
          <thead>
            <tr>
              <th scope="col">{t(locale, "table.step")}</th>
              <th scope="col">{t(locale, "sla.breachRate")}</th>
              <th scope="col">{t(locale, "sla.breached")}</th>
              <th scope="col">{t(locale, "table.traversals")}</th>
            </tr>
          </thead>
          <tbody>
            {view.steps.map((step) => (
              <tr key={step.stepId}>
                <th scope="row">{stepName(step, baseLocale)}</th>
                <td className="rep-measure">
                  <DurationRule fraction={step.breachRate} tone="danger" />
                  <span className="rep-figure">{formatPercent(step.breachRate, locale)}</span>
                </td>
                <td className="rep-figure">{step.breached}</td>
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
