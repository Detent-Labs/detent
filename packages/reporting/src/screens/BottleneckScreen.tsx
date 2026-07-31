import { useEffect, useState } from "react";
import { fetchBottleneck } from "../api/client.js";
import { describeCaughtError, formatDuration, rankByMedian, scaleTo, stepName, type DateRange } from "./reportingLogic.js";
import { DurationRule, EmptyState, ErrorNote, ScopeNote, SkippedNote } from "../components.js";
import type { BottleneckView, ClientError } from "../api/types.js";

/**
 * The same duration rule as Cycle-Time, re-sorted — which is the honest
 * picture, since both read the same per-step traversals. The two scopes differ
 * on purpose (this one counts every status), so each states its own.
 */
export function BottleneckScreen({ processId, range, token, baseLocale }: { processId: string; range: DateRange; token: string; baseLocale: string }) {
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

  if (error) return <ErrorNote error={error} />;
  if (!view) return <p className="rep-scope">Loading…</p>;

  const ranked = rankByMedian(view.ranking);
  const scale = scaleTo(ranked.map((s) => s.medianMs));

  return (
    <>
      <h2>Median dwell per step</h2>
      <ScopeNote>Every instance started in this range, whatever its status — a step&apos;s own speed is observable as soon as an instance has passed through it.</ScopeNote>
      {ranked.length === 0 ? (
        <EmptyState>No instance has passed through a step in this range.</EmptyState>
      ) : (
        <table className="rep-table">
          <thead>
            <tr>
              <th scope="col">Step</th>
              <th scope="col">Median dwell</th>
              <th scope="col">Traversals</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((step) => (
              <tr key={step.stepId}>
                <th scope="row">{stepName(step, baseLocale)}</th>
                <td className="rep-measure">
                  <DurationRule fraction={scale(step.medianMs)} />
                  <span className="rep-figure">{formatDuration(step.medianMs)}</span>
                </td>
                <td className="rep-figure">{step.traversals}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Waiting right now</h2>
      <ScopeNote>Running instances currently parked in each step. Not bounded by the date range — this is a present-tense count.</ScopeNote>
      {view.workInProgress.length === 0 ? (
        <EmptyState>No instance is running in any step.</EmptyState>
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
      <SkippedNote count={view.skippedInstances} />
    </>
  );
}
