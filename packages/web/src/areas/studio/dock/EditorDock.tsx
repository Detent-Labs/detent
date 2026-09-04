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
import * as stylex from "@stylexjs/stylex";
import type { ProcessBody } from "workflow-engine/schema";
import { stripCompiledContent } from "workflow-engine/schema/strip-compiled";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import { t } from "../catalog.js";
import { getVersionBody } from "../api/client.js";
import { describeCaughtError } from "../errors.js";
import { diffJson, type DiffEntry, type DiffKind } from "../screens/versionDiffLogic.js";
import { FieldMatrixGrid } from "../panels/FieldMatrixGrid.js";
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

/**
 * `.studio-dock`, its bar/toggle/tabs, its body, its paths table, and the
 * three `.studio-empty`/`.studio-error-banner*`/`.studio-diff*` shapes
 * `ChangesTab` and `PathsTab` render, all from `app.css`. Duplicated on
 * purpose (D9) rather than shared: `.studio-empty` and the error-banner
 * shape each appear near-identically in ten other studio files.
 *
 * `dockBody` no longer keeps a literal `studio-dock-body` class (D10):
 * `FieldMatrixGrid.tsx`'s scroll box now picks its own 15rem cap from a
 * `compact` prop, so `app.css`'s `.studio-dock-body .studio-matrix-scroll`
 * rule has nothing left here to match. It stays dead code until Group 9.
 */
