import { useEffect, useState } from "react";
import { listProcesses } from "../api/client.js";
import { describeCaughtError, stepName } from "./reportingLogic.js";
import { EmptyState, ErrorNote } from "../components.js";
import type { ClientError, ProcessSummary } from "../api/types.js";

/**
 * A process is chosen before any view renders — the same process-first shape
 * Studio's Versions and Migration screens use. Every process is listed, not
 * only those with instances in range: an empty report is a legitimate answer
 * to "how is this process doing".
 */
export function ProcessPickerScreen({ token, onPick }: { token: string; onPick: (processId: string, label: string) => void }) {
  const [processes, setProcesses] = useState<ProcessSummary[] | undefined>();
  const [error, setError] = useState<ClientError | undefined>();

  useEffect(() => {
    let cancelled = false;
    listProcesses(token)
      .then((rows) => { if (!cancelled) setProcesses(rows); })
      .catch((cause: unknown) => { if (!cancelled) setError(describeCaughtError(cause)); });
    return () => { cancelled = true; };
  }, [token]);

  return (
    <main className="rep-screen">
      <h1>Choose a process</h1>
      {error && <ErrorNote error={error} />}
      {!error && processes === undefined && <p className="rep-scope">Loading…</p>}
      {!error && processes?.length === 0 && <EmptyState>No processes are published yet.</EmptyState>}
      {!error && processes && processes.length > 0 && (
        <ul className="rep-picker">
          {processes.map((p) => {
            const name = stepName({ stepId: p.processId, key: p.key, label: p.label }, p.baseLocale);
            return (
              <li key={p.processId}>
                <button type="button" className="rep-picker-item" onClick={() => onPick(p.processId, name)}>
                  <span className="rep-picker-label">{name}</span>
                  <span className="rep-picker-meta" translate="no">
                    {p.key} · v{p.version}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
