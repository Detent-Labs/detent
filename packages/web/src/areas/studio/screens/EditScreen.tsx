import { Component, lazy, Suspense, useCallback, type ErrorInfo, useEffect, useMemo, useState, type ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { layout, colors, focus, fonts, space } from "form-ui/tokens.stylex";
import { DraftProvider, useDraft } from "../draft/store.js";
import { PublishedFieldIdsProvider } from "../draft/publishedFields.js";
import { draftFields } from "../draft/fields.js";
import type { Draft } from "../draft/types.js";
import { t } from "../catalog.js";
import { StepsRail } from "../panels/StepsRail.js";
import { focusAfterStepRemove } from "../panels/stepRailRow.js";
import { StepPage, type WalkNeighbour } from "../panels/StepPage.js";
import { useDraftToolbarActions } from "../panels/DraftToolbar.js";
import { ProcessHeaderBar } from "../panels/ProcessHeaderBar.js";
import { ProcessTabRow, scrollTabIntoRow, tabDomId, tabPanelDomId } from "../panels/ProcessTabRow.js";
import { ChecksRail } from "../panels/ChecksRail.js";
import { FieldsTabViews } from "../panels/FieldsTabViews.js";
import { SettingsTab } from "../panels/SettingsTab.js";
import { FormsTab } from "../panels/FormsTab.js";
import { RestoreNotice } from "../panels/RestoreNotice.js";
import { clearStash, readRestorable, stashDraft, tabStorage } from "../draft/draftStash.js";
import { stepEntityIds } from "../draft/panel-rail.js";
import { seedLocalizedText } from "../draft/localized-text";
import { getDraft, listProcesses } from "../api/client.js";
import { useFetchOnce } from "../panels/shared/useFetchOnce.js";
import { stepText } from "../panels/shared/optionText.js";
import type { DraftRecord, PublishResult } from "../api/types.js";
import { DEFAULT_TAB, FIELDS_VIEWS, SETTINGS_VIEWS, type ProcessTab, type Route, type TabView } from "../routing.js";
import { checkTarget, formEditorReturnTab, placeAction, processTabCounts, surfaceTab, type CheckTarget } from "../draft/process-tabs.js";
import { checksDotState, groupChecksBySource } from "../draft/checksRail.js";
import { showsStructuralBanner } from "../draft/startGaps.js";
import { initialSaveState, type DraftSaveState } from "./draftSaveLogic.js";
import { isDraftDirty, justPublishedAfter } from "./draftToolbarState.js";
import { CanvasView } from "../canvas/CanvasView.js";
import { CanvasBar } from "../canvas/CanvasBar.js";
import { reachableStepIds } from "../draft/registerOrder.js";
import {
  freeLatticePoint,
  snapToGrid,
  svgPointFromClient,
  DEFAULT_EDGE_STYLE,
  type NodePosition,
  type Point,
  type EdgeStyle,
} from "../canvas/geometry.js";
import { type StepGroup } from "../canvas/groups.js";
import { arrangeSteps, hasHandPlacedStep } from "../canvas/arrange.js";
import { drawnPositions, isPoint, type LayoutStep } from "../canvas/layout.js";
import { newStep, type StepKind } from "../draft/createStep.js";
import { addToDraftArray } from "../draft/draft-array-crud.js";
import { insertOnPath } from "../draft/insertOnPath.js";
import { moveTo } from "../draft/list-ops.js";
import { JsonView } from "../panels/JsonView.js";
import { describeCaughtError } from "../errors.js";
import { useFail } from "../../../shell/useFail.js";
import { scrollKeyboardFocusIntoView } from "../focusScroll.js";
import { resolveDraftLocalizedText } from "../draft/localized-text";
import type { NavigateOptions } from "../../../shell/routing.js";

/** The width below which the Steps tab stands one column. `EntityTabs`
 * turns its own rail at this same width, for the same reason. */
const NARROW = "@media (max-width: 64rem)";

/** The Map tab's canvas body: what a canvas bar drop resolves the live canvas
 * through, and what a press measures its centre against. */
const CANVAS_BODY_ID = "studio-canvas-body";

/** The form editor loads as its own chunk when a step's form first opens, so
 * the process surface downloads none of it (`studio-app`). */
const FormEditorScreen = lazy(() => import("./FormEditorScreen.js").then((m) => ({ default: m.FormEditorScreen })));

/**
 * Catches a failed form editor chunk inside the process surface. `lazy`
 * rethrows the rejected import during render. Without this boundary the
 * shell's own boundary replaces the whole area, unmounting `DraftProvider`
 * with the unsaved draft in it. The fallback keeps the draft and offers the
 * form editor's own way back.
 *
 * ponytail: no retry. `lazy` caches the rejected import, so reopening the form
 * editor shows this banner again until the page reloads. A redeploy deletes
 * the old chunk, so a retry would fail there anyway. Ceiling: a transient
 * network drop also needs a reload, after a save. Upgrade: hold the `lazy`
 * factory in state and mint a fresh one on a Retry control.
 */
export class FormEditorBoundary extends Component<{ onBack: () => void; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("studio: the form editor failed to load", error, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div {...stylex.props(styles.errorBanner, styles.errorBannerInEditScreen)} role="alert">
        <span {...stylex.props(styles.errorBannerStamp)}>{t("error.failed")}</span>
        <span {...stylex.props(styles.errorBannerMessage)}>{t("formEditor.loadFailed")}</span>
        <button type="button" className="btn btn-secondary" onClick={this.props.onBack}>
          {t("formEditor.back")}
        </button>
      </div>
    );
  }
}

