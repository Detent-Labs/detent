import { useCallback, useEffect, useState } from "react";
import { getMigrationPlan, putMigrationPlan, getOrphanKeys, getVersionBody, StudioClientError } from "../api/client.js";
import {
  EMPTY_ROWS,
  formatSpecText,
  parseSpecText,
  planToRows,
  readCatalog,
  rowsToPlan,
  type Catalogs,
  type PlanRows,
} from "./migrationPlanLogic.js";
import { MigrationSpecEditor } from "../panels/MigrationSpecEditor.js";
import type { Route } from "../routing.js";
import type { OrphanKeyScan } from "../api/types.js";
import { describeCaughtError } from "../errors.js";
import { t } from "../catalog.js";

interface MigrationPlanScreenProps {
  processId: string;
  from: string;
  to: string;
  token: string;
  navigate: (route: Route) => void;
  onUnauthorized: () => void;
}

type Surface = "form" | "json";

/**
 * studio-migration-planning spec: author a plan (fieldMap/stepMap/transforms/onUnmappable)
 * and run a read-only orphan-key dry run. studio-migration-plan-form spec: the mapping
 * form over both versions' catalogs, with the JSON textarea as the escape hatch.
 *
 * `rows` is the one plan state. The textarea's `text` is the JSON surface's own state and
 * converts back through `parseSpecText` on the way in, so text that is not a plan can
 * never leave that surface.
 */
export function MigrationPlanScreen({ processId, from, to, token, navigate, onUnauthorized }: MigrationPlanScreenProps) {
  const fromVersion = Number(from);
  const toVersion = Number(to);
  const [rows, setRows] = useState<PlanRows>(EMPTY_ROWS);
  const [text, setText] = useState("{}");
  const [surface, setSurface] = useState<Surface>("form");
  const [catalogs, setCatalogs] = useState<Catalogs | undefined>(undefined);
  const [appliedAt, setAppliedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orphans, setOrphans] = useState<OrphanKeyScan | undefined>(undefined);
  const [scanning, setScanning] = useState(false);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(undefined);
    // The two bodies settle independently of the plan: a body that fails to load
    // costs the form, not the screen.
    Promise.allSettled([
      getMigrationPlan(processId, fromVersion, toVersion, token),
      getVersionBody(processId, fromVersion, token),
      getVersionBody(processId, toVersion, token),
    ])
      .then(([plan, sourceBody, targetBody]) => {
        if (cancelled) return;
        if (plan.status === "rejected") {
          const e: unknown = plan.reason;
          if (e instanceof StudioClientError && e.status === 401) {
            onUnauthorized();
            return;
          }
          setLoadError(describeCaughtError(e));
          return;
        }
        if (plan.value) {
          setRows(planToRows(plan.value.spec));
          setText(formatSpecText(plan.value.spec));
          setAppliedAt(plan.value.appliedAt);
        }
        if (sourceBody.status === "fulfilled" && targetBody.status === "fulfilled")
          setCatalogs({ source: readCatalog(sourceBody.value), target: readCatalog(targetBody.value) });
        else setSurface("json");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [processId, fromVersion, toVersion, token, onUnauthorized]);

  useEffect(() => load(), [load]);

  const showSurface = (next: Surface) => {
    if (next === surface) return;
    if (next === "json") {
      setText(formatSpecText(rowsToPlan(rows)));
      setError(null);
      setSurface("json");
      return;
    }
    const parsed = parseSpecText(text);
    if ("error" in parsed) {
      setError(`invalid JSON: ${parsed.error}`);
      return;
    }
    setRows(planToRows(parsed.spec));
    setError(null);
    setSurface("form");
  };

  const save = async () => {
    let spec: unknown;
    if (surface === "form") spec = rowsToPlan(rows);
    else {
      const parsed = parseSpecText(text);
      if ("error" in parsed) {
        setError(`invalid JSON: ${parsed.error}`);
        return;
      }
      spec = parsed.spec;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await putMigrationPlan(processId, fromVersion, toVersion, spec, token);
      setAppliedAt(result.appliedAt);
    } catch (e) {
      if (e instanceof StudioClientError && e.status === 401) {
        onUnauthorized();
        return;
      }
      setError(describeCaughtError(e));
    } finally {
      setSaving(false);
    }
  };

  const scanOrphans = async (version: number) => {
    setScanning(true);
    setError(null);
    try {
      setOrphans(await getOrphanKeys(processId, version, token));
    } catch (e) {
      if (e instanceof StudioClientError && e.status === 401) {
        onUnauthorized();
        return;
      }
      setError(describeCaughtError(e));
    } finally {
      setScanning(false);
    }
  };

  return (
    <main className="studio-screen">
      <button type="button" className="studio-back" onClick={() => navigate({ name: "versions", processId })}>
        {t("migrationPlan.back")}
      </button>
      <h1>
        Migration plan {fromVersion} → {toVersion}
      </h1>
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
        <p className="studio-empty">{t("migrationPlan.loading")}</p>
      ) : loadError ? null : (
        <>
          {appliedAt && (
            <p className="studio-conflict">
              Applied at {new Date(appliedAt).toLocaleString()} — {t("migrationPlan.frozen")}
            </p>
          )}
          <div className="studio-surface-toggle" role="tablist" aria-label={t("migrationPlan.surfaceLabel")}>
            <button
              type="button"
              role="tab"
              aria-selected={surface === "form"}
              disabled={!catalogs}
              onClick={() => showSurface("form")}
            >
              {t("migrationPlan.surfaceForm")}
            </button>
            <button type="button" role="tab" aria-selected={surface === "json"} onClick={() => showSurface("json")}>
              {t("migrationPlan.surfaceJson")}
            </button>
          </div>
          {!catalogs && <p className="studio-warning">{t("migrationPlan.formUnavailable")}</p>}

          {surface === "form" && catalogs ? (
            <MigrationSpecEditor rows={rows} catalogs={catalogs} onChange={setRows} />
          ) : (
            <label>
              {t("migrationPlan.jsonLabel")}
              <textarea
                className="studio-json-editor"
                rows={16}
                value={text}
                onChange={(e) => setText(e.target.value)}
                spellCheck={false}
              />
            </label>
          )}
          <div className="studio-controls">
            <button type="button" disabled={saving} onClick={() => void save()}>
              {saving ? t("migrationPlan.saving") : t("migrationPlan.save")}
            </button>
          </div>
          {error && (
            <p className="studio-error" role="alert">
              {error}
            </p>
          )}

          <fieldset>
            <legend>{t("migrationPlan.orphanLegend")}</legend>
            <div className="studio-controls">
              <button type="button" disabled={scanning} onClick={() => void scanOrphans(fromVersion)}>
                Scan v{fromVersion}
              </button>
              <button type="button" disabled={scanning} onClick={() => void scanOrphans(toVersion)}>
                Scan v{toVersion}
              </button>
            </div>
            {orphans &&
              (orphans.orphans.length === 0 && orphans.unreadable.length === 0 ? (
                <p className="studio-empty">{t("migrationPlan.orphanEmpty")}</p>
              ) : (
                <ul className="studio-diff">
                  {orphans.orphans.map((o) => (
                    <li key={o.instanceId}>
                      <code>{o.instanceId}</code>: {o.keys.join(", ")}
                    </li>
                  ))}
                  {orphans.unreadable.map((id) => (
                    <li key={id}>
                      <code>{id}</code>: {t("migrationPlan.orphanUnreadable")}
                    </li>
                  ))}
                </ul>
              ))}
          </fieldset>
        </>
      )}
    </main>
  );
}
