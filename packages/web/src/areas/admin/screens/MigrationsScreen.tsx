import { useEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import { listProcesses, listVersions, runMigration } from "../api/client.js";
import type { ProcessSummary, VersionSummary, MigrationResult } from "../api/types.js";
import { describeCaughtError } from "../errors.js";
import { useFail } from "../../../shell/useFail.js";
import { ErrorBanner } from "../../../shell/ErrorBanner.js";
import { labelText } from "./instancesLogic.js";
import { parseVersionInput, buildRunConfirmation, migrationBuckets } from "./migrationsLogic.js";
import { t } from "../catalog.js";
import type { UiLocale } from "../../../i18n/locale.js";

/** `app.css`'s screen/controls/table rules, as StyleX. */
const styles = stylex.create({
  screen: {
    maxWidth: "60rem",
    marginInline: "auto",
    paddingTop: space.s4,
    paddingInline: space.s3,
    paddingBottom: space.s6,
  },
  controls: {
    display: "flex",
    flexWrap: "wrap",
    gap: space.s2,
    marginBottom: space.s3,
    alignItems: "center",
  },
  controlsSelect: {
    backgroundColor: colors.surface,
    color: colors.text,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "0.9rem",
  },
  th: {
    textAlign: "left",
    fontFamily: fonts.body,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: colors.textMuted,
    padding: space.s2,
    borderBottomWidth: 2,
    borderBottomStyle: "solid",
    borderBottomColor: colors.divider,
  },
  td: {
    padding: space.s2,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
    verticalAlign: "top",
  },
});

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
    <main {...stylex.props(styles.screen)}>
      <h1>{t(locale, "migrations.title")}</h1>

      <div {...stylex.props(styles.controls)}>
        <label>
          {t(locale, "migrations.process")}
          <select {...stylex.props(styles.controlsSelect)} value={processId} onChange={(e) => setProcessId(e.target.value)}>
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
          <select {...stylex.props(styles.controlsSelect)} value={fromVersion} onChange={(e) => setFromVersion(e.target.value)} disabled={!processId}>
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
          <select {...stylex.props(styles.controlsSelect)} value={toVersion} onChange={(e) => setToVersion(e.target.value)} disabled={!processId}>
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
        <table {...stylex.props(styles.table)}>
          <thead>
            <tr>
              <th {...stylex.props(styles.th)}>{t(locale, "migrations.colOutcome")}</th>
              <th {...stylex.props(styles.th)}>{t(locale, "migrations.colInstances")}</th>
            </tr>
          </thead>
          <tbody>
            {migrationBuckets(result, locale).map((bucket) => (
              <tr key={bucket.key}>
                <td {...stylex.props(styles.td)}>{bucket.label}</td>
                <td {...stylex.props(styles.td)}>{bucket.ids.length === 0 ? "—" : bucket.ids.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
