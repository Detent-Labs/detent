import { useEffect, useState } from "react";
import { listProcesses, listVersions, runMigration } from "../api/client.js";
import type { ProcessSummary, VersionSummary, MigrationResult } from "../api/types.js";
import { describeCaughtError } from "../errors.js";
import { useFail } from "../../../shell/useFail.js";
import { ErrorBanner } from "../../../shell/ErrorBanner.js";
import { labelText } from "./instancesLogic.js";
import { parseVersionInput, buildRunConfirmation, migrationBuckets } from "./migrationsLogic.js";
import { t } from "../catalog.js";
import type { UiLocale } from "../../../i18n/locale.js";

interface MigrationsScreenProps {
  token: string;
  locale: UiLocale;
  onUnauthorized: () => void;
}

export function MigrationsScreen({ token, locale, onUnauthorized }: MigrationsScreenProps) {
  const [processes, setProcesses] = useState<ProcessSummary[]>([]);
  const [processId, setProcessId] = useState("");
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [fromVersion, setFromVersion] = useState("");
  const [toVersion, setToVersion] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [result, setResult] = useState<MigrationResult | undefined>(undefined);
  const fail = useFail(onUnauthorized, (err) => setError(describeCaughtError(err, locale)));

  useEffect(() => {
    listProcesses(token)
      .then(setProcesses)
      .catch(fail);
  }, [token, fail]);

  useEffect(() => {
    setVersions([]);
    setFromVersion("");
    setToVersion("");
    if (!processId) return;
    listVersions(processId, token)
      .then(setVersions)
      .catch(fail);
  }, [processId, token, fail]);

  const from = parseVersionInput(fromVersion);
  const to = parseVersionInput(toVersion);
  const canRun = !!processId && from !== undefined && to !== undefined && from !== to;

  const run = async () => {
    if (!canRun) return;
    if (!window.confirm(buildRunConfirmation(processId, from!, to!, locale))) return;
    setRunning(true);
    setError(undefined);
    setResult(undefined);
    try {
      setResult(await runMigration(processId, from!, to!, token));
    } catch (err) {
      fail(err);
    } finally {
      setRunning(false);
    }
  };

  return (
    <main className="admin-screen">
      <h1>{t(locale, "migrations.title")}</h1>

      <div className="admin-controls">
        <label>
          {t(locale, "migrations.process")}
          <select value={processId} onChange={(e) => setProcessId(e.target.value)}>
            <option value="">{t(locale, "migrations.selectProcess")}</option>
            {processes.map((p) => (
              <option key={p.processId} value={p.processId}>
                {labelText(p.label, p.baseLocale)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t(locale, "migrations.fromVersion")}
          <select value={fromVersion} onChange={(e) => setFromVersion(e.target.value)} disabled={!processId}>
            <option value="">{t(locale, "migrations.selectVersion")}</option>
            {versions.map((v) => (
              <option key={v.version} value={v.version}>
                {v.version}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t(locale, "migrations.toVersion")}
          <select value={toVersion} onChange={(e) => setToVersion(e.target.value)} disabled={!processId}>
            <option value="">{t(locale, "migrations.selectVersion")}</option>
            {versions.map((v) => (
              <option key={v.version} value={v.version}>
                {v.version}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn-primary" onClick={() => void run()} disabled={!canRun || running}>
          {t(locale, "migrations.run")}
        </button>
      </div>

      {error && <ErrorBanner error={error} locale={locale} />}

      {result && (
        <table className="admin-table">
          <thead>
            <tr>
              <th>{t(locale, "migrations.colOutcome")}</th>
              <th>{t(locale, "migrations.colInstances")}</th>
            </tr>
          </thead>
          <tbody>
            {migrationBuckets(result, locale).map((bucket) => (
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
