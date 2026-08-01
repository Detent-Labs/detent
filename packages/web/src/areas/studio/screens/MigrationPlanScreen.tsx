import { useCallback, useEffect, useState } from "react";
import { getMigrationPlan, putMigrationPlan, getOrphanKeys, StudioClientError } from "../api/client.js";
import { parseSpecText, formatSpecText } from "./migrationPlanLogic.js";
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

/** studio-migration-planning spec: author a plan (fieldMap/stepMap/transforms/onUnmappable) and run a read-only orphan-key dry run. */
export function MigrationPlanScreen({ processId, from, to, token, navigate, onUnauthorized }: MigrationPlanScreenProps) {
  const fromVersion = Number(from);
  const toVersion = Number(to);
  const [text, setText] = useState("{}");
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
    getMigrationPlan(processId, fromVersion, toVersion, token)
      .then((plan) => {
        if (cancelled || !plan) return;
        setText(formatSpecText(plan.spec));
        setAppliedAt(plan.appliedAt);
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
  }, [processId, fromVersion, toVersion, token, onUnauthorized]);

  useEffect(() => load(), [load]);

  const save = async () => {
    const parsed = parseSpecText(text);
    if ("error" in parsed) {
      setError(`invalid JSON: ${parsed.error}`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await putMigrationPlan(processId, fromVersion, toVersion, parsed.spec, token);
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
        ← Back to versions
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
        <p className="studio-empty">Loading…</p>
      ) : loadError ? null : (
        <>
          {appliedAt && (
            <p className="studio-conflict">
              Applied at {new Date(appliedAt).toLocaleString()} — this plan is frozen; further edits will be rejected.
            </p>
          )}
          <label>
            Plan spec (JSON — stepMap, fieldMap, transforms, onUnmappable, unmappableStep)
            <textarea
              className="studio-json-editor"
              rows={16}
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
            />
          </label>
          <div className="studio-controls">
            <button type="button" disabled={saving} onClick={() => void save()}>
              {saving ? "Saving…" : "Save plan"}
            </button>
          </div>
          {error && <p className="studio-error">{error}</p>}

          <fieldset>
            <legend>Orphan-key dry run</legend>
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
                <p className="studio-empty">No orphan keys found.</p>
              ) : (
                <ul className="studio-diff">
                  {orphans.orphans.map((o) => (
                    <li key={o.instanceId}>
                      <code>{o.instanceId}</code>: {o.keys.join(", ")}
                    </li>
                  ))}
                  {orphans.unreadable.map((id) => (
                    <li key={id}>
                      <code>{id}</code>: unreadable
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
