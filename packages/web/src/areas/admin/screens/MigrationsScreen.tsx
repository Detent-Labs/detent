import { useCallback, useEffect, useState } from "react";
import { listProcesses, listVersions, runMigration, AdminClientError } from "../api/client.js";
import type { ProcessSummary, VersionSummary, MigrationResult } from "../api/types.js";
import { describeCaughtError } from "../errors.js";
import { labelText } from "./instancesLogic.js";
import { parseVersionInput, buildRunConfirmation, migrationBuckets } from "./migrationsLogic.js";

interface MigrationsScreenProps {
  token: string;
  onUnauthorized: () => void;
}

export function MigrationsScreen({ token, onUnauthorized }: MigrationsScreenProps) {
  const [processes, setProcesses] = useState<ProcessSummary[]>([]);
  const [processId, setProcessId] = useState("");
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [fromVersion, setFromVersion] = useState("");
  const [toVersion, setToVersion] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [result, setResult] = useState<MigrationResult | undefined>(undefined);

  const handleUnauthorized = useCallback(
    (err: unknown) => {
      if (err instanceof AdminClientError && err.status === 401) onUnauthorized();
      else setError(describeCaughtError(err));
    },
    [onUnauthorized],
  );

  useEffect(() => {
    listProcesses(token)
      .then(setProcesses)
      .catch(handleUnauthorized);
  }, [token, handleUnauthorized]);

  useEffect(() => {
    setVersions([]);
    setFromVersion("");
    setToVersion("");
    if (!processId) return;
    listVersions(processId, token)
      .then(setVersions)
      .catch(handleUnauthorized);
  }, [processId, token, handleUnauthorized]);

  const from = parseVersionInput(fromVersion);
  const to = parseVersionInput(toVersion);
  const canRun = !!processId && from !== undefined && to !== undefined && from !== to;

  const run = async () => {
    if (!canRun) return;
    if (!window.confirm(buildRunConfirmation(processId, from!, to!))) return;
    setRunning(true);
    setError(undefined);
    setResult(undefined);
    try {
      setResult(await runMigration(processId, from!, to!, token));
    } catch (err) {
      handleUnauthorized(err);
    } finally {
      setRunning(false);
    }
  };

  return (
    <main className="admin-screen">
      <h1>Migrations</h1>

      <div className="admin-controls">
        <label>
          Process
          <select value={processId} onChange={(e) => setProcessId(e.target.value)}>
            <option value="">Select a process</option>
            {processes.map((p) => (
              <option key={p.processId} value={p.processId}>
                {labelText(p.label, p.baseLocale)}
              </option>
            ))}
          </select>
        </label>
        <label>
          From version
          <select value={fromVersion} onChange={(e) => setFromVersion(e.target.value)} disabled={!processId}>
            <option value="">Select a version</option>
            {versions.map((v) => (
              <option key={v.version} value={v.version}>
                {v.version}
              </option>
            ))}
          </select>
        </label>
        <label>
          To version
          <select value={toVersion} onChange={(e) => setToVersion(e.target.value)} disabled={!processId}>
            <option value="">Select a version</option>
            {versions.map((v) => (
              <option key={v.version} value={v.version}>
                {v.version}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn-primary" onClick={() => void run()} disabled={!canRun || running}>
          Run migration
        </button>
      </div>

      {error && (
        <div className="admin-error-banner" role="alert">
          <span className="admin-error-banner-stamp">Failed</span>
          <span className="admin-error-banner-message">{error}</span>
        </div>
      )}

      {result && (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Outcome</th>
              <th>Instances</th>
            </tr>
          </thead>
          <tbody>
            {migrationBuckets(result).map((bucket) => (
              <tr key={bucket.key}>
                <td>{bucket.label}</td>
                <td>{bucket.ids.length === 0 ? "—" : bucket.ids.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
