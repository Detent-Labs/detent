import { useEffect, useState } from "react";
import { fetchCycleTime } from "../api/client.js";
import { describeCaughtError, formatDuration, scaleTo, stepName, type DateRange } from "./reportingLogic.js";
import { DurationRule, EmptyState, ErrorNote, ScopeNote, SkippedNote } from "../components.js";
import type { ClientError, CycleTimeView } from "../api/types.js";

/**
 * The hero is p50 with the sample size stated directly beneath it, not a large
 * figure standing alone: a p99 computed over four instances must not read as
 * authoritative. The per-step rules below it run in workflow order, so the
 * column reads left-to-right as the process itself.
 */
export function CycleTimeScreen({ processId, range, token, baseLocale }: { processId: string; range: DateRange; token: string; baseLocale: string }) {
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

  if (error) return <ErrorNote error={error} />;
  if (!view) return <p className="rep-scope">Loading…</p>;

  const scale = scaleTo(view.perStep.map((s) => s.averageMs));

  return (
    <>
      <h2>Total duration</h2>
      <ScopeNote>Completed instances only — a cancelled or faulted instance did not finish its normal path.</ScopeNote>
      {view.sampleSize === 0 ? (
        <EmptyState>No completed instances started in this range.</EmptyState>
      ) : (
        <>
          <dl className="rep-percentiles">
            {([["p50", view.p50Ms], ["p90", view.p90Ms], ["p99", view.p99Ms]] as const).map(([label, ms]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{ms === null ? "—" : formatDuration(ms)}</dd>
              </div>
            ))}
          </dl>
          <p className="rep-sample">
            over {view.sampleSize} completed {view.sampleSize === 1 ? "instance" : "instances"}
          </p>
        </>
      )}

      <h2>Average dwell per step</h2>
      <ScopeNote>In workflow order, over the same completed instances.</ScopeNote>
      {view.perStep.length === 0 ? (
        <EmptyState>No completed instance has passed through a step in this range.</EmptyState>
      ) : (
        <table className="rep-table">
          <thead>
            <tr>
              <th scope="col">Step</th>
              <th scope="col">Average dwell</th>
              <th scope="col">Traversals</th>
            </tr>
          </thead>
          <tbody>
            {view.perStep.map((step) => (
              <tr key={step.stepId}>
                <th scope="row">{stepName(step, baseLocale)}</th>
                <td className="rep-measure">
                  <DurationRule fraction={scale(step.averageMs)} />
                  <span className="rep-figure">{formatDuration(step.averageMs)}</span>
                </td>
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
