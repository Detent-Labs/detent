import { useCallback, useEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import { listVersions, getVersionBody, getDraft } from "../api/client.js";
import type { VersionSummary } from "../api/types.js";
import type { ProcessBody } from "workflow-engine/schema";
import { stripCompiledContent } from "workflow-engine/schema/strip-compiled";
import { canDiff, type VersionSelection } from "./versionDiffLogic.js";
import { buildPromotionFile, promotionFilename } from "./promotionExportLogic.js";
import type { Route } from "../routing.js";
import { describeCaughtError } from "../errors.js";
import { useFail } from "../../../shell/useFail.js";
import { t } from "../catalog.js";
import { describeChanges, type ChangeRow } from "../draft/changeSet.js";
import { ChangeList } from "../panels/ChangeList.js";

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
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: colors.refusal,
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
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: "currentcolor",
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
  studioTable: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "0.9rem",
  },
  studioTableHeadCell: {
    textAlign: "left",
    fontFamily: fonts.body,
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: colors.textMuted,
    padding: space.s2,
    borderBottomWidth: 2,
    borderBottomStyle: "solid",
    borderBottomColor: colors.divider,
  },
  studioTableCell: {
    padding: space.s2,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
    verticalAlign: "top",
  },
  studioControls: {
    display: "flex",
    flexWrap: "wrap",
    gap: space.s2,
    marginBottom: space.s3,
    alignItems: "center",
  },
});

interface VersionsScreenProps {
  processId: string;
  token: string;
  navigate: (route: Route) => void;
  onUnauthorized: () => void;
}

/**
 * Hands a JSON file to the browser with no dependency: `Blob` plus
 * `URL.createObjectURL` are native. The revoke waits one macrotask — revoking
 * in the same tick as the click has historically cancelled the download before
 * it starts, and an object URL held for one tick costs nothing.
 */