const styles = stylex.create({
  dock: {
    flex: "0 0 auto",
    borderTopWidth: 2,
    borderTopStyle: "solid",
    borderTopColor: colors.divider,
    paddingTop: space.s2,
    marginTop: space.s3,
  },
  bar: {
    display: "flex",
    alignItems: "center",
    gap: space.s4,
  },
  toggle: {
    background: "none",
    border: "none",
    paddingBlock: space.s1,
    paddingInline: 0,
    fontFamily: fonts.body,
    color: colors.text,
    textAlign: "left",
    cursor: "pointer",
  },
  tabs: {
    display: "flex",
    gap: space.s3,
  },
  tabButton: {
    background: "none",
    border: "none",
    borderBottomWidth: 2,
    borderBottomStyle: "solid",
    borderBottomColor: "transparent",
    paddingBlock: space.s1,
    paddingInline: 0,
    fontFamily: fonts.body,
    color: colors.textMuted,
    cursor: "pointer",
  },
  // The accent marks the active tab as a stamp, a 2px rule under it. Not
  // `font-weight: 600`: the written face ships at 400 and 800, nothing between.
  tabButtonSelected: {
    borderBottomColor: colors.accent,
    color: colors.text,
  },
  dockBody: {
    maxHeight: "16rem",
    overflow: "auto",
    marginTop: space.s2,
  },
  empty: {
    color: colors.textMuted,
    paddingBlock: space.s4,
    paddingInline: 0,
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
  diff: {
    listStyle: "none",
    marginBlockStart: space.s3,
    marginBlockEnd: 0,
    marginInline: 0,
    padding: 0,
    fontSize: "0.85rem",
  },
  diffItem: {
    paddingBlock: space.s1,
    paddingInline: 0,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
  },
  diffCode: {
    fontFamily: fonts.mono,
    fontSize: "0.8rem",
  },
  diffAdded: {
    color: colors.neutral900,
  },
  diffRemoved: {
    color: colors.refusal,
  },
  dockPaths: {
    width: "100%",
    borderCollapse: "collapse",
    textAlign: "left",
  },
  dockPathsCell: {
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
    paddingBlock: space.s2,
    paddingInlineEnd: space.s3,
    paddingInlineStart: 0,
    fontWeight: 400,
    verticalAlign: "top",
  },
  dockPathsHeadCell: {
    borderBottomWidth: 2,
    borderBottomStyle: "solid",
    borderBottomColor: colors.divider,
    color: colors.textMuted,
  },
  // A `key`, a raw `step_` id, a guard's CEL and a priority number are values
  // the engine matches exactly, so all four take the mono face. A resolved
  // label beside them is prose and keeps the body face.
  dockPathsMono: {
    fontFamily: fonts.mono,
  },
  dockPathsLabel: {
    display: "block",
  },
  dockPathsNone: {
    fontFamily: fonts.body,
    color: colors.textMuted,
  },
});

// `DiffKind` is a closed three-value union (D3): `changed` gets no color
// override, matching `.studio-diff-changed code:first-child`'s absence from
// `app.css` today.
const DIFF_KIND_STYLE: Record<DiffKind, stylex.StyleXStyles | undefined> = {
  added: styles.diffAdded,
  removed: styles.diffRemoved,
  changed: undefined,
};

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
  const dockBodyProps = stylex.props(styles.dockBody);
  return (
    <section {...stylex.props(styles.dock)} aria-label={t("dock.region")}>
      <div {...stylex.props(styles.bar)}>
        <button
          type="button"
          {...stylex.props(styles.toggle)}
          aria-expanded={open}
          aria-controls={BODY_ID}
          onClick={() => onOpenChange(!open)}
        >
          {open ? t("dock.collapse") : t("dock.expand")}
        </button>
        {open && (
          <div {...stylex.props(styles.tabs)} role="tablist" aria-label={t("dock.region")}>
            {DOCK_TABS.map((name) => (
              <button
                key={name}
                type="button"
                role="tab"
                aria-selected={tab === name}
                onClick={() => onTabChange(name)}
                {...stylex.props(styles.tabButton, tab === name && styles.tabButtonSelected)}
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
        <div id={BODY_ID} {...dockBodyProps}>
          <div hidden={tab !== "changes"}>
            <ChangesTab processId={processId} token={token} draft={draft} baseVersion={baseVersion} />
          </div>
          <div hidden={tab !== "matrix"}>
            <FieldMatrixGrid compact />
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

  if (baseVersion === null) return <p {...stylex.props(styles.empty)}>{t("dock.changesFirstPublish")}</p>;
  if (state.kind === "loading") return <p {...stylex.props(styles.empty)}>{t("dock.changesLoading")}</p>;
  if (state.kind === "error")
    return (
      <div {...stylex.props(styles.errorBanner)} role="alert">
        <span {...stylex.props(styles.errorBannerStamp)}>{t("error.failed")}</span>
        <span {...stylex.props(styles.errorBannerMessage)}>{state.message}</span>
      </div>
    );
  if (!diff) return null;
  if (diff.length === 0) return <p {...stylex.props(styles.empty)}>{t("dock.changesNone")}</p>;

  return (
    <ul {...stylex.props(styles.diff)}>
      {diff.map((d, i) => (
        <li key={i} {...stylex.props(styles.diffItem)}>
          <code {...stylex.props(styles.diffCode, DIFF_KIND_STYLE[d.kind])}>{d.path}</code> — {d.kind}
          {d.kind !== "added" && (
            <>
              {" "}
              from <code {...stylex.props(styles.diffCode)}>{JSON.stringify(d.from)}</code>
            </>
          )}
          {d.kind !== "removed" && (
            <>
              {" "}
              to <code {...stylex.props(styles.diffCode)}>{JSON.stringify(d.to)}</code>
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

  if (rows.length === 0) return <p {...stylex.props(styles.empty)}>{t("dock.pathsEmpty")}</p>;

  const headCellProps = stylex.props(styles.dockPathsCell, styles.dockPathsHeadCell);

  return (
    <table {...stylex.props(styles.dockPaths)}>
      <thead>
        <tr>
          <th scope="col" {...headCellProps}>{t("dock.pathsSource")}</th>
          <th scope="col" {...headCellProps}>{t("dock.pathsTrigger")}</th>
          <th scope="col" {...headCellProps}>{t("dock.pathsPriority")}</th>
          <th scope="col" {...headCellProps}>{t("dock.pathsGuard")}</th>
          <th scope="col" {...headCellProps}>{t("dock.pathsTarget")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.pathId}>
            <th scope="row" {...stylex.props(styles.dockPathsCell)}>{stepCell(row.sourceLabel, row.sourceKey, contentLocale, baseLocale)}</th>
            <td {...stylex.props(styles.dockPathsCell)}>{row.trigger ?? ""}</td>
            <td {...stylex.props(styles.dockPathsCell, styles.dockPathsMono)}>
              {row.priority === undefined ? <span {...stylex.props(styles.dockPathsNone)}>{t("dock.pathsNoPriority")}</span> : row.priority}
            </td>
            <td {...stylex.props(styles.dockPathsCell, styles.dockPathsMono)}>
              {row.guardSrc === undefined ? <span {...stylex.props(styles.dockPathsNone)}>{t("dock.pathsNoGuard")}</span> : row.guardSrc}
            </td>
            <td {...stylex.props(styles.dockPathsCell)}>{stepCell(row.targetLabel, row.targetKey ?? row.targetId, contentLocale, baseLocale)}</td>
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
      {text !== undefined && <span {...stylex.props(styles.dockPathsLabel)}>{text}</span>}
      <code {...stylex.props(styles.dockPathsMono)}>{key}</code>
    </>
  );
}
