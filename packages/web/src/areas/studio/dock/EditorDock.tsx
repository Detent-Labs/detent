/**
 * The dock: a collapsible strip below the canvas grid, full width, collapsed
 * by default (`studio-canvas`'s dock requirements).
 *
 * It renders in the canvas sub-state of the Structure surface alone.
 * `EditScreen` mounts it inside the last arm of its ladder, so the panels
 * screen, the form editor and `JsonView` each replace it along with the
 * canvas. That placement is what keeps the Field matrix tab — which writes
 * the draft through `setFlag` — out of reach while the JSON surface is
 * active, as `studio-json-view` requires.
 *
 * Nothing here persists. The open flag and the active tab live in
 * `EditorArea` state, so the draft's `layout` blob carries no key for either:
 * that blob is per-draft, and one author's open dock would open for every
 * author of the draft.
 */
import { useEffect, useMemo, useState } from "react";
import type { ProcessBody } from "workflow-engine/schema";
import { stripCompiledContent } from "workflow-engine/schema/strip-compiled";
import { t } from "../catalog.js";
import { getVersionBody } from "../api/client.js";
import { describeCaughtError } from "../errors.js";
import { diffJson, type DiffEntry } from "../screens/versionDiffLogic.js";
import { FieldMatrixPanel } from "../panels/FieldMatrixPanel.js";
import { resolveDraftLocalizedText } from "../draft/localized-text.js";
import type { Draft } from "../draft/types.js";
import { pathRows, type PathRow } from "./pathRows.js";

export const DOCK_TABS = ["changes", "matrix", "paths"] as const;
export type DockTab = (typeof DOCK_TABS)[number];

const TAB_LABEL_KEY: Record<DockTab, "dock.tabChanges" | "dock.tabMatrix" | "dock.tabPaths"> = {
  changes: "dock.tabChanges",
  matrix: "dock.tabMatrix",
  paths: "dock.tabPaths",
};

const BODY_ID = "studio-dock-body";

interface Props {
  processId: string;
  token: string;
  draft: Draft;
  contentLocale: string;
  /** The published version this draft sits on, already folded over
   * `publishResult.version` by `EditorArea`, so a publish moves it and the
   * Changes tab refetches with no reload. */
  baseVersion: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab: DockTab;
  onTabChange: (tab: DockTab) => void;
}

export function EditorDock({ processId, token, draft, contentLocale, baseVersion, open, onOpenChange, tab, onTabChange }: Props) {
  return (
    <section className="studio-dock" aria-label={t("dock.region")}>
      <div className="studio-dock-bar">
        <button
          type="button"
          className="studio-dock-toggle"
          aria-expanded={open}
          aria-controls={BODY_ID}
          onClick={() => onOpenChange(!open)}
        >
          {open ? t("dock.collapse") : t("dock.expand")}
        </button>
        {open && (
          <div className="studio-dock-tabs" role="tablist" aria-label={t("dock.region")}>
            {DOCK_TABS.map((name) => (
              <button
                key={name}
                type="button"
                role="tab"
                aria-selected={tab === name}
                onClick={() => onTabChange(name)}
              >
                {t(TAB_LABEL_KEY[name])}
              </button>
            ))}
          </div>
        )}
      </div>
      {/* All three bodies mount while the dock is open and `hidden` reveals
       * one, the reveal-rather-than-mount rule `PanelsScreen` follows for its
       * four views: the Changes fetch runs once per open, and the matrix
       * keeps its selected cell across a tab switch. A collapsed dock mounts
       * none of the three. */}
      {open && (
        <div id={BODY_ID} className="studio-dock-body">
          <div hidden={tab !== "changes"}>
            <ChangesTab processId={processId} token={token} draft={draft} baseVersion={baseVersion} />
          </div>
          <div hidden={tab !== "matrix"}>
            <FieldMatrixPanel />
          </div>
          <div hidden={tab !== "paths"}>
            <PathsTab draft={draft} contentLocale={contentLocale} />
          </div>
        </div>
      )}
    </section>
  );
}

type BaseState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "loaded"; body: unknown }
  | { kind: "error"; message: string };

