import { useEffect, useState } from "react";
import { fetchSla } from "../api/client.js";
import { describeCaughtError, formatPercent, stepName, type DateRange } from "./reportingLogic.js";
import { DurationRule, EmptyState, ErrorNote, ScopeNote, SkippedNote } from "../components.js";
import type { ClientError, SlaView } from "../api/types.js";

/**
 * The same rule again, this time filled to the breach rate rather than scaled
 * against the widest value — a rate is already 0..1, so the full width means
 * "every traversal breached". Colour appears only here, and it means breached,
 * not large.
 */
export function SlaScreen({ processId, range, token, baseLocale }: { processId: string; range: DateRange; token: string; baseLocale: string }) {
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

  if (error) return <ErrorNote error={error} />;
  if (!view) return <p className="rep-scope">Loading…</p>;

  return (
    <>
      <h2>Breach rate per step</h2>
      <ScopeNote>
        A step&apos;s threshold is its own declared reminder or escalation timer. A step that declares no timer carries no SLA and is absent from this
        list — it is not passing, it is unmeasured.
      </ScopeNote>
      {view.steps.length === 0 ? (
        <EmptyState>No step in this process declares a timer, so there is no SLA to report.</EmptyState>
      ) : (
        <table className="rep-table">
          <thead>
            <tr>
              <th scope="col">Step</th>
              <th scope="col">Breach rate</th>
              <th scope="col">Breached</th>
              <th scope="col">Traversals</th>
            </tr>
          </thead>
          <tbody>
            {view.steps.map((step) => (
              <tr key={step.stepId}>
                <th scope="row">{stepName(step, baseLocale)}</th>
                <td className="rep-measure">
                  <DurationRule fraction={step.breachRate} tone="danger" />
                  <span className="rep-figure">{formatPercent(step.breachRate)}</span>
                </td>
                <td className="rep-figure">{step.breached}</td>
                <td className="rep-figure">{step.traversals}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <SkippedNote count={view.skippedInstances} />
    </>
  );
}
