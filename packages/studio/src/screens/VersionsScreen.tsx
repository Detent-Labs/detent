import { useEffect, useState } from "react";
import { listVersions, getVersionBody, getDraft, StudioClientError } from "../api/client.js";
import type { VersionSummary } from "../api/types.js";
import { selectVersion, canDiff, diffJson, type VersionSelection, type DiffEntry } from "./versionDiffLogic.js";
import type { Route } from "../routing.js";

interface VersionsScreenProps {
  processId: string;
  token: string;
  navigate: (route: Route) => void;
  onUnauthorized: () => void;
}

/** process-version-inspection spec: list published versions, diff any two (or a draft against its base_version). */
export function VersionsScreen({ processId, token, navigate, onUnauthorized }: VersionsScreenProps) {
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [baseVersion, setBaseVersion] = useState<number | null>(null);
  const [selection, setSelection] = useState<VersionSelection>({});
  const [diff, setDiff] = useState<DiffEntry[] | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([listVersions(processId, token), getDraft(processId, token)])
      .then(([vs, draft]) => {
        if (cancelled) return;
        setVersions(vs);
        setBaseVersion(draft?.baseVersion ?? null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof StudioClientError && e.status === 401) onUnauthorized();
        else throw e;
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [processId, token, onUnauthorized]);

  const runDiff = async (a: unknown, b: unknown) => {
    setError(null);
    setDiff(undefined);
    try {
      setDiff(diffJson(a, b));
    } catch (e) {
      setError(e instanceof Error ? e.message : "diff failed");
    }
  };

  const diffSelected = async () => {
    if (!canDiff(selection)) return;
    setError(null);
    setDiff(undefined);
    try {
      const [bodyA, bodyB] = await Promise.all([getVersionBody(processId, selection.a, token), getVersionBody(processId, selection.b, token)]);
      await runDiff(bodyA, bodyB);
    } catch (e) {
      if (e instanceof StudioClientError && e.status === 401) {
        onUnauthorized();
        return;
      }
      setError(e instanceof Error ? e.message : "diff failed");
    }
  };

  const diffAgainstBase = async () => {
    if (baseVersion === null) return;
    setError(null);
    setDiff(undefined);
    try {
      const [draft, baseBody] = await Promise.all([getDraft(processId, token), getVersionBody(processId, baseVersion, token)]);
      await runDiff(draft?.body, baseBody);
    } catch (e) {
      if (e instanceof StudioClientError && e.status === 401) {
        onUnauthorized();
        return;
      }
      setError(e instanceof Error ? e.message : "diff failed");
    }
  };

  return (
    <main className="studio-screen">
      <button type="button" className="studio-back" onClick={() => navigate({ name: "edit", processId })}>
        ← Back to process
      </button>
      <h1>Versions</h1>
      {loading ? (
        <p className="studio-empty">Loading…</p>
      ) : versions.length === 0 ? (
        <p className="studio-empty">No published versions yet.</p>
      ) : (
        <>
          <table className="studio-table">
            <thead>
              <tr>
                <th>Version</th>
                <th>Hash</th>
                <th>Published</th>
                <th>A</th>
                <th>B</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.version}>
                  <td>v{v.version}</td>
                  <td>{v.definitionHash.slice(0, 12)}</td>
                  <td>{new Date(v.publishedAt).toLocaleString()}</td>
                  <td>
                    <input
                      type="radio"
                      name="diff-a"
                      aria-label={`diff side A: version ${v.version}`}
                      checked={selection.a === v.version}
                      onChange={() => setSelection((s) => selectVersion(s, "a", v.version))}
                    />
                  </td>
                  <td>
                    <input
                      type="radio"
                      name="diff-b"
                      aria-label={`diff side B: version ${v.version}`}
                      checked={selection.b === v.version}
                      onChange={() => setSelection((s) => selectVersion(s, "b", v.version))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="studio-controls">
            <button type="button" disabled={!canDiff(selection)} onClick={() => void diffSelected()}>
              Diff selected
            </button>
            {canDiff(selection) && (
              <button
                type="button"
                onClick={() => navigate({ name: "migrate", processId, from: String(selection.a), to: String(selection.b) })}
              >
                Plan migration {selection.a} → {selection.b}
              </button>
            )}
            <button type="button" disabled={baseVersion === null} onClick={() => void diffAgainstBase()}>
              Diff draft against base {baseVersion !== null ? `(v${baseVersion})` : ""}
            </button>
          </div>
        </>
      )}
      {error && <p className="studio-error">{error}</p>}
      {diff &&
        (diff.length === 0 ? (
          <p className="studio-empty">No differences.</p>
        ) : (
          <ul className="studio-diff">
            {diff.map((d, i) => (
              <li key={i} className={`studio-diff-${d.kind}`}>
                <code>{d.path}</code> — {d.kind}
                {d.kind !== "added" && (
                  <>
                    {" "}
                    from <code>{JSON.stringify(d.from)}</code>
                  </>
                )}
                {d.kind !== "removed" && (
                  <>
                    {" "}
                    to <code>{JSON.stringify(d.to)}</code>
                  </>
                )}
              </li>
            ))}
          </ul>
        ))}
    </main>
  );
}