const styles = stylex.create({
  studioScreen: {
    maxWidth: layout.capWide,
    marginInline: "auto",
    marginBlock: 0,
    paddingTop: space.s4,
    paddingInline: space.s3,
    paddingBottom: space.s6,
  },
  // `.studio-edit-screen` widens past `.studio-screen`'s 80rem cap and takes
  // the height `.shell` leaves it.
  //
  // The zero basis and the zero floor are what make that height the
  // viewport's rather than the content's. `.shell` sets `min-height: 100vh`
  // and no height, so it sizes to its items; an `auto` basis feeds this
  // screen's own content back into that sum and the whole document scrolls.
  // Measured at 1440x900 before the change: document 1740 against a 900
  // viewport, and the steps rail 1498 tall with nothing to scroll inside.
  // With `flex-basis: 0` this screen contributes nothing to the sum, so
  // `.shell` settles at 100vh and hands back what the header leaves; with
  // `min-height: 0` the screen may then shrink into it, and the tab body
  // below scrolls in its place (`studio-step-page`: the rail "SHALL keep a
  // fixed width and scroll on its own").
  studioEditScreen: {
    maxWidth: "none",
    display: "flex",
    flex: "1 1 0",
    minHeight: 0,
    flexDirection: "column",
  },
  studioBack: {
    display: "block",
    paddingLeft: 0,
    marginBottom: space.s3,
  },
  // `.draft-incomplete` already zeroes its own top margin, so it needs no
  // extra help from `.studio-edit-screen > *` (below).
  //
  // `colors.refusal` joins the plain-color family the Checks count and the
  // Publish reason already read for the same kind of fact. It stays out of
  // the `errorBanner`/`errorBannerStamp` family below, which this file
  // reserves for a load or a request that comes back wrong.
  draftIncomplete: {
    marginBlockStart: 0,
    marginBlockEnd: space.s3,
    marginInline: 0,
    color: colors.refusal,
  },
  // The waiting line while the form editor's chunk loads: one muted line where
  // the editor will stand.
  screenLoading: {
    marginBlock: 0,
    color: colors.textMuted,
    paddingBlock: space.s4,
    paddingInline: 0,
  },
  // Every OTHER `.studio-error-banner` in this file renders as a direct
  // child of `.studio-edit-screen`'s own flex column, which used to zero a
  // direct child's own top margin (`.studio-edit-screen > *`, a flex column
  // does not collapse adjacent margins the way block layout does). The two
  // early-return states below render inside a plain `.studio-screen`
  // instead, so they keep the banner's own full top-and-bottom margin.
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
  errorBannerInEditScreen: {
    marginBlockStart: 0,
    marginBlockEnd: space.s3,
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
  // The one surface: the header rows, the tab row, then one tab body.
  surface: {
    display: "flex",
    flex: "1 1 auto",
    flexDirection: "column",
    gap: space.s3,
    minHeight: 0,
  },
  // A tab body. It fills the height the header rows and the tab row leave and
  // scrolls inside itself, above the floor its own content declares.
  //
  // All six bodies stay mounted and five hide, so a body keeps its half-typed
  // values across a tab switch. `hidden` alone would lose against this
  // compiled `display`, since an author sheet beats the UA one, so the hidden
  // state picks its own named style from the same flag the element carries.
  tabBody: {
    display: "flex",
    flexDirection: "column",
    flex: "1 1 auto",
    minHeight: 0,
    overflowY: "auto",
    overscrollBehavior: "contain",
    // Contains the change list's hidden "Before:"/"After:" text; a
    // positioned container clips and scrolls it instead of the page.
    position: "relative",
    // Room for the focus ring: a scroll box clips at its padding edge
    // (`studio-focus-ring-clipping`, CHANGES-2). The scroll padding keeps
    // that room when a focus scroll stops short of either end.
    padding: focus.reach,
    scrollPadding: focus.reach,
  },
  // The wrapper around a tab's own body. It takes no box of its own, so the
  // body lays out in the tab body's column exactly as a direct child would.
  tabBodyContent: {
    display: "contents",
  },
  tabBodyHidden: {
    display: "none",
  },
  // The Map tab: the canvas alone, filling the width and the height the
  // canvas bar leaves, above a 36rem floor. No band stands over it and no
  // control changes its height (`studio-canvas`).
  canvasRegion: {
    display: "flex",
    flex: "1 1 auto",
    minHeight: "36rem",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
  },
  // The Steps tab: a fixed-width numbered rail on the leading edge and one
  // wide step page beside it (`studio-step-page`). Below the breakpoint the
  // rail gives up its column and stands above the page. Both rows size to
  // their content, so the page takes its content's height and the tab body
  // scrolls the two as one. The tab then holds two scroll boxes, the body and
  // the capped rail, and not three. Below the breakpoint the grid also stops
  // shrinking, so it takes its content's height inside the tab body; a
  // shrunk grid cell would let that content spill past it.
  stepsTab: {
    display: "grid",
    flex: "1 1 auto",
    flexShrink: { default: 1, [NARROW]: 0 },
    gridTemplateColumns: { default: "22rem minmax(0, 1fr)", [NARROW]: "minmax(0, 1fr)" },
    gridTemplateRows: { default: "none", [NARROW]: "auto auto" },
    gap: space.s3,
    alignItems: "stretch",
    minHeight: "36rem",
  },
});

interface EditScreenProps {
  processId: string;
  /** The `edit` route's optional sub-states. `formStepId` renders the form
   * editor under the tab row, in its origin tab's body. `tab` names the open tab, Map when the
   * address names none, and `view` the open tab's view, its first when the
   * address names none. The form editor wins when both arrive, which
   * `routePath` already encodes. `stepId` is a one-shot canvas target ("Show
   * on the canvas") — it never replaces a tab, and `ProcessSurface` clears it
   * from the address once read (`unified-shell`'s navigation requirement). */
  formStepId?: string;
  tab?: ProcessTab;
  view?: TabView;
  stepId?: string;
  token: string;
  /** The calling actor's own roles, for the Settings tab's access lists and
   * their add/delete gating (`studio-app`'s Access-surface requirement).
   * Nothing else on this screen reads it. */
  roles: readonly string[];
  /** Cross-area navigation, threaded down to the Settings tab's "Manage
   * assignment groups for this process" link. `token`, `navigate`, and
   * `onUnauthorized` already take the same shape through this chain. */
  go: (href: string, opts?: NavigateOptions) => void;
  navigate: (route: Route, opts?: NavigateOptions) => void;
  /** The signed-in actor. The stash of unsaved work a 401 leaves behind is
   * keyed by it, so a second actor on the same tab never sees it. */
  actorId: string;
  onUnauthorized: () => void;
  /** Reports the open draft's dirty state upward, so `root.tsx` can guard
   * navigation away from it (design.md: "Report dirtiness upward through one
   * callback prop into a ref"). */
  onDirtyChange?: (dirty: boolean) => void;
}

interface ProcessSurfaceProps {
  processId: string;
  formStepId?: string;
  tab?: ProcessTab;
  view?: TabView;
  stepId?: string;
  token: string;
  roles: readonly string[];
  go: (href: string, opts?: NavigateOptions) => void;
  initialRevision: number;
  initialLayout: Record<string, unknown>;
  /** The published version this draft sits on, for the publish dialog and
   * the published-field lookup.
   * Not `initialBaseVersion`: `initialRevision` and `initialLayout` seed a
   * useState, and this one seeds nothing. `EditScreen` never refreshes the
   * loaded record — `load` depends on processId/token/onUnauthorized alone —
   * so a publish moves the real base version without moving this prop.
   * `ProcessSurface` folds `publishResult.version` over it instead. */
  loadedBaseVersion: number | null;
  /** The loaded draft's `canPublish` report, for the same reason and by the
   * same route: `load` never re-runs, and an administrator can grant or
   * withdraw the permission while this screen sits open. `ProcessSurface`
   * folds whatever `reload()` re-read over it. It deliberately does NOT join
   * `DraftSaveState`, whose exact shape `studio-draftSaveLogic.test.ts` pins
   * with `toEqual`. */
  loadedCanPublish: boolean;
  navigate: (route: Route, opts?: NavigateOptions) => void;
  actorId: string;
  onUnauthorized: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

/** `btn btn-ghost` plus compiled styles, as one set of props: spreading
 * `stylex.props(...)` beside a `className` attribute drops whichever of the
 * two the JSX writes first. */
function ghostBack(...style: stylex.StyleXStyles[]) {
  const compiled = stylex.props(...style);
  return { ...compiled, className: `btn btn-ghost ${compiled.className ?? ""}`.trim() };
}

/**
 * Focuses a tab's own button without a scroll, then hands the scroll to
 * `scrollTabIntoRow`, the one function that scrolls the tab row. At a narrow
 * width the row scrolls sideways, and a plain `focus()` can leave the button
 * part-clipped at the row's edge.
 */
function focusTabButton(tab: ProcessTab): void {
  const button = document.getElementById(tabDomId(tab));
  if (button === null) return;
  button.focus({ preventScroll: true });
  scrollTabIntoRow(button);
}

/**
 * The one process surface (`studio-process-tabs`). It replaces the edit-screen
 * and panels-screen pair: a header bar, then a tab row, then one tab body.
 *
 * Rendered inside DraftProvider, so it can read/replace the Draft via
 * useDraft() — and pass that access down to every panel it mounts.
 * `useDraftToolbarActions` (below) is the one remaining direct consumer of
 * `DraftToolbarProps`; `DraftToolbar` itself no longer mounts here.
 *
 * All six tab bodies stay mounted and five hide. A body keeps its half-typed
 * values across a tab switch: the contract panel holds an outcome name in
 * component state, the data sources panel fetched its list keys on mount, and
 * the field matrix holds its selected cell.
 */
function ProcessSurface({ processId, formStepId, tab, view, stepId, token, roles, go, initialRevision, initialLayout, loadedBaseVersion, loadedCanPublish, navigate, actorId, onUnauthorized, onDirtyChange }: ProcessSurfaceProps) {
  const { draft, mutate, validation, replace, contentLocale } = useDraft();
  const baseLocale = draft.baseLocale ?? "en";
  const [saveState, setSaveState] = useState<DraftSaveState>(() => initialSaveState(initialRevision, initialLayout));
  // The canvas selection is a set (design.md). A set of one drives the step
  // page exactly as the single id did; a set of several names no one step for
  // it, so the canvas bar carries that set's own count and controls.
  const [selectedStepIds, setSelectedStepIds] = useState<string[]>([]);
  const [selectedPathId, setSelectedPathId] = useState<string | undefined>(undefined);
  // Bumps on every canvas request to open a way out (design.md D7). The step
  // page keys its Ways out effect on it too, so the section reopens even where
  // the same way out stays selected.
  const [waysOutRequest, setWaysOutRequest] = useState(0);
  // The path an edit-rail drag currently sits over, resolved the same way the
  // drop itself resolves one (design.md: "The rail reports its moving
  // position"). Drives the drop-target render in `CanvasView`; not the
  // selection, which the drag never touches until release.
  const [insertTargetPathId, setInsertTargetPathId] = useState<string | undefined>(undefined);
  // Whether the JSON surface stands in place of the tab body. It lives in
  // component state and takes no address of its own: `studio-json-view` states
  // none, and the overflow entry names its state either way (design.md's open
  // question).
  const [jsonOpen, setJsonOpen] = useState(false);
  // The tab that opened the form editor: the editor stands in its body, and
  // leaving returns there (`studio-forms-overview`, `studio-form-editor`).
  // The editor's address carries no tab of its own, and this surface stays
  // mounted across the move, so the origin lives here rather than in the
  // address. Leaving the editor clears it, so a later Back onto the editor's
  // address stands Steps current.
  const [formOrigin, setFormOrigin] = useState<ProcessTab | undefined>(undefined);
  // The step the Checks tab is narrowed to, set by a Forms card's badge and
  // cleared by the rail's own "show every check" control.
  const [checksStepId, setChecksStepId] = useState<string | undefined>(undefined);
  // The open tab. On the form editor's address it is the tab the editor
  // stands in, so the tab row, every tab body and every `visible` prop read
  // the editor's place (`studio-process-tabs`).
  const openTab = surfaceTab(tab ?? DEFAULT_TAB, formStepId, formOrigin);
  // The view a tab with a sub-row shows: the address's view while that tab is
  // open and holds it, otherwise the tab's first view.
  const viewOf = <V extends TabView>(owner: ProcessTab, views: readonly V[]): V =>
    views.find((v) => openTab === owner && v === view) ?? views[0]!;
  const fieldsView = viewOf("fields", FIELDS_VIEWS);
  const settingsView = viewOf("settings", SETTINGS_VIEWS);
  // The processes a subprocess step may call. One fetch per mount, read by
  // the step page's own picker.
  const processes = useFetchOnce(token, listProcesses);
  const fields = draftFields(draft);

  const steps = draft.workflow?.steps ?? [];
  const formStepIndex = formStepId !== undefined ? steps.findIndex((s) => s.id === formStepId) : -1;
  const formStep = formStepIndex >= 0 ? steps[formStepIndex] : undefined;

  // Lifted out of DraftToolbar (design.md: "the header bar reads lifted
  // DraftToolbar state") — DraftToolbar still computes both; only where
  // they live moves up one level, the same way saveState already works.
  const [savedBody, setSavedBody] = useState<Draft>(() => structuredClone(draft));
  // The layout of the last save, beside `savedBody`. The unsaved state reads
  // both (`isDraftDirty`). Every layout writer below builds a new object
  // rather than mutating `saveState.layout`, which this value and
  // `applySaveResult`'s identity check both rely on.
  const [savedLayout, setSavedLayout] = useState(initialLayout);
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);
  // Whether the draft still stands as the last publish left it. The header bar
  // holds the Versions offer and the ink version line on it (`studio-publish`).
  const [justPublished, setJustPublished] = useState(false);
  // `loadedBaseVersion` cannot move: `EditScreen.load` depends on
  // processId/token/onUnauthorized alone, and neither the publish path nor
  // the conflict reload re-runs it. A publish DOES move the stored base
  // version — `markDraftPublished` sets `base_version` inside the publish
  // transaction — and the response carries the new number, so fold it over.
  const changesBaseVersion = publishResult?.version ?? loadedBaseVersion;
  // Folded exactly like `changesBaseVersion` above: the loaded prop underneath,
  // and whatever `reload()` last re-read on top. `undefined` means nothing has
  // re-read it yet, which is why the fold uses `??` and not a truthiness test —
  // a re-read `false` has to win over a loaded `true`.
  const [reloadedCanPublish, setReloadedCanPublish] = useState<boolean | undefined>(undefined);
  const canPublish = reloadedCanPublish ?? loadedCanPublish;
  // Client-only, set on every successful save (never on a reload) — new
  // state DraftToolbar tracks nowhere today.
  const [lastSavedAt, setLastSavedAt] = useState<Date | undefined>(undefined);

  // Reports dirtiness upward for `root.tsx`'s navigation guard (design.md:
  // "Report dirtiness upward through one callback prop into a ref"). The
  // cleanup fires on unmount AND on every dependency change, so a route
  // change away from `edit` can never leave a stale `true` behind.
  const dirtyNow = isDraftDirty(draft, savedBody, saveState.layout, savedLayout);
  // The first dirty render retires the offer, during render, the way React
  // adjusts state from state.
  const nextJustPublished = justPublishedAfter(justPublished, dirtyNow);
  if (nextJustPublished !== justPublished) setJustPublished(nextJustPublished);
  useEffect(() => {
    onDirtyChange?.(dirtyNow);
    return () => onDirtyChange?.(false);
  }, [dirtyNow]);

  // A 401 ends the session and unmounts this screen. A dirty draft writes
  // its stash first, so the same actor can restore the work on the next
  // visit (`studio-app`). Every consumer reads this through `useFail`, which
  // holds it in a ref, so a new identity on each render re-runs no effect.
  const stashOnUnauthorized = () => {
    if (dirtyNow) stashDraft(tabStorage(), actorId, processId, { body: draft, layout: saveState.layout, revision: saveState.revision });
    onUnauthorized();
  };
  // The stash a past 401 left for this actor and process, read once on
  // mount against the loaded record. The initializer clears a stash equal to
  // that record; a second run in development clears nothing more.
  const [stash, setStash] = useState(() => readRestorable(tabStorage(), actorId, processId, { body: draft, layout: saveState.layout }));
  const dropStash = () => {
    clearStash(tabStorage(), actorId, processId);
    setStash(undefined);
  };
  // The stored revision stays, so a save over a draft that moved since
  // answers 409 and the conflict banner appears. `savedBody` and
  // `savedLayout` keep the loaded record, so the restored draft reads dirty.
  const restoreStash = () => {
    if (stash === undefined || requestRunning) return;
    if (dirtyNow && !confirm(t("restoreNotice.replaceConfirm"))) return;
    replace(stash.body);
    setSaveState((s) => ({ ...s, revision: stash.revision, layout: stash.layout }));
    dropStash();
    focusTabButton(openTab);
  };
  const discardStash = () => {
    if (requestRunning) return;
    dropStash();
    focusTabButton(openTab);
  };

  // The canvas-wide edge style shares the `layout` blob with node positions.
  // No collision is possible: every step id carries a `step_` prefix, and
  // `positionOf` admits only a point. An absent value reads as the default,
  // and so does a value this version does not know — a draft saved by a later
  // one must render, not throw.
  const edgeStyle: EdgeStyle =
    saveState.layout.canvasEdgeStyle === "smoothstep" || saveState.layout.canvasEdgeStyle === "step"
      ? saveState.layout.canvasEdgeStyle
      : DEFAULT_EDGE_STYLE;

  const onEdgeStyleChange = (style: EdgeStyle) => {
    setSaveState((s) => ({ ...s, layout: { ...s.layout, canvasEdgeStyle: style } }));
  };

  // The second reserved key in that same blob. A malformed entry reads as no
  // waypoints rather than failing the render, the rule `canvasEdgeStyle`
  // already follows: a draft saved by a later version must still draw.
  // `isPoint` is that same guard, and `canvas/layout.ts` is its one home.
  // Memoized on the stored value, as `groups` below is: the canvas places its
  // sentences on both, and a fresh object per render would re-run that
  // placement on every selection click.
  const storedWaypoints = saveState.layout.waypoints;
  const waypoints = useMemo(() => {
    const out: Record<string, Point[]> = {};
    if (storedWaypoints && typeof storedWaypoints === "object") {
      for (const [pathId, list] of Object.entries(storedWaypoints as Record<string, unknown>)) {
        if (Array.isArray(list) && list.every(isPoint)) out[pathId] = list;
      }
    }
    return out;
  }, [storedWaypoints]);

  // The third reserved key in that blob. An entry that does not parse drops,
  // and so does a member the draft no longer holds: a step delete is an
  // ordinary edit, and it must not strand a box or fail the render.
  const storedGroups = saveState.layout.groups;
  const groups = useMemo(() => {
    const out: StepGroup[] = [];
    if (Array.isArray(storedGroups)) {
      for (const entry of storedGroups as unknown[]) {
        const g = entry as Partial<StepGroup>;
        if (!g || typeof g.id !== "string" || typeof g.name !== "string" || !Array.isArray(g.stepIds)) continue;
        const stepIds = g.stepIds.filter((id): id is string => typeof id === "string" && steps.some((s) => s.id === id));
        out.push({ id: g.id, name: g.name, stepIds, collapsed: g.collapsed === true });
      }
    }
    return out;
  }, [storedGroups, steps]);

  // One writer for every group edit: create, rename, collapse, expand and
  // ungroup all rewrite the same list, the way `onWaypointsChange` rewrites
  // one path's points.
  const onGroupsChange = (next: StepGroup[]) => {
    setSaveState((s) => ({ ...s, layout: { ...s.layout, groups: next } }));
  };

  const onWaypointsChange = (pathId: string, points: Point[]) => {
    setSaveState((s) => {
      const next = { ...(s.layout.waypoints as Record<string, Point[]> | undefined) };
      // An empty list leaves no key behind: a path with no waypoints reads
      // identically whether the key is absent or empty, and the absent form
      // keeps a reset from growing the blob.
      if (points.length === 0) delete next[pathId];
      else next[pathId] = points;
      return { ...s, layout: { ...s.layout, waypoints: next } };
    });
  };

  // Position is not body — it lives in `saveState.layout` (round-tripped
  // opaquely by DraftToolbar's save call already), never in the Draft
  // model's `mutate()` (design.md: the two are separate existing surfaces).
  const onMoveCanvasPosition = (stepId: string, point: Point) => {
    setSaveState((s) => ({ ...s, layout: { ...s.layout, [stepId]: point } }));
  };

  // Overwrites every step's position at once, unlike onMoveCanvasPosition's one-step
  // write, and clears every waypoint too (design.md, Decisions 2 and 4).
  // Gated by hasHandPlacedStep, through the browser's own confirm() with a
  // t() string. Publish and Discard no longer share that pattern: each commits
  // an act the developer cannot undo, so each confirms in the application's own
  // modal dialog instead (studio-publish, studio-app). An arrange is a local
  // layout edit the author can undo by moving a step back, and converting it
  // is the named follow-up, not this change.
  // The confirmation runs before the layout library loads. A library that
  // fails to load leaves the layout as it was and reports through the header
  // bar's error banner (`studio-canvas`).
  const onArrange = async () => {
    if (hasHandPlacedStep(steps as LayoutStep[], saveState.layout) && !confirm(t("canvas.arrangeConfirm"))) return;
    let arranged: Record<string, Point>;
    try {
      arranged = await arrangeSteps(steps as LayoutStep[], groups, draft.workflow?.initialStep, saveState.layout);
    } catch (e) {
      actions.reportError(e);
      return;
    }
    setSaveState((s) => {
      const next: Record<string, unknown> = { ...s.layout, waypoints: {} };
      for (const [stepId, point] of Object.entries(arranged)) next[stepId] = snapToGrid(point);
      return { ...s, layout: next };
    });
  };

  // The second argument carries a clicked path's id (task 3.13); a node
  // click or a background deselect passes none, which clears it. This writes
  // a set of one, or an empty one — it is the single-selection path.
  const onSelectStep = (stepId: string | undefined, pathId?: string) => {
    setSelectedStepIds(stepId ? [stepId] : []);
    setSelectedPathId(pathId);
  };

  // The route's one-shot step target ("Show on the map"). Keyed on `stepId`
  // alone, not on mount: the surface stays mounted across a tab switch, so a
  // mount-only read would never fire on this navigation. An unknown id selects
  // nothing, the same rule an unknown tab name already follows. The effect then
  // replaces the address with the plain `edit` route, which opens Map — a
  // push here would leave `/edit/step/:stepId` as a live history entry that
  // re-selects the step, and re-pushes itself, on every Back, so Back could
  // never reach the tab the navigation came from (unified-shell's navigation
  // requirement).
  useEffect(() => {
    if (stepId === undefined) return;
    onSelectStep(steps.some((s) => s.id === stepId) ? stepId : undefined);
    navigate({ name: "edit", processId }, { replace: true });
  }, [stepId]);

  // The form editor's address, on a direct load as on an open: the editor's
  // step becomes the selected one, so the step crumb and a return to Steps
  // land on it. An unknown id selects nothing; the editor's panel says the
  // step no longer exists. An address with no form step means the author
  // left the editor, which drops the origin it stood under.
  useEffect(() => {
    if (formStepId === undefined) {
      setFormOrigin(undefined);
      return;
    }
    if (steps.some((s) => s.id === formStepId)) onSelectStep(formStepId);
  }, [formStepId]);

  // The whole set at once: a shift-click's toggle and a marquee's release. A
  // path belongs to one step, so a set write drops any selected path.
  const onSelectSteps = (stepIds: string[]) => {
    setSelectedStepIds(stepIds);
    setSelectedPathId(undefined);
  };

  // The step page takes one step. A set of several names none for it, so the
  // canvas bar carries the set's count and its delete and group controls
  // instead (studio-canvas: "The step page holds one step, and a set of
  // several names no one step for it").
  const inspectedStepId = selectedStepIds.length === 1 ? selectedStepIds[0] : undefined;

  // The rail's own order, read three times: for the row list's current mark,
  // for the walk's two ends, and for the step the page falls back to. It is
  // the draft's own `workflow.steps` order, the same order `StepsRail` lists.
  const railOrder = steps;
  // The bar's own reachability walk over the same two inputs (design D7). It
  // no longer shares the rail's order — the rail lists the draft's own
  // `workflow.steps` order, and this walk stays independent. The canvas bar
  // reads it for one selected step: a step the initial step reaches over
  // paths reads as nothing, and one no chain reaches reads as unconnected. A
  // set of several carries its count instead.
  const reachable = useMemo(() => reachableStepIds(steps, draft.workflow?.initialStep), [steps, draft.workflow?.initialStep]);
  const unconnected = selectedStepIds.length === 1 && !reachable.has(selectedStepIds[0]);
  // The step the step page holds, and the row the rail reads as current.
  // Selecting none holds the rail's own first step, so the page never stands
  // empty on a draft carrying one. One piece of state drives both regions:
  // the canvas and the rail cannot disagree about which step is current.
  const pageStepId = inspectedStepId ?? railOrder[0]?.id;
  const pageIndex = railOrder.findIndex((s) => s.id !== undefined && s.id === pageStepId);
  const pageStep = pageIndex >= 0 ? railOrder[pageIndex] : undefined;

  /** One end of the walk, already resolved to a label so the page reads no
   * locale for it. `undefined` at either end of the rail's order, which is
   * what refuses that control's press. */
  const walkNeighbour = (at: number): WalkNeighbour | undefined => {
    const neighbour = railOrder[at];
    if (neighbour?.id === undefined) return undefined;
    return {
      id: neighbour.id,
      label: stepText(neighbour, contentLocale, baseLocale),
    };
  };

  /** The rail's reorder control. It moves one step to a target index in the draft's
   * own `workflow.steps` order — the move changes the step's position in that order,
   * which is what the rail, the canvas traversal and the serialized
   * definition all read. */
  const onMoveStep = (stepId: string, toIndex: number) => {
    mutate((d) => {
      const list = d.workflow?.steps;
      if (!list) return;
      const from = list.findIndex((s) => s.id === stepId);
      if (from < 0) return;
      if (d.workflow) d.workflow.steps = moveTo(list, from, toIndex);
    });
  };

  /** The step page's remove control: one step, by id. The canvas keeps its
   * own delete control for a whole selection. A path pointing at a removed
   * step stays as it is, and the checks rail reports it. The page remounts
   * for the next step, which drops the focus Remove this step held. One
   * animation frame later the rail's current row takes it, or the first add
   * control when the rail holds no row. */
  const onRemoveStep = (stepId: string) => {
    const remaining = steps.filter((s) => s.id !== stepId).length;
    mutate((d) => {
      if (!d.workflow?.steps) return;
      d.workflow.steps = d.workflow.steps.filter((s) => s.id !== stepId);
      if (d.workflow.initialStep === stepId) d.workflow.initialStep = d.workflow.steps[0]?.id;
    });
    if (stepId === inspectedStepId) onSelectStep(undefined);
    requestAnimationFrame(() => document.getElementById(focusAfterStepRemove(remaining))?.focus());
  };

  /** Deletes every step in the set, the way the step page's own remove control
   * deletes one. A path pointing at a deleted step stays as it is; the single
   * remove leaves one the same way, and the checks rail reports it. */
  const deleteSelection = () => {
    const doomed = new Set(selectedStepIds);
    mutate((d) => {
      if (!d.workflow?.steps) return;
      d.workflow.steps = d.workflow.steps.filter((s) => !s.id || !doomed.has(s.id));
      if (d.workflow.initialStep && doomed.has(d.workflow.initialStep)) {
        d.workflow.initialStep = d.workflow.steps[0]?.id;
      }
    });
    onSelectStep(undefined);
  };

  /** The DOM hit test behind both the drop branch and the drag-move
   * highlight (design.md: "The hit test runs through the DOM, not through
   * geometry"). `CanvasView` stamps the edge group and its guard label's
   * `foreignObject` with `data-path-id`/`data-step-id`; `.canvas-edge-hitarea`
   * supplies the pointer tolerance, since the browser — not this code — tests
   * its wide transparent stroke. Undefined when nothing under the point
   * carries a path id, e.g. a node (which draws over a path) or empty canvas. */
  const resolveDropPath = (clientX: number, clientY: number): { pathId: string; sourceStepId: string } | undefined => {
    const group = document.elementFromPoint(clientX, clientY)?.closest("[data-path-id]");
    const pathId = group?.getAttribute("data-path-id") ?? undefined;
    const sourceStepId = group?.getAttribute("data-step-id") ?? undefined;
    return pathId && sourceStepId ? { pathId, sourceStepId } : undefined;
  };

  /** `CanvasBar.onDragMove`: fired on every pointer move a bar drag makes. An
   * `end` drag resolves to no target — a terminal step never lands inside a
   * path, so nothing may suggest that it does. */
  const onCanvasBarDragMove = (kind: StepKind, clientX: number, clientY: number) => {
    setInsertTargetPathId(kind === "end" ? undefined : resolveDropPath(clientX, clientY)?.pathId);
  };

  /** Combines the new step's position with clearing the split path's stored
   * waypoints (design.md, Decision "The insert clears that path's
   * waypoints") in the one `saveState.layout` write task 3.5 asks for, rather
   * than two separate `setSaveState` calls. */
  const onInsertLayoutWrite = (stepId: string, point: Point, splitPathId: string) => {
    setSaveState((s) => {
      const nextWaypoints = { ...(s.layout.waypoints as Record<string, Point[]> | undefined) };
      delete nextWaypoints[splitPathId];
      return { ...s, layout: { ...s.layout, [stepId]: point, waypoints: nextWaypoints } };
    });
  };

  /** The one draft-mutation method every step-creating control on this screen
   * shares: the canvas bar's drop, its press, and the steps rail's own foot on
   * a draft holding no step (`studio-canvas`'s canvas bar requirement). */
  const appendStep = (created: ReturnType<typeof newStep>) => {
    addToDraftArray(
      mutate,
      (d) => {
        d.workflow ??= {};
        d.workflow.steps ??= [];
        d.workflow.initialStep ??= created.id;
        return d.workflow.steps;
      },
      created,
    );
  };

  /** The rail foot's three add controls, through the same creation path the
   * canvas bar's own drop uses. The new step opens on the page at once
   * (`studio-step-page`). It gets no position of its own: the Steps tab shows
   * no canvas, so `autoPlaceSteps` places it when the Map tab next draws. */
  const onAddStep = (kind: StepKind) => {
    const created = newStep(kind, seedLocalizedText(contentLocale));
    appendStep(created);
    if (created.id) onSelectStep(created.id);
  };

  /** The canvas bar's own drag-to-place, through that same creation path.
   * Screen coordinates in, since the bar holds no canvas geometry of its own:
   * `elementFromPoint` finds the live canvas (or none, when the drop misses
   * it), and `svgPointFromClient` converts through its current pan/zoom
   * transform — the same conversion `CanvasView`'s own node and handle drags
   * use.
   *
   * A drop over a rendered path inserts the new step into it instead of
   * placing it free-standing (design.md: "The gesture is a drop, not a
   * control on the edge") — the topmost element under the pointer decides,
   * the same rule `elementFromPoint` already gives every other drop. An `end`
   * step never takes this branch: a terminal step has no outgoing path, so it
   * cannot stand between two steps. */
  const onCanvasBarDrop = (kind: StepKind, clientX: number, clientY: number) => {
    setInsertTargetPathId(undefined);
    const target = document.elementFromPoint(clientX, clientY);
    // Resolve through the canvas body, not through the SVG under the
    // pointer. Panzoom scales the SVG element itself, so a zoomed-out canvas
    // leaves most of the body outside the SVG's own box, while the body still
    // shows the graph. Every point the author reads as canvas therefore places
    // a step. `svgPointFromClient` maps a point outside the box just as well:
    // an inverse CTM is a linear map, not a bounded one.
    const svg = target?.closest(`#${CANVAS_BODY_ID}`)?.querySelector<SVGSVGElement>("svg");
    if (!svg) return; // dropped outside the canvas — no placement
    // Rounded here, the same way a drag's release is: a dropped step lands on
    // the lattice the author can see.
    const point = snapToGrid(svgPointFromClient(svg, clientX, clientY));
    const created = newStep(kind, seedLocalizedText(contentLocale));

    const dropTarget = kind !== "end" ? resolveDropPath(clientX, clientY) : undefined;
    if (dropTarget && created.id) {
      mutate((d) => {
        d.workflow ??= {};
        d.workflow.steps = insertOnPath(
          d.workflow.steps ?? [],
          dropTarget.sourceStepId,
          dropTarget.pathId,
          created,
          contentLocale,
          baseLocale,
          t("steps.unnamedStep"),
        );
      });
      onInsertLayoutWrite(created.id, point, dropTarget.pathId);
      onSelectStep(created.id);
      return;
    }

    appendStep(created);
    if (created.id) {
      onMoveCanvasPosition(created.id, point);
      onSelectStep(created.id);
    }
  };

  /** The canvas bar's press: an add control activated with no drag. The step
   * lands at the centre of the visible canvas, on the lattice, clear of every
   * step already placed (design D2).
   *
   * It measures that centre off the canvas body's own rect rather than calling
   * `onCanvasBarDrop` with it. That handler runs `elementFromPoint`, so a
   * press whose centre falls over an existing node would place the new step on
   * top of it. */
  const onCanvasBarAddStep = (kind: StepKind) => {
    const body = document.getElementById(CANVAS_BODY_ID);
    const rect = body?.getBoundingClientRect();
    const svg = body?.querySelector<SVGSVGElement>("svg");
    if (!rect || !svg) return; // the canvas is not on screen — no placement
    const centre = snapToGrid(svgPointFromClient(svg, rect.left + rect.width / 2, rect.top + rect.height / 2));
    // The drawn positions, not the stored blob alone (design D2). A step the
    // steps rail's foot created and nobody dragged has no stored entry, and
    // `CanvasView` draws it anyway. `drawnPositions` is the one home of that
    // resolution, and `CanvasView.positionOf` reads the same function, so the
    // press tests against exactly the nodes an author can see. Its record is
    // keyed by step id alone, so the blob's reserved keys stay out of it.
    const drawn = drawnPositions(steps as LayoutStep[], draft.workflow?.initialStep, saveState.layout);
    const placed: NodePosition[] = Object.entries(drawn).map(([id, at]) => ({ id, x: at.x, y: at.y }));
    const point = freeLatticePoint(centre, placed);
    const created = newStep(kind, seedLocalizedText(contentLocale));
    appendStep(created);
    if (created.id) {
      onMoveCanvasPosition(created.id, point);
      onSelectStep(created.id);
    }
  };

  // The save/discard/publish logic itself, called directly here rather than
  // through a mounted `<DraftToolbar>` element, so this is the only instance
  // of that state. `ProcessHeaderBar` renders the buttons that call it.
  // Mounting `<DraftToolbar>` as well would run a second, independent copy
  // of saving/error/publishing state.
  const actions = useDraftToolbarActions({
    processId,
    token,
    saveState,
    onSaveState: setSaveState,
    savedBody,
    onSavedBodyChange: (body: Draft) => setSavedBody(structuredClone(body)),
    savedLayout,
    onSavedLayoutChange: setSavedLayout,
    // A successful save and a discarded draft each make the stash stale. A
    // discarded draft restarts its revision at 0, so a stale stash could
    // later restore over a new draft that reached the same revision.
    onSaved: () => {
      setLastSavedAt(new Date());
      dropStash();
    },
    publishResult,
    onPublishResult: (result: PublishResult | null) => {
      setPublishResult(result);
      setJustPublished(result !== null);
    },
    onDiscarded: () => {
      dropStash();
      onDirtyChange?.(false);
      navigate({ name: "processes" });
    },
    onUnauthorized: stashOnUnauthorized,
    onCanPublishChange: setReloadedCanPublish,
  });
  // A save's answer writes its revision over the draft's. The restore notice
  // waits for the answer, or a restore would drop the stored revision.
  const requestRunning = actions.saving || actions.publishing;

  const counts = processTabCounts(draft, validation.issues);
  // The Checks tab's own count reads this color when the draft's worst open
  // issue is a blocker (`studio-process-tabs`); no other tab's count does.
  const checksBlocked = checksDotState(groupChecksBySource(validation), validation.noStepYet) === "blocker";
  /** Opens a tab, and one of its views when `targetView` names one. A tab
   * with a sub-row and no view opens on its first view. */
  const goToTab = (target: ProcessTab, targetView?: TabView) => {
    // The narrowing belongs to one visit to the Checks tab. Leaving it drops
    // the filter, so a later press on the Checks control opens the whole list.
    if (target !== "checks") setChecksStepId(undefined);
    navigate(
      targetView === undefined
        ? { name: "edit", processId, tab: target }
        : { name: "edit", processId, tab: target, view: targetView },
    );
  };
  // The pending focus target for `openTabFromRow` below: the tab a Checks row
  // asked to open, until the effect below moves focus there.
  const [pendingTabFocus, setPendingTabFocus] = useState<ProcessTab | undefined>(undefined);
  // A Checks row hands focus to the tab it opens (`studio-process-tabs`).
  // A target already open takes focus at once and records nothing: the
  // effect below only fires on a tab switch, and this target's tab is not
  // switching. Any other target goes through `goToTab` and becomes the
  // pending focus. `openTab` follows the route on a later render, and the
  // effect waits for that render, so focus lands on a tab button that
  // already carries `aria-selected="true"` rather than on one still
  // unselected. A target naming a step selects it, and the way out it names,
  // so the step page opens on that step with that row marked.
  const openTabFromRow = (target: CheckTarget) => {
    if (target.tab === openTab) {
      focusTabButton(target.tab);
    } else {
      goToTab(target.tab, target.view);
      setPendingTabFocus(target.tab);
    }
    if (target.stepId !== undefined) onSelectStep(target.stepId, target.pathId);
  };
  // Moves focus onto the open tab only while it is the pending target, and
  // clears the pending value either way, so a stale value never pulls focus
  // on a later, unrelated tab switch.
  useEffect(() => {
    if (pendingTabFocus === openTab) focusTabButton(openTab);
    setPendingTabFocus(undefined);
  }, [openTab]);
  // What the Checks tab narrows to, resolved from the step the badge named.
  // A step the draft no longer holds narrows nothing: the filter drops rather
  // than showing an empty list nobody can widen back by pressing a badge.
  const checksNarrowStep = checksStepId === undefined ? undefined : steps.find((s) => s.id === checksStepId);
  const checksNarrowedTo =
    checksNarrowStep === undefined
      ? undefined
      : {
          label:
            resolveDraftLocalizedText(checksNarrowStep.label, contentLocale, baseLocale) ||
            checksNarrowStep.key ||
            t("steps.unnamedStep"),
          entityIds: stepEntityIds(checksNarrowStep),
        };

  /** Opens the form editor for one step, remembering the tab it opened from,
   * and selects that step. */
  const openFormEditor = (target: string, from: ProcessTab) => {
    setFormOrigin(from);
    onSelectStep(target);
    navigate({ name: "edit", processId, formStepId: target });
  };
  /** Leaves the form editor for `target` and hands the focus to that tab's
   * button, since the control that left unmounts with the editor. A target
   * already open takes the focus at once: the pending-focus effect fires
   * only on an `openTab` change, and leaving for the origin tab changes
   * nothing there. */
  const leaveFormEditorFor = (target: ProcessTab) => {
    goToTab(target);
    if (target === openTab) focusTabButton(target);
    else setPendingTabFocus(target);
  };
  /** The header bar's "Editing" note: the Settings tab's Process view, with the
   * focus on the Settings tab. `openTabFromRow` keeps the open view, and an
   * author on the Access view has to land on Process. */
  const openSettings = () => {
    if (formStepId !== undefined) {
      leaveFormEditorFor("settings");
      return;
    }
    goToTab("settings", "process");
    if (openTab === "settings") focusTabButton("settings");
    else setPendingTabFocus("settings");
  };
  /** Leaves the form editor for the tab it stands in. */
  const leaveFormEditor = () => leaveFormEditorFor(formEditorReturnTab(formOrigin));
  /** The breadcrumb's step crumb: the step's own page on the Steps tab. */
  const openFormStep = () => {
    if (formStepId !== undefined) onSelectStep(formStepId);
    leaveFormEditorFor("steps");
  };
  const processLabel =
    resolveDraftLocalizedText(draft.label, contentLocale, baseLocale) ?? t("headerBar.unnamedProcess");

  // The form editor, or the banner for a step the draft no longer holds. It
  // stands in the open tab's panel while the address carries a form step.
  const formEditor =
    formStepId === undefined ? null : formStep ? (
      // Local boundaries: the shell's own would replace the whole area,
      // draft included, while the chunk loads or when it fails to load.
      <FormEditorBoundary onBack={() => leaveFormEditor()}>
        <Suspense fallback={<p {...stylex.props(styles.screenLoading)}>{t("app.screenLoading")}</p>}>
          <FormEditorScreen
            step={formStep}
            index={formStepIndex}
            fields={fields}
            onBack={() => leaveFormEditor()}
            originTab={openTab}
            onOpenStep={openFormStep}
          />
        </Suspense>
      </FormEditorBoundary>
    ) : (
      <div {...stylex.props(styles.errorBanner, styles.errorBannerInEditScreen)} role="alert">
        <span {...stylex.props(styles.errorBannerStamp)}>{t("error.failed")}</span>
        <span {...stylex.props(styles.errorBannerMessage)}>{t("formEditor.stepNotFound")}</span>
      </div>
    );

  /** One tab body. Every one of the six renders; five hide. `hidden` is the
   * mechanism, so a hidden body leaves both the tab order and the
   * accessibility tree while keeping its own state.
   *
   * The form editor stands in the open tab's panel, ahead of that tab's own
   * body, which stays mounted under `hidden` and keeps its half-typed state
   * (`studio-form-editor`: "The form editor opens under the tab row"). The
   * body's wrapper renders on every tab at every moment, so opening the
   * editor never moves the body in the tree and never remounts it. */
  const tabPanel = (target: ProcessTab, body: ReactNode) => {
    const hide = jsonOpen || target !== openTab;
    const editorHere = formEditor !== null && target === openTab;
    return (
      <div
        id={tabPanelDomId(target)}
        role="tabpanel"
        aria-labelledby={tabDomId(target)}
        hidden={hide}
        // ponytail: a window refocus dispatches `focus` to the element that
        // already holds it, with no fresh `pointerdown`/`keydown` first, so
        // `lastInputModality` (`focusScroll.ts`) still reads whatever the
        // last real interaction set. Ceiling: refocusing the window after a
        // KEYBOARD interaction still re-runs this handler and can jump a
        // hand-scrolled, partly hidden control back into view. Leaving by
        // Alt+Tab hits this too: its Alt keydown flips the flag to
        // "keyboard" before the refocus fires, even when the control was
        // last reached by a POINTER interaction. Upgrade:
        // `ProcessTabRow.tsx`'s own `windowBlurred` guard
        // (`focusScrollsRow`), lifted onto this shared handler.
        onFocusCapture={scrollKeyboardFocusIntoView}
        {...stylex.props(styles.tabBody, hide && styles.tabBodyHidden)}
      >
        {editorHere && formEditor}
        <div hidden={editorHere} {...stylex.props(styles.tabBodyContent, editorHere && styles.tabBodyHidden)}>
          {body}
        </div>
      </div>
    );
  };

  return (
    <PublishedFieldIdsProvider processId={processId} token={token} baseVersion={changesBaseVersion}>
      <main {...stylex.props(styles.studioScreen, styles.studioEditScreen)}>
        {/* Renders on both surfaces. Only its process label input and its
            "Editing" note read `structureActive`. Test, Publish, Save and the
            menu stand whichever surface is open (`studio-process-tabs`). */}
        <ProcessHeaderBar
          revision={saveState.revision}
          isDirty={dirtyNow}
          lastSavedAt={lastSavedAt}
          publishResult={publishResult}
          conflict={saveState.conflict}
          actions={actions}
          canPublish={canPublish}
          baseVersion={changesBaseVersion}
          validation={validation}
          processLabel={processLabel}
          structureActive={!jsonOpen}
          processId={processId}
          token={token}
          justPublished={justPublished}
          onBack={() => navigate({ name: "processes" })}
          onOpenSettings={openSettings}
          onToggleJson={() => setJsonOpen((open) => !open)}
          onVersions={() => navigate({ name: "versions", processId })}
          onPlayer={() => navigate({ name: "play", processId })}
        />
        {showsStructuralBanner(validation) && <p {...stylex.props(styles.draftIncomplete)}>{t("app.draftIncomplete")}</p>}
        {/* Either button moves focus to the open tab, which the tab row holds
            over the form editor too. */}
        {stash && <RestoreNotice onRestore={restoreStash} onDiscard={discardStash} disabled={requestRunning} />}
        <div {...stylex.props(styles.surface)}>
          <ProcessTabRow
            open={openTab}
            counts={counts}
            checksBlocked={checksBlocked}
            onOpen={(target) => (formStepId === undefined ? goToTab(target) : leaveFormEditorFor(target))}
            jsonOpen={jsonOpen}
          />
          {/* The JSON surface stands in place of every tab body, never beside
              one: no draft-body-writing control may stay reachable while it is
              open (`studio-json-view`). The six bodies below stay mounted and
              hidden, and a `hidden` subtree reaches neither the tab order nor
              the accessibility tree. */}
          {jsonOpen && <JsonView draft={draft} onApply={replace} />}

          {tabPanel(
            "map",
            <>
              {/* The canvas bar, then the canvas filling the body it leaves.
                  `styles.tabBody` is a column flex, so the bar stacks above
                  the canvas and holds its own height whatever the selection
                  carries. No band stands over the canvas, and no control
                  changes its height (`studio-canvas`). */}
              <CanvasBar
                onAddStep={onCanvasBarAddStep}
                onDrop={onCanvasBarDrop}
                onDragMove={onCanvasBarDragMove}
                selectedStepIds={selectedStepIds}
                unconnected={unconnected}
                onDeleteSelection={deleteSelection}
                groups={groups}
                onGroupsChange={onGroupsChange}
              />
              <div id={CANVAS_BODY_ID} {...stylex.props(styles.canvasRegion)}>
                <CanvasView
                  layout={saveState.layout}
                  onMoveStep={onMoveCanvasPosition}
                  onArrange={onArrange}
                  selectedStepIds={selectedStepIds}
                  onSelectStep={onSelectStep}
                  onSelectSteps={onSelectSteps}
                  onOpenStepPage={(_stepId, pathId) => {
                    if (pathId !== undefined) setWaysOutRequest((n) => n + 1);
                    goToTab("steps");
                  }}
                  selectedPathId={selectedPathId}
                  edgeStyle={edgeStyle}
                  onEdgeStyleChange={onEdgeStyleChange}
                  waypoints={waypoints}
                  onWaypointsChange={onWaypointsChange}
                  groups={groups}
                  onGroupsChange={onGroupsChange}
                  insertTargetPathId={insertTargetPathId}
                  visible={!jsonOpen && openTab === "map"}
                />
              </div>
            </>,
          )}

          {/* The Steps tab: the numbered rail beside one wide step page
              (`studio-step-page`). */}
          {tabPanel(
            "steps",
            <div {...stylex.props(styles.stepsTab)}>
              <StepsRail
                currentStepId={pageStepId}
                onSelectStep={(target) => onSelectStep(target)}
                onMove={onMoveStep}
                onAddStep={onAddStep}
              />
              <StepPage
                key={pageStep?.id ?? "none"}
                fields={fields}
                token={token}
                step={pageStep}
                stepNumber={pageIndex + 1}
                previous={walkNeighbour(pageIndex - 1)}
                next={walkNeighbour(pageIndex + 1)}
                onSelectStep={(target) => onSelectStep(target)}
                onRemoveStep={onRemoveStep}
                selectedPathId={selectedPathId}
                waysOutRequest={waysOutRequest}
                navigate={(target) => openFormEditor(target, "steps")}
                processes={processes ?? []}
              />
            </div>,
          )}

          {/* The Fields tab: the catalog, the field matrix and the data
              sources, three views under one sub-row. A Read by row's "Open"
              reaches a way out or a step on the Steps tab, and a form in the
              form editor (design.md D4). */}
          {tabPanel(
            "fields",
            <FieldsTabViews
              view={fieldsView}
              onOpenView={(next) => goToTab("fields", next)}
              token={token}
              visible={!jsonOpen && openTab === "fields"}
              onShowStep={(target) => navigate({ name: "edit", processId, stepId: target })}
              onOpenForm={(target) => openFormEditor(target, "steps")}
              onOpenPlace={(place) => {
                const action = placeAction(place);
                if (action.kind === "form") openFormEditor(action.stepId, "steps");
                else openTabFromRow(action.target);
              }}
            />,
          )}
          {/* The Forms tab: one plate per step that declares a view
              (`studio-forms-overview`). A plate's control opens the form
              editor, and its badge opens Checks on that step alone. */}
          {tabPanel(
            "forms",
            <FormsTab
              onOpenForm={(target) => openFormEditor(target, "forms")}
              onOpenChecks={(target) => {
                setChecksStepId(target);
                navigate({ name: "edit", processId, tab: "checks" });
              }}
            />,
          )}
          {/* The one place the full grouped rail stands. A row opens the tab
              that owns its subject (`studio-process-tabs`). */}
          {tabPanel(
            "checks",
            <ChecksRail
              validation={validation}
              canPublish={canPublish}
              narrowedTo={checksNarrowedTo}
              onShowEvery={() => setChecksStepId(undefined)}
              onFix={(issue) => openTabFromRow(checkTarget(issue, steps))}
            />,
          )}
          {/* The Settings tab: the process's own settings, its contract and
              its access lists, three views under one sub-row. The data
              sources stand on the Fields tab. */}
          {tabPanel(
            "settings",
            <SettingsTab
              view={settingsView}
              onOpenView={(next) => goToTab("settings", next)}
              token={token}
              roles={roles}
              processId={processId}
              revision={saveState.revision}
              lastPublish={publishResult ? { version: publishResult.version, definitionHash: publishResult.definitionHash } : undefined}
              go={go}
              onUnauthorized={stashOnUnauthorized}
            />,
          )}
        </div>
      </main>
    </PublishedFieldIdsProvider>
  );
}

/** `record`'s own discriminated shape (not `DraftRecord | undefined | "loading"`
 * before this change) — a load failure now moves to `"error"` explicitly
 * instead of leaving the `"loading"` sentinel in place forever with no
 * indication anything went wrong and no way forward (spa-error-reporting
 * spec: "A screen never renders a permanent loading state after a failure"). */
type EditLoadState =
  | { kind: "loading" }
  | { kind: "not-found" }
  | { kind: "error"; message: string }
  | { kind: "loaded"; record: DraftRecord };

export function EditScreen({ processId, formStepId, tab, view, stepId, token, roles, go, navigate, actorId, onUnauthorized, onDirtyChange }: EditScreenProps) {
  const [state, setState] = useState<EditLoadState>({ kind: "loading" });
  const fail = useFail(onUnauthorized, (e) => setState({ kind: "error", message: describeCaughtError(e) }));

  const load = useCallback(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    getDraft(processId, token)
      .then((r) => {
        if (cancelled) return;
        setState(r ? { kind: "loaded", record: r } : { kind: "not-found" });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        fail(e);
      });
    return () => {
      cancelled = true;
    };
  }, [processId, token, fail]);

  useEffect(() => load(), [load]);

  if (state.kind === "loading") {
    return <main {...stylex.props(styles.studioScreen)}>Loading…</main>;
  }
  if (state.kind === "error") {
    return (
      <main {...stylex.props(styles.studioScreen)}>
        <button type="button" {...ghostBack(styles.studioBack)} onClick={() => navigate({ name: "processes" })}>
          ← Back to processes
        </button>
        <div {...stylex.props(styles.errorBanner)} role="alert">
          <span {...stylex.props(styles.errorBannerStamp)}>{t("error.failed")}</span>
          <span {...stylex.props(styles.errorBannerMessage)}>{state.message}</span>
          <button type="button" className="btn btn-secondary" onClick={() => load()}>
            {t("error.retry")}
          </button>
        </div>
      </main>
    );
  }
  if (state.kind === "not-found") {
    return (
      <main {...stylex.props(styles.studioScreen)}>
        <button type="button" {...ghostBack(styles.studioBack)} onClick={() => navigate({ name: "processes" })}>
          ← Back to processes
        </button>
        <div {...stylex.props(styles.errorBanner)} role="alert">
          <span {...stylex.props(styles.errorBannerStamp)}>{t("error.failed")}</span>
          <span {...stylex.props(styles.errorBannerMessage)}>No draft exists for this process.</span>
        </div>
      </main>
    );
  }

  return (
    <DraftProvider initial={state.record.body as Draft} token={token}>
      <ProcessSurface
        processId={processId}
        formStepId={formStepId}
        tab={tab}
        view={view}
        stepId={stepId}
        token={token}
        roles={roles}
        go={go}
        initialRevision={state.record.revision}
        initialLayout={state.record.layout}
        loadedBaseVersion={state.record.baseVersion}
        loadedCanPublish={state.record.canPublish}
        navigate={navigate}
        actorId={actorId}
        onUnauthorized={onUnauthorized}
        onDirtyChange={onDirtyChange}
      />
    </DraftProvider>
  );
}
