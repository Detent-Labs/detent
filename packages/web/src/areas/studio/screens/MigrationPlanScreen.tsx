import { useCallback, useEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import { getMigrationPlan, putMigrationPlan, getOrphanKeys, getVersionBody } from "../api/client.js";
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
import { useFail } from "../../../shell/useFail.js";

interface MigrationPlanScreenProps {
  processId: string;
  from: string;
  to: string;
  token: string;
  navigate: (route: Route) => void;
  onUnauthorized: () => void;
}

type Surface = "form" | "json";

const styles = stylex.create({
  studioScreen: {
    maxWidth: "60rem",
    marginInline: "auto",
    marginBlock: 0,
    paddingTop: space.s4,
    paddingInline: space.s3,
    paddingBottom: space.s6,
  },
  studioBack: {
    display: "block",
    paddingLeft: 0,
    marginBottom: space.s3,
  },
  errorBanner: {
    display: "flex",
    alignItems: "baseline",
    gap: space.s3,
    border: `2px solid ${colors.refusal}`,
    paddingBlock: space.s2,
    paddingInline: space.s3,
    marginBlock: space.s3,
    marginInline: 0,
  },
  errorBannerStamp: {
    flex: "none",
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: colors.refusal,
    border: "2px solid currentcolor",
    paddingBlock: 2,
    paddingInline: 7,
    transform: "rotate(-2deg)",
  },
  errorBannerMessage: {
    flex: 1,
    color: colors.text,
  },
  studioEmpty: {
    color: colors.textMuted,
    paddingBlock: space.s4,
    paddingInline: 0,
  },
  studioConflict: {
    border: `2px solid ${colors.refusal}`,
    paddingBlock: space.s3,
    paddingInline: space.s3,
    marginBlock: space.s3,
    marginInline: 0,
    color: colors.refusal,
  },
  studioSurfaceToggle: {
    display: "flex",
    gap: space.s2,
    marginBottom: space.s3,
  },
  surfaceToggleTabSelected: {
    fontWeight: 600,
    textDecoration: "underline",
  },
  studioWarning: {
    color: colors.refusal,
    borderLeft: `3px solid ${colors.accent400}`,
    paddingLeft: space.s2,
  },
  studioJsonEditor: {
    display: "block",
    width: "100%",
    marginTop: space.s1,
    fontFamily: fonts.mono,
    fontSize: "0.85rem",
    border: `1px solid ${colors.border}`,
    padding: space.s2,
    background: colors.surface,
    resize: "vertical",
  },
  studioControls: {
    display: "flex",
    flexWrap: "wrap",
    gap: space.s2,
    marginBottom: space.s3,
    alignItems: "center",
  },
  studioError: {
    color: colors.refusal,
  },
  studioDiff: {
    listStyle: "none",
    marginBlockStart: space.s3,
    marginBlockEnd: 0,
    marginInline: 0,
    padding: 0,
    fontSize: "0.85rem",
  },
  studioDiffItem: {
    paddingBlock: space.s1,
    paddingInline: 0,
    borderBottom: `1px solid ${colors.border}`,
  },
  studioDiffCode: {
    fontFamily: fonts.mono,
    fontSize: "0.8rem",
  },
});

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
  const failLoad = useFail(onUnauthorized, (e) => setLoadError(describeCaughtError(e)));
  const fail = useFail(onUnauthorized, (e) => setError(describeCaughtError(e)));

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
          failLoad(plan.reason);
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
  }, [processId, fromVersion, toVersion, token, failLoad]);

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
      fail(e);
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
      fail(e);
    } finally {
      setScanning(false);
    }
  };

  return (
    <main {...stylex.props(styles.studioScreen)}>
      <button
        type="button"
        className="btn btn-ghost"
        {...stylex.props(styles.studioBack)}
        onClick={() => navigate({ name: "versions", processId })}
      >
        {t("migrationPlan.back")}
      </button>
      <h1>
        Migration plan {fromVersion} → {toVersion}
      </h1>
      {loadError && (
        <div {...stylex.props(styles.errorBanner)} role="alert">
          <span {...stylex.props(styles.errorBannerStamp)}>{t("error.failed")}</span>
          <span {...stylex.props(styles.errorBannerMessage)}>{loadError}</span>
          <button type="button" className="btn btn-secondary" onClick={() => load()} disabled={loading}>
            {t("error.retry")}
          </button>
        </div>
      )}
      {loading ? (
        <p {...stylex.props(styles.studioEmpty)}>{t("migrationPlan.loading")}</p>
      ) : loadError ? null : (
        <>
          {appliedAt && (
            <p {...stylex.props(styles.studioConflict)}>
              Applied at {new Date(appliedAt).toLocaleString()} — {t("migrationPlan.frozen")}
            </p>
          )}
          <div {...stylex.props(styles.studioSurfaceToggle)} role="tablist" aria-label={t("migrationPlan.surfaceLabel")}>
            <button
              type="button"
              role="tab"
              {...stylex.props(surface === "form" && styles.surfaceToggleTabSelected)}
              aria-selected={surface === "form"}
              disabled={!catalogs}
              onClick={() => showSurface("form")}
            >
              {t("migrationPlan.surfaceForm")}
            </button>
            <button
              type="button"
              role="tab"
              {...stylex.props(surface === "json" && styles.surfaceToggleTabSelected)}
              aria-selected={surface === "json"}
              onClick={() => showSurface("json")}
            >
              {t("migrationPlan.surfaceJson")}
            </button>
          </div>
          {!catalogs && <p {...stylex.props(styles.studioWarning)}>{t("migrationPlan.formUnavailable")}</p>}

          {surface === "form" && catalogs ? (
            <MigrationSpecEditor rows={rows} catalogs={catalogs} onChange={setRows} />
          ) : (
            <label>
              {t("migrationPlan.jsonLabel")}
              <textarea
                {...stylex.props(styles.studioJsonEditor)}
                rows={16}
                value={text}
                onChange={(e) => setText(e.target.value)}
                spellCheck={false}
              />
            </label>
          )}
          <div {...stylex.props(styles.studioControls)}>
            <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void save()}>
              {saving ? t("migrationPlan.saving") : t("migrationPlan.save")}
            </button>
          </div>
          {error && (
            <p {...stylex.props(styles.studioError)} role="alert">
              {error}
            </p>
          )}

          <fieldset>
            <legend>{t("migrationPlan.orphanLegend")}</legend>
            <div {...stylex.props(styles.studioControls)}>
              <button type="button" className="btn btn-secondary" disabled={scanning} onClick={() => void scanOrphans(fromVersion)}>
                Scan v{fromVersion}
              </button>
              <button type="button" className="btn btn-secondary" disabled={scanning} onClick={() => void scanOrphans(toVersion)}>
                Scan v{toVersion}
              </button>
            </div>
            {orphans &&
              (orphans.orphans.length === 0 && orphans.unreadable.length === 0 ? (
                <p {...stylex.props(styles.studioEmpty)}>{t("migrationPlan.orphanEmpty")}</p>
              ) : (
                <ul {...stylex.props(styles.studioDiff)}>
                  {orphans.orphans.map((o) => (
                    <li key={o.instanceId} {...stylex.props(styles.studioDiffItem)}>
                      <code {...stylex.props(styles.studioDiffCode)}>{o.instanceId}</code>: {o.keys.join(", ")}
                    </li>
                  ))}
                  {orphans.unreadable.map((id) => (
                    <li key={id} {...stylex.props(styles.studioDiffItem)}>
                      <code {...stylex.props(styles.studioDiffCode)}>{id}</code>: {t("migrationPlan.orphanUnreadable")}
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