function downloadJson(filename: string, payload: unknown): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** process-version-inspection spec: list published versions, diff any two (or a draft against its base_version). */
export function VersionsScreen({ processId, token, navigate, onUnauthorized }: VersionsScreenProps) {
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [baseVersion, setBaseVersion] = useState<number | null>(null);
  /**
   * Whether to offer the control leading to the migration screen, from the
   * loaded draft's own `canPlanMigration` (process-drafts spec) — the
   * server's `can(actor, "migrate", processId, db)`, not a role read
   * client-side. The migration screen itself now admits any author; this
   * is what decides whether the actor can use it for this process.
   */
  const [canPlanMigration, setCanPlanMigration] = useState(false);
  const [selection, setSelection] = useState<VersionSelection>({});
  const [comparison, setComparison] = useState<{ key: string; heading: string; rows: ChangeRow[] } | undefined>(undefined);
  // Drives the waiting line while both compared bodies are in flight. Cleared
  // in the same branch that either sets the comparison or calls `fail`, so it
  // never stands beside the result it precedes.
  const [waiting, setWaiting] = useState(false);
  const [loading, setLoading] = useState(true);
  // Diff-action failures (shown next to the diff controls) — distinct from
  // loadError below (the versions list itself failed to load), since
  // conflating the two would gate the list's empty state on an unrelated
  // diff failure and vice versa.
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  // The version currently being fetched for export, so only its own row's
  // button reports the wait instead of every row going busy at once.
  const [exporting, setExporting] = useState<number | null>(null);
  const failLoad = useFail(onUnauthorized, (e) => setLoadError(describeCaughtError(e)));
  const fail = useFail(onUnauthorized, (e) => setError(describeCaughtError(e)));

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(undefined);
    Promise.all([listVersions(processId, token), getDraft(processId, token)])
      .then(([vs, draft]) => {
        if (cancelled) return;
        setVersions(vs);
        setBaseVersion(draft?.baseVersion ?? null);
        setCanPlanMigration(draft?.canPlanMigration ?? false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        failLoad(e);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [processId, token, failLoad]);

  useEffect(() => load(), [load]);

  /**
   * Both published bodies are compiled, so each loses the compile pass's
   * injected content before they compare (D7) — otherwise the cancel sink
   * would read as a change neither developer made.
   */
  const diffSelected = async () => {
    if (!canDiff(selection)) return;
    setError(null);
    setComparison(undefined);
    setWaiting(true);
    try {
      const [bodyA, bodyB] = await Promise.all([getVersionBody(processId, selection.a, token), getVersionBody(processId, selection.b, token)]);
      const rows = describeChanges(stripCompiledContent(bodyA as ProcessBody), stripCompiledContent(bodyB as ProcessBody));
      setWaiting(false);
      setComparison({
        key: `${selection.a}-${selection.b}`,
        // Side A reads as before and side B as after (D7).
        heading: t("changeList.heading.versions")
          .replace("{after}", () => String(selection.b))
          .replace("{before}", () => String(selection.a)),
        rows,
      });
    } catch (e) {
      setWaiting(false);
      fail(e);
    }
  };

  const diffAgainstBase = async () => {
    if (baseVersion === null) return;
    setError(null);
    setComparison(undefined);
    setWaiting(true);
    try {
      const [draft, baseBody] = await Promise.all([getDraft(processId, token), getVersionBody(processId, baseVersion, token)]);
      // A draft is authored-shape, a published body compiled. Comparing them
      // raw reports the compile pass's cancel-sink injection as a change the
      // author neither made nor can act on — it is re-injected at the next
      // publish. Strip the base so both sides are the same kind of artifact.
      // The base reads as before, the draft as after (D7).
      const rows = describeChanges(stripCompiledContent(baseBody as ProcessBody), draft?.body);
      setWaiting(false);
      setComparison({
        key: `base-${baseVersion}`,
        heading: t("changeList.heading.draft").replace("{version}", () => String(baseVersion)),
        rows,
      });
    } catch (e) {
      setWaiting(false);
      fail(e);
    }
  };

  /**
   * environment-promotion spec: writes the version out as a file another
   * environment's Studio can import. The body goes into the file exactly as
   * `getVersionBody` returned it — compiled, cancel sink included. See
   * `promotionExportLogic` for why it must not be stripped first.
   */
  const exportVersion = async (v: VersionSummary) => {
    setError(null);
    setExporting(v.version);
    try {
      const body = await getVersionBody(processId, v.version, token);
      downloadJson(promotionFilename(body, v.version, processId), buildPromotionFile(processId, v, body));
    } catch (e) {
      fail(e);
    } finally {
      setExporting(null);
    }
  };

  return (
    <main {...stylex.props(styles.studioScreen)}>
      <button type="button" className="btn btn-ghost" {...stylex.props(styles.studioBack)} onClick={() => navigate({ name: "edit", processId })}>
        ← Back to process
      </button>
      <h1>Versions</h1>
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
        <p {...stylex.props(styles.studioEmpty)}>Loading…</p>
      ) : versions.length === 0 ? (
        !loadError && <p {...stylex.props(styles.studioEmpty)}>No published versions yet.</p>
      ) : (
        <>
          <table {...stylex.props(styles.studioTable)}>
            <thead>
              <tr>
                <th {...stylex.props(styles.studioTableHeadCell)}>Version</th>
                <th {...stylex.props(styles.studioTableHeadCell)}>Hash</th>
                <th {...stylex.props(styles.studioTableHeadCell)}>Published</th>
                <th {...stylex.props(styles.studioTableHeadCell)}>A</th>
                <th {...stylex.props(styles.studioTableHeadCell)}>B</th>
                <th {...stylex.props(styles.studioTableHeadCell)}>Promote</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.version}>
                  <td {...stylex.props(styles.studioTableCell)}>v{v.version}</td>
                  <td {...stylex.props(styles.studioTableCell)}>{v.definitionHash.slice(0, 12)}</td>
                  <td {...stylex.props(styles.studioTableCell)}>{new Date(v.publishedAt).toLocaleString()}</td>
                  <td {...stylex.props(styles.studioTableCell)}>
                    <input
                      type="radio"
                      name="diff-a"
                      aria-label={`diff side A: version ${v.version}`}
                      checked={selection.a === v.version}
                      onChange={() => setSelection((s) => ({ ...s, a: v.version }))}
                    />
                  </td>
                  <td {...stylex.props(styles.studioTableCell)}>
                    <input
                      type="radio"
                      name="diff-b"
                      aria-label={`diff side B: version ${v.version}`}
                      checked={selection.b === v.version}
                      onChange={() => setSelection((s) => ({ ...s, b: v.version }))}
                    />
                  </td>
                  <td {...stylex.props(styles.studioTableCell)}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      aria-label={`export version ${v.version} for promotion`}
                      disabled={exporting !== null}
                      onClick={() => void exportVersion(v)}
                    >
                      {exporting === v.version ? "Exporting…" : "Export"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div {...stylex.props(styles.studioControls)}>
            <button type="button" className="btn btn-secondary" disabled={!canDiff(selection)} onClick={() => void diffSelected()}>
              Diff selected
            </button>
            {canPlanMigration && canDiff(selection) && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => navigate({ name: "migrate", processId, from: String(selection.a), to: String(selection.b) })}
              >
                Plan migration {selection.a} → {selection.b}
              </button>
            )}
            <button type="button" className="btn btn-secondary" disabled={baseVersion === null} onClick={() => void diffAgainstBase()}>
              Diff draft against base {baseVersion !== null ? `(v${baseVersion})` : ""}
            </button>
          </div>
        </>
      )}
      {/* A diff or export failure reports where the change list would appear, as the Changes tab's does. */}
      {error && (
        <div {...stylex.props(styles.errorBanner)} role="alert">
          <span {...stylex.props(styles.errorBannerStamp)}>{t("error.failed")}</span>
          <span {...stylex.props(styles.errorBannerMessage)}>{error}</span>
        </div>
      )}
      {waiting && <p {...stylex.props(styles.studioEmpty)}>{t("versionsScreen.waiting")}</p>}
      {comparison &&
        (comparison.rows.length === 0 ? (
          <p {...stylex.props(styles.studioEmpty)}>No differences.</p>
        ) : (
          <ChangeList key={comparison.key} rows={comparison.rows} heading={comparison.heading} />
        ))}
    </main>
  );
}