/**
 * The difference between the draft as the editor holds it — unsaved edits
 * included — and the version it sits on. `VersionsScreen.diffAgainstBase()`
 * reads the SAVED draft from the server instead; an author reading this tab
 * is mid-edit, so the live one is the useful left side.
 */
function ChangesTab({ processId, token, draft, baseVersion }: { processId: string; token: string; draft: Draft; baseVersion: number | null }) {
  const [state, setState] = useState<BaseState>({ kind: "idle" });

  useEffect(() => {
    if (baseVersion === null) {
      setState({ kind: "idle" });
      return;
    }
    let cancelled = false;
    setState({ kind: "loading" });
    getVersionBody(processId, baseVersion, token)
      .then((body) => {
        if (!cancelled) setState({ kind: "loaded", body });
      })
      .catch((e: unknown) => {
        if (!cancelled) setState({ kind: "error", message: describeCaughtError(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [processId, token, baseVersion]);

  // Base FIRST. `diffJson` reports a key present in its second argument alone
  // as "added" and reads `from` off the first, so base-first runs every entry
  // from the published value toward the draft — the direction a publish
  // moves. `VersionsScreen` passes the draft first, which suits its neutral
  // A-against-B framing beside `diffSelected` and would read a newly added
  // field here as removed.
  const diff = useMemo<DiffEntry[] | null>(() => {
    if (state.kind !== "loaded") return null;
    return diffJson(stripCompiledContent(state.body as ProcessBody), draft);
  }, [state, draft]);

  if (baseVersion === null) return <p className="studio-empty">{t("dock.changesFirstPublish")}</p>;
  if (state.kind === "loading") return <p className="studio-empty">{t("dock.changesLoading")}</p>;
  if (state.kind === "error") return <p className="studio-error">{state.message}</p>;
  if (!diff) return null;
  if (diff.length === 0) return <p className="studio-empty">{t("dock.changesNone")}</p>;

  return (
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
  );
}

/** One row per path across the whole draft. A canvas draws an automatic
 * path's priority and guard on the line and draws neither for a manual one,
 * so reading the rules of the whole process means clicking every line. */
function PathsTab({ draft, contentLocale }: { draft: Draft; contentLocale: string }) {
  const rows = useMemo(() => pathRows(draft.workflow?.steps), [draft]);
  const baseLocale = draft.baseLocale ?? "en";

  if (rows.length === 0) return <p className="studio-empty">{t("dock.pathsEmpty")}</p>;

  return (
    <table className="studio-dock-paths">
      <thead>
        <tr>
          <th scope="col">{t("dock.pathsSource")}</th>
          <th scope="col">{t("dock.pathsTrigger")}</th>
          <th scope="col">{t("dock.pathsPriority")}</th>
          <th scope="col">{t("dock.pathsGuard")}</th>
          <th scope="col">{t("dock.pathsTarget")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.pathId}>
            <th scope="row">{stepCell(row.sourceLabel, row.sourceKey, contentLocale, baseLocale)}</th>
            <td>{row.trigger ?? ""}</td>
            <td className="studio-dock-paths-value">
              {row.priority === undefined ? <span className="studio-dock-paths-none">{t("dock.pathsNoPriority")}</span> : row.priority}
            </td>
            <td className="studio-dock-paths-value">
              {row.guardSrc === undefined ? <span className="studio-dock-paths-none">{t("dock.pathsNoGuard")}</span> : row.guardSrc}
            </td>
            <td>{stepCell(row.targetLabel, row.targetKey ?? row.targetId, contentLocale, baseLocale)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A resolved label is prose and takes the body face. The `key` beside it is
 * a value the engine matches exactly, so it takes the mono face — and so does
 * the raw `step_` id a dangling `to` falls back to. */
function stepCell(label: PathRow["sourceLabel"], key: string, locale: string, baseLocale: string) {
  const text = resolveDraftLocalizedText(label, locale, baseLocale);
  return (
    <>
      {text !== undefined && <span className="studio-dock-paths-label">{text}</span>}
      <code>{key}</code>
    </>
  );
}
