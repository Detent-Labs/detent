import { useCallback, useEffect, useState } from "react";
import { listVersions, getVersionBody, getDraft, StudioClientError } from "../api/client.js";
import type { VersionSummary } from "../api/types.js";
import type { ProcessBody } from "workflow-engine/schema";
import { stripCompiledContent } from "workflow-engine/schema/strip-compiled";
import { selectVersion, canDiff, diffJson, type VersionSelection, type DiffEntry } from "./versionDiffLogic.js";
import type { Route } from "../routing.js";
import { describeCaughtError } from "../errors.js";
import { t } from "../i18n/catalog.js";

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
  // Diff-action failures (shown next to the diff controls) — distinct from
  // loadError below (the versions list itself failed to load), since
  // conflating the two would gate the list's empty state on an unrelated
  // diff failure and vice versa.
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(undefined);
    Promise.all([listVersions(processId, token), getDraft(processId, token)])
      .then(([vs, draft]) => {
        if (cancelled) return;
        setVersions(vs);
        setBaseVersion(draft?.baseVersion ?? null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof StudioClientError && e.status === 401) {
          onUnauthorized();
          return;
        }
        setLoadError(describeCaughtError(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [processId, token, onUnauthorized]);

  useEffect(() => load(), [load]);

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
      setError(describeCaughtError(e));
    }
  };

  const diffAgainstBase = async () => {
    if (baseVersion === null) return;
    setError(null);
    setDiff(undefined);
    try {
      const [draft, baseBody] = await Promise.all([getDraft(processId, token), getVersionBody(processId, baseVersion, token)]);
      // A draft is authored-shape, a published body compiled. Comparing them
      // raw reports the compile pass's cancel-sink injection as a change the
      // author neither made nor can act on — it is re-injected at the next
      // publish. Strip the base so both sides are the same kind of artifact.
      await runDiff(draft?.body, stripCompiledContent(baseBody as ProcessBody));
    } catch (e) {
      if (e instanceof StudioClientError && e.status === 401) {
        onUnauthorized();
        return;
      }
      setError(describeCaughtError(e));
    }
  };

  return (
    <main className="studio-screen">
      <button type="button" className="studio-back" onClick={() => navigate({ name: "edit", processId })}>
        ← Back to process
      </button>
      <h1>Versions</h1>
      {loadError && (
        <div className="studio-error-banner" role="alert">
          <span className="studio-error-banner-stamp">{t("error.failed")}</span>
          <span className="studio-error-banner-message">{loadError}</span>
          <button type="button" onClick={() => load()} disabled={loading}>
            {t("error.retry")}
          </button>
        </div>
      )}
      {loading ? (
        <p className="studio-empty">Loading…</p>
      ) : versions.length === 0 ? (
        !loadError && <p className="studio-empty">No published versions yet.</p>
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
