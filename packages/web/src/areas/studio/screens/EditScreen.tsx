import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import { DraftProvider, useDraft } from "../draft/store.js";
import { draftFields } from "../draft/fields.js";
import type { Draft } from "../draft/types.js";
import { t } from "../catalog.js";
import { StepsRail } from "../panels/StepsRail.js";
import { StepPage, type WalkNeighbour } from "../panels/StepPage.js";
import { useDraftToolbarActions } from "../panels/DraftToolbar.js";
import { ProcessHeaderBar } from "../panels/ProcessHeaderBar.js";
import { DraftNavControls } from "../panels/DraftNavControls.js";
import { ProcessTabRow, tabDomId, tabPanelDomId } from "../panels/ProcessTabRow.js";
import { ChecksRail } from "../panels/ChecksRail.js";
import { FieldsTab, DataSourcesTab } from "../panels/EntityTabs.js";
import { ContractPanel } from "../panels/ContractPanel.js";
import { FieldMatrixPanel } from "../panels/FieldMatrixPanel.js";
import { ChangesView } from "../panels/ChangesView.js";
import { PathsView } from "../panels/PathsView.js";
import { FormsTab } from "../panels/FormsTab.js";
import { stepEntityIds } from "../draft/panel-rail.js";
import { seedLocalizedText } from "../draft/localized-text";
import { getDraft, listProcesses } from "../api/client.js";
import { useFetchOnce } from "../panels/shared/useFetchOnce.js";
import type { DraftRecord, PublishResult } from "../api/types.js";
import { DEFAULT_TAB, type ProcessTab, type Route } from "../routing.js";
import { formEditorReturnTab, processTabCounts, tabForIssue } from "../draft/process-tabs.js";
import { initialSaveState, type DraftSaveState } from "./draftSaveLogic.js";
import { isDirty } from "./draftToolbarState.js";
import { CanvasView, groupMembersDomId } from "../canvas/CanvasView.js";
import { CanvasPalette } from "../canvas/CanvasPalette.js";
import { registerOrder } from "../draft/registerOrder.js";
import { snapToGrid, svgPointFromClient, DEFAULT_EDGE_STYLE, type Point, type EdgeStyle } from "../canvas/geometry.js";
import { canGroup, groupMatching, type StepGroup } from "../canvas/groups.js";
import { arrangeSteps, hasHandPlacedStep } from "../canvas/arrange.js";
import type { LayoutStep } from "../canvas/layout.js";
import { newStep, type StepKind } from "../draft/createStep.js";
import { addToDraftArray } from "../draft/draft-array-crud.js";
import { insertOnPath } from "../draft/insertOnPath.js";
import { JsonView } from "../panels/JsonView.js";
import { describeCaughtError } from "../errors.js";
import { useFail } from "../../../shell/useFail.js";
import { FormEditorScreen } from "./FormEditorScreen.js";
import { resolveDraftLocalizedText } from "../draft/localized-text";
import type { NavigateOptions } from "../../../shell/routing.js";

/** The width below which the Steps tab stands one column. `EntityTabs`
 * turns its own rail at this same width, for the same reason. */
const NARROW = "@media (max-width: 64rem)";

/** The Canvas tab's body: what a palette drop resolves the live canvas
 * through. */
const CANVAS_BODY_ID = "studio-canvas-body";

const styles = stylex.create({
  studioScreen: {
    maxWidth: "60rem",
    marginInline: "auto",
    marginBlock: 0,
    paddingTop: space.s4,
    paddingInline: space.s3,
    paddingBottom: space.s6,
  },
  // `.studio-edit-screen` widens past `.studio-screen`'s 60rem cap and takes
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
  studioHeaderNav: {
    display: "flex",
    gap: space.s3,
    marginBottom: space.s2,
    marginTop: 0,
  },
  studioBack: {
    display: "block",
    paddingLeft: 0,
    marginBottom: space.s3,
  },
  // `.studio-header-nav .studio-back`.
  studioBackInNav: {
    display: "block",
    paddingLeft: 0,
    marginBottom: 0,
  },
  // `.draft-incomplete` already zeroes its own top margin, so it needs no
  // extra help from `.studio-edit-screen > *` (below).
  draftIncomplete: {
    marginBlockStart: 0,
    marginBlockEnd: space.s3,
    marginInline: 0,
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
  // All ten bodies stay mounted and nine hide, so a body keeps its half-typed
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
  },
  tabBodyHidden: {
    display: "none",
  },
  // The Canvas tab: the palette beside the canvas, filling the body above a
  // 36rem floor. No bar and no band stand over it (`studio-canvas`).
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
  // rail gives up its column and the two fall under one another, in source
  // order.
  stepsTab: {
    display: "grid",
    flex: "1 1 auto",
    gridTemplateColumns: { default: "18rem minmax(0, 1fr)", [NARROW]: "minmax(0, 1fr)" },
    gridTemplateRows: { default: "none", [NARROW]: "auto minmax(0, 1fr)" },
    gap: space.s3,
    alignItems: "stretch",
    minHeight: "36rem",
  },
  canvasInspector: {
    minWidth: 0,
    overflowY: "auto",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
    padding: space.s3,
  },
  canvasSelection: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: space.s3,
  },
  canvasSelectionHeading: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.s2,
    width: "100%",
    paddingBottom: space.s2,
    borderBottom: `2px solid ${colors.divider}`,
  },
  canvasSelectionCount: {
    fontFamily: fonts.mono,
    fontVariantNumeric: "tabular-nums",
  },
  // `.canvas-group-name` (stylex-phase-3-studio's D2) is now fully compiled
  // (stylex-phase-4-canvas's D5): `canvas/CanvasView.tsx`'s own SVG `<text>`
  // reads its own independent style for `font-family`/`font-size`/`fill`,
  // and this label's only borrowed property, `cursor: grab`, moved here.
  // The label-above-control shape design-language.md's own field rule
  // states is this file's addition.
  canvasGroupNameField: {
    display: "flex",
    flexDirection: "column",
    gap: space.s1,
    cursor: "grab",
  },
});

interface EditScreenProps {
  processId: string;
  /** The `edit` route's optional sub-states. `formStepId` renders in place of
   * the tab row and its body. `tab` names the open tab, Canvas when the
   * address names none. The form editor wins when both arrive, which
   * `routePath` already encodes. `stepId` is a one-shot canvas target ("Show
   * on the canvas") — it never replaces a tab, and `ProcessSurface` clears it
   * from the address once read (`unified-shell`'s navigation requirement). */
  formStepId?: string;
  tab?: ProcessTab;
  stepId?: string;
  token: string;
  /** Cross-area navigation, threaded down to `ProcessHeaderBar`'s "Manage
   * assignment groups for this process" link (design.md: "Threading `go`
   * down to the link"). `token`, `navigate`, and `onUnauthorized` already
   * take the same shape through this chain. */
  go: (href: string, opts?: NavigateOptions) => void;
  navigate: (route: Route, opts?: NavigateOptions) => void;
  onUnauthorized: () => void;
  /** The element `root.tsx` reserves inside the studio's area nav. The
   * surface renders its four draft controls into it through a portal: they
   * belong to the open draft, whose state lives inside `DraftProvider`, and
   * the nav sits outside it. `null` until the nav's own callback ref fires. */
  navSlot: HTMLElement | null;
  /** Reports the open draft's dirty state upward, so `root.tsx` can guard
   * navigation away from it (design.md: "Report dirtiness upward through one
   * callback prop into a ref"). */
  onDirtyChange?: (dirty: boolean) => void;
}

interface ProcessSurfaceProps {
  processId: string;
  formStepId?: string;
  tab?: ProcessTab;
  stepId?: string;
  token: string;
  go: (href: string, opts?: NavigateOptions) => void;
  navSlot: HTMLElement | null;
  initialRevision: number;
  initialLayout: Record<string, unknown>;
  /** The published version this draft sits on, for the Changes tab.
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
  onUnauthorized: () => void;
  onDirtyChange?: (dirty: boolean) => void;
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
 * All ten tab bodies stay mounted and nine hide. A body keeps its half-typed
 * values across a tab switch: the contract panel holds an outcome name in
 * component state, the data sources panel fetched its list keys on mount, and
 * the field matrix holds its selected cell.
 */
function ProcessSurface({ processId, formStepId, tab, stepId, token, go, navSlot, initialRevision, initialLayout, loadedBaseVersion, loadedCanPublish, navigate, onUnauthorized, onDirtyChange }: ProcessSurfaceProps) {
  const { draft, mutate, validation, replace, contentLocale } = useDraft();
  const baseLocale = draft.baseLocale ?? "en";
  const [saveState, setSaveState] = useState<DraftSaveState>(() => initialSaveState(initialRevision, initialLayout));
  // The canvas selection is a set (design.md). A set of one drives the
  // configuration pane exactly as the single id did; a set of several drives
  // the group summary instead, since the pane edits one step.
  const [selectedStepIds, setSelectedStepIds] = useState<string[]>([]);
  const [selectedPathId, setSelectedPathId] = useState<string | undefined>(undefined);
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
  // The tab that opened the form editor, so leaving it returns there
  // (`studio-forms-overview`, `studio-form-editor`). The editor's address
  // carries no tab of its own, and this surface stays mounted across the
  // move, so the origin lives here rather than in the address.
  const [formOrigin, setFormOrigin] = useState<ProcessTab | undefined>(undefined);
  // The step the Checks tab is narrowed to, set by a Forms card's badge and
  // cleared by the rail's own "show every check" control.
  const [checksStepId, setChecksStepId] = useState<string | undefined>(undefined);
  const openTab = tab ?? DEFAULT_TAB;
  // The Changes count. It is the difference against the base version, which no
  // draft-only expression can produce: it needs a fetch, so the tab reports its
  // own count up. `useCallback`: it is an effect dependency inside the view.
  const [changesCount, setChangesCount] = useState<number | undefined>(undefined);
  const onChangesCount = useCallback((count: number | undefined) => setChangesCount(count), []);
  // The processes a subprocess step may call. One fetch per mount, read by
  // the steps rail's summary line and by the step page's own picker, so the
  // two cannot name one process differently.
  const processes = useFetchOnce(token, listProcesses);
  const fields = draftFields(draft);

  const steps = draft.workflow?.steps ?? [];
  const formStepIndex = formStepId !== undefined ? steps.findIndex((s) => s.id === formStepId) : -1;
  const formStep = formStepIndex >= 0 ? steps[formStepIndex] : undefined;

  // Lifted out of DraftToolbar (design.md: "the header bar reads lifted
  // DraftToolbar state") — DraftToolbar still computes both; only where
  // they live moves up one level, the same way saveState already works.
  const [savedBody, setSavedBody] = useState<Draft>(() => structuredClone(draft));
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);
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
  const dirtyNow = isDirty(draft, savedBody);
  useEffect(() => {
    onDirtyChange?.(dirtyNow);
    return () => onDirtyChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirtyNow]);

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
  const isLayoutPoint = (v: unknown): v is Point =>
    !!v && typeof (v as Point).x === "number" && typeof (v as Point).y === "number";
  const waypoints: Record<string, Point[]> = {};
  const storedWaypoints = saveState.layout.waypoints;
  if (storedWaypoints && typeof storedWaypoints === "object") {
    for (const [pathId, list] of Object.entries(storedWaypoints as Record<string, unknown>)) {
      if (Array.isArray(list) && list.every(isLayoutPoint)) waypoints[pathId] = list;
    }
  }

  // The third reserved key in that blob. An entry that does not parse drops,
  // and so does a member the draft no longer holds: a step delete is an
  // ordinary edit, and it must not strand a box or fail the render.
  const groups: StepGroup[] = [];
  const storedGroups = saveState.layout.groups;
  if (Array.isArray(storedGroups)) {
    for (const entry of storedGroups as unknown[]) {
      const g = entry as Partial<StepGroup>;
      if (!g || typeof g.id !== "string" || typeof g.name !== "string" || !Array.isArray(g.stepIds)) continue;
      const stepIds = g.stepIds.filter((id): id is string => typeof id === "string" && steps.some((s) => s.id === id));
      groups.push({ id: g.id, name: g.name, stepIds, collapsed: g.collapsed === true });
    }
  }

  // One writer for every group edit: create, rename, collapse, expand and
  // ungroup all rewrite the same list, the way `onWaypointsChange` rewrites
  // one path's points.
  const onGroupsChange = (next: StepGroup[]) => {
    setSaveState((s) => ({ ...s, layout: { ...s.layout, groups: next } }));
  };

  const onWaypointsChange = (pathId: string, points: Point[]) => {
    setSaveState((s) => {
      const next = { ...((s.layout.waypoints as Record<string, Point[]> | undefined) ?? {}) };
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
  const onMoveStep = (stepId: string, point: Point) => {
    setSaveState((s) => ({ ...s, layout: { ...s.layout, [stepId]: point } }));
  };

  // Overwrites every step's position at once, unlike onMoveStep's one-step
  // write, and clears every waypoint too (design.md, Decisions 2 and 4).
  // Gated by hasHandPlacedStep, through the browser's own confirm() with a
  // t() string. Publish and Discard no longer share that pattern: each commits
  // an act the developer cannot undo, so each confirms in the application's own
  // modal dialog instead (studio-publish, studio-app). An arrange is a local
  // layout edit the author can undo by moving a step back, and converting it
  // is the named follow-up, not this change.
  const onArrange = () => {
    if (hasHandPlacedStep(steps as LayoutStep[], saveState.layout) && !confirm(t("canvas.arrangeConfirm"))) return;
    const arranged = arrangeSteps(steps as LayoutStep[], groups, draft.workflow?.initialStep, saveState.layout);
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

  // The route's one-shot step target ("Show on the canvas"). Keyed on `stepId`
  // alone, not on mount: the surface stays mounted across a tab switch, so a
  // mount-only read would never fire on this navigation. An unknown id selects
  // nothing, the same rule an unknown tab name already follows. The effect then
  // replaces the address with the plain `edit` route, which opens Canvas — a
  // push here would leave `/edit/step/:stepId` as a live history entry that
  // re-selects the step, and re-pushes itself, on every Back, so Back could
  // never reach the tab the navigation came from (unified-shell's navigation
  // requirement).
  useEffect(() => {
    if (stepId === undefined) return;
    onSelectStep(steps.some((s) => s.id === stepId) ? stepId : undefined);
    navigate({ name: "edit", processId }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepId]);

  // The whole set at once: a shift-click's toggle and a marquee's release. A
  // path belongs to one step, so a set write drops any selected path.
  const onSelectSteps = (stepIds: string[]) => {
    setSelectedStepIds(stepIds);
    setSelectedPathId(undefined);
  };

  // The inspector takes one step. A set of several names none for it, and the
  // group summary stands in (studio-canvas: "It SHALL NOT show the inspector
  // in that state").
  const inspectedStepId = selectedStepIds.length === 1 ? selectedStepIds[0] : undefined;

  // The rail's own order, read three times: for the row list's current mark,
  // for the walk's two ends, and for the step the page falls back to.
  const railOrder = registerOrder(steps, draft.workflow?.initialStep);
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
      label:
        resolveDraftLocalizedText(neighbour.label, contentLocale, baseLocale) || neighbour.key || t("steps.unnamedStep"),
    };
  };

  /** The rail's reorder control. It trades two steps' places in the draft's
   * own `workflow.steps` order — what the canvas's Up/Down traversal and the
   * serialized definition both read. The rail's own order stays derived from
   * the graph, so a reachable step keeps its place there. */
  const onReorderStep = (stepId: string, neighbourId: string) => {
    mutate((d) => {
      const list = d.workflow?.steps;
      if (!list) return;
      const from = list.findIndex((s) => s.id === stepId);
      const to = list.findIndex((s) => s.id === neighbourId);
      if (from < 0 || to < 0) return;
      [list[from], list[to]] = [list[to], list[from]];
    });
  };

  /** The step page's remove control: one step, by id. The canvas keeps its
   * own delete control for a whole selection. A path pointing at a removed
   * step stays as it is, and the checks rail reports it. */
  const onRemoveStep = (stepId: string) => {
    mutate((d) => {
      if (!d.workflow?.steps) return;
      d.workflow.steps = d.workflow.steps.filter((s) => s.id !== stepId);
      if (d.workflow.initialStep === stepId) d.workflow.initialStep = d.workflow.steps[0]?.id;
    });
    if (stepId === inspectedStepId) onSelectStep(undefined);
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

  /** `CanvasPalette.onDragMove`: fired on every pointer move a palette drag
   * makes. An `end` drag resolves to no target — a terminal step never lands
   * inside a path, so nothing may suggest that it does. */
  const onPaletteDragMove = (kind: StepKind, clientX: number, clientY: number) => {
    setInsertTargetPathId(kind === "end" ? undefined : resolveDropPath(clientX, clientY)?.pathId);
  };

  /** Combines the new step's position with clearing the split path's stored
   * waypoints (design.md, Decision "The insert clears that path's
   * waypoints") in the one `saveState.layout` write task 3.5 asks for, rather
   * than two separate `setSaveState` calls. */
  const onInsertLayoutWrite = (stepId: string, point: Point, splitPathId: string) => {
    setSaveState((s) => {
      const nextWaypoints = { ...((s.layout.waypoints as Record<string, Point[]> | undefined) ?? {}) };
      delete nextWaypoints[splitPathId];
      return { ...s, layout: { ...s.layout, [stepId]: point, waypoints: nextWaypoints } };
    });
  };

  /** The one draft-mutation method every step-creating control on this screen
   * shares: the palette's drop, and the steps register's own add control on a
   * draft holding no step (`studio-canvas`'s palette requirement). */
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
   * palette's own drop uses. The new step opens on the page at once
   * (`studio-step-page`). */
  const onAddStep = (kind: StepKind) => {
    const created = newStep(kind, seedLocalizedText(contentLocale));
    appendStep(created);
    if (created.id) onSelectStep(created.id);
  };

  /** The palette's own drag-to-place, through that same creation path. Screen
   * coordinates in, since the palette holds no canvas geometry of its own:
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
  const onPaletteDrop = (kind: StepKind, clientX: number, clientY: number) => {
    setInsertTargetPathId(undefined);
    const target = document.elementFromPoint(clientX, clientY);
    // Resolve through the ribbon's body, not through the SVG under the
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
      onMoveStep(created.id, point);
      onSelectStep(created.id);
    }
  };

  // The save/discard/publish logic itself (design.md: "DraftToolbar keeps
  // its logic. ProcessHeaderBar renders the buttons.") — called directly
  // here, not through a mounted `<DraftToolbar>` element, so this is the
  // only instance of that state. Mounting both would run two independent
  // copies of saving/error/publishing state, the exact "second copy" design.md
  // rejects.
  const actions = useDraftToolbarActions({
    processId,
    token,
    saveState,
    onSaveState: setSaveState,
    savedBody,
    onSavedBodyChange: (body: Draft) => setSavedBody(structuredClone(body)),
    onSaved: () => setLastSavedAt(new Date()),
    publishResult,
    onPublishResult: setPublishResult,
    onDiscarded: () => {
      onDirtyChange?.(false);
      navigate({ name: "processes" });
    },
    onUnauthorized,
    onCanPublishChange: setReloadedCanPublish,
  });

  const counts = processTabCounts(draft, validation.issues, changesCount);
  const goToTab = (target: ProcessTab) => {
    // The narrowing belongs to one visit to the Checks tab. Leaving it drops
    // the filter, so a later press on the Checks control opens the whole list.
    if (target !== "checks") setChecksStepId(undefined);
    navigate({ name: "edit", processId, tab: target });
  };
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

  /** Opens the form editor for one step, remembering the tab it opened from. */
  const openFormEditor = (target: string, from: ProcessTab) => {
    setFormOrigin(from);
    navigate({ name: "edit", processId, formStepId: target });
  };
  const processLabel =
    resolveDraftLocalizedText(draft.label, contentLocale, baseLocale) ?? t("headerBar.unnamedProcess");

  /** One tab body. Every one of the ten renders; nine hide. `hidden` is the
   * mechanism, so a hidden body leaves both the tab order and the
   * accessibility tree while keeping its own state. */
  const tabPanel = (target: ProcessTab, body: ReactNode) => {
    const hide = jsonOpen || target !== openTab;
    return (
      <div
        id={tabPanelDomId(target)}
        role="tabpanel"
        aria-labelledby={tabDomId(target)}
        hidden={hide}
        {...stylex.props(styles.tabBody, hide && styles.tabBodyHidden)}
      >
        {body}
      </div>
    );
  };

  return (
    <main {...stylex.props(styles.studioScreen, styles.studioEditScreen)}>
      <nav {...stylex.props(styles.studioHeaderNav)}>
        <button type="button" className="btn btn-ghost" {...stylex.props(styles.studioBackInNav)} onClick={() => navigate({ name: "processes" })}>
          &larr; Back to processes
        </button>
      </nav>
      {!validation.zodValid && <p {...stylex.props(styles.draftIncomplete)}>{t("app.draftIncomplete")}</p>}
      {/* Renders on both surfaces (studio-json-view: the content-locale
          switcher "SHALL remain visible and usable regardless of which
          surface is active") — only its "Process, saved with the draft" menu
          group is surface-gated, via `structureActive`, since that group's
          controls mutate the draft body. */}
      <ProcessHeaderBar
        revision={saveState.revision}
        isDirty={dirtyNow}
        lastSavedAt={lastSavedAt}
        publishResult={publishResult}
        conflict={saveState.conflict}
        actions={actions}
        structureActive={!jsonOpen}
        processId={processId}
        go={go}
      />
      {/* Checks, Save, Discard draft and Publish stand in the studio's area
          nav (`studio-process-tabs`). That nav renders outside
          `DraftProvider`, so the surface reaches it through the element
          `root.tsx` reserves there rather than by lifting the draft's own
          state out of the provider. */}
      {navSlot !== null &&
        createPortal(
          <DraftNavControls
            processId={processId}
            processLabel={processLabel}
            revision={saveState.revision}
            isDirty={dirtyNow}
            lastSavedAt={lastSavedAt}
            validation={validation}
            canPublish={canPublish}
            baseVersion={changesBaseVersion}
            actions={actions}
            onOpenChecks={() => goToTab("checks")}
          />,
          navSlot,
        )}
      {formStepId !== undefined ? (
        formStep ? (
          <FormEditorScreen
            step={formStep}
            index={formStepIndex}
            fields={fields}
            onBack={() => goToTab(formEditorReturnTab(formOrigin))}
          />
        ) : (
          <div {...stylex.props(styles.errorBanner, styles.errorBannerInEditScreen)} role="alert">
            <span {...stylex.props(styles.errorBannerStamp)}>{t("error.failed")}</span>
            <span {...stylex.props(styles.errorBannerMessage)}>{t("formEditor.stepNotFound")}</span>
          </div>
        )
      ) : (
        <div {...stylex.props(styles.surface)}>
          <ProcessTabRow
            open={openTab}
            counts={counts}
            onOpen={goToTab}
            jsonOpen={jsonOpen}
            onToggleJson={() => setJsonOpen((open) => !open)}
            onVersions={() => navigate({ name: "versions", processId })}
            onPlayer={() => navigate({ name: "play", processId })}
          />
          {/* The JSON surface stands in place of every tab body, never beside
              one: no draft-body-writing control may stay reachable while it is
              open (`studio-json-view`). The ten bodies below stay mounted and
              hidden, and a `hidden` subtree reaches neither the tab order nor
              the accessibility tree. */}
          {jsonOpen && <JsonView draft={draft} onApply={replace} />}

          {tabPanel(
            "canvas",
            <>
              {/* The canvas alone, filling the tab body. No bar and no band
                  stand over it, and no control changes its height
                  (`studio-canvas`). */}
              <div id={CANVAS_BODY_ID} {...stylex.props(styles.canvasRegion)}>
                <CanvasPalette onDrop={onPaletteDrop} onDragMove={onPaletteDragMove} />
                <CanvasView
                  layout={saveState.layout}
                  onMoveStep={onMoveStep}
                  onArrange={onArrange}
                  selectedStepIds={selectedStepIds}
                  onSelectStep={onSelectStep}
                  onSelectSteps={onSelectSteps}
                  onOpenStepPage={() => goToTab("steps")}
                  selectedPathId={selectedPathId}
                  edgeStyle={edgeStyle}
                  onEdgeStyleChange={onEdgeStyleChange}
                  waypoints={waypoints}
                  onWaypointsChange={onWaypointsChange}
                  groups={groups}
                  onGroupsChange={onGroupsChange}
                  insertTargetPathId={insertTargetPathId}
                  visible={!jsonOpen && openTab === "canvas"}
                />
              </div>
              {/* A set of several steps names no one step, so the canvas keeps
                  the selection count, the delete control and the group
                  controls for it (`studio-canvas`). */}
              {selectedStepIds.length > 1 && (
                <aside {...stylex.props(styles.canvasInspector, styles.canvasSelection)}>
                  <div {...stylex.props(styles.canvasSelectionHeading)}>
                    <span className="canvas-selection-label">{t("canvas.selectionHeading")}</span>
                    <span {...stylex.props(styles.canvasSelectionCount)}>{selectedStepIds.length}</span>
                  </div>
                  <button type="button" className="btn btn-secondary" onClick={deleteSelection}>
                    {t("canvas.selectionRemove")}
                  </button>
                  {/* One selection, three states: a set no group holds offers
                      grouping, a set that IS a group offers that group's own
                      controls, and a set spanning a group's members and
                      others offers neither. The canvas keeps no group
                      selection of its own (design.md). */}
                  {(() => {
                    const matched = groupMatching(selectedStepIds, groups);
                    if (matched) {
                      return (
                        <>
                          <label {...stylex.props(styles.canvasGroupNameField)}>
                            {t("canvas.groupName")}
                            <input
                              value={matched.name}
                              onChange={(e) =>
                                onGroupsChange(groups.map((g) => (g.id === matched.id ? { ...g, name: e.target.value } : g)))
                              }
                            />
                          </label>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            // The same attribute the canvas box's own
                            // disclosure carries. Both write this one
                            // `collapsed` flag, so neither may report it as a
                            // pressed state instead. `aria-controls` names the
                            // members `<g>`, and only where the box draws:
                            // below two members `drawnBox` returns nothing and
                            // no wrapper exists to name. A step delete can
                            // leave a group at one member.
                            aria-expanded={matched.collapsed !== true}
                            aria-controls={matched.stepIds.length > 1 ? groupMembersDomId(matched.id) : undefined}
                            onClick={() =>
                              onGroupsChange(
                                groups.map((g) => (g.id === matched.id ? { ...g, collapsed: !g.collapsed } : g)),
                              )
                            }
                          >
                            {matched.collapsed ? t("canvas.groupExpand") : t("canvas.groupCollapse")}
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => onGroupsChange(groups.filter((g) => g.id !== matched.id))}
                          >
                            {t("canvas.groupUngroup")}
                          </button>
                        </>
                      );
                    }
                    if (!canGroup(selectedStepIds, groups)) return null;
                    return (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() =>
                          onGroupsChange([
                            ...groups,
                            { id: `grp_${crypto.randomUUID()}`, stepIds: [...selectedStepIds], name: t("canvas.groupDefaultName") },
                          ])
                        }
                      >
                        {t("canvas.groupCreate")}
                      </button>
                    );
                  })()}
                </aside>
              )}
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
                onReorder={onReorderStep}
                onAddStep={onAddStep}
                processes={processes ?? []}
              />
              <StepPage
                fields={fields}
                token={token}
                step={pageStep}
                stepNumber={pageIndex + 1}
                previous={walkNeighbour(pageIndex - 1)}
                next={walkNeighbour(pageIndex + 1)}
                onSelectStep={(target) => onSelectStep(target)}
                onRemoveStep={onRemoveStep}
                selectedPathId={selectedPathId}
                navigate={(target) => openFormEditor(target, "steps")}
                processes={processes ?? []}
              />
            </div>,
          )}

          {tabPanel(
            "fields",
            <FieldsTab token={token} onShowStep={(target) => navigate({ name: "edit", processId, stepId: target })} />,
          )}
          {tabPanel("dataSources", <DataSourcesTab token={token} />)}
          {tabPanel("paths", <PathsView draft={draft} contentLocale={contentLocale} />)}
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
          {tabPanel("matrix", <FieldMatrixPanel />)}
          {tabPanel("contract", <ContractPanel />)}
          {tabPanel(
            "changes",
            <ChangesView
              processId={processId}
              token={token}
              draft={draft}
              baseVersion={changesBaseVersion}
              onCount={onChangesCount}
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
              onOpenIssue={(issue) => goToTab(tabForIssue(issue.entityType))}
            />,
          )}
        </div>
      )}
    </main>
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

export function EditScreen({ processId, formStepId, tab, stepId, token, go, navSlot, navigate, onUnauthorized, onDirtyChange }: EditScreenProps) {
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
        <button type="button" className="btn btn-ghost" {...stylex.props(styles.studioBack)} onClick={() => navigate({ name: "processes" })}>
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
        <button type="button" className="btn btn-ghost" {...stylex.props(styles.studioBack)} onClick={() => navigate({ name: "processes" })}>
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
        stepId={stepId}
        token={token}
        go={go}
        navSlot={navSlot}
        initialRevision={state.record.revision}
        initialLayout={state.record.layout}
        loadedBaseVersion={state.record.baseVersion}
        loadedCanPublish={state.record.canPublish}
        navigate={navigate}
        onUnauthorized={onUnauthorized}
        onDirtyChange={onDirtyChange}
      />
    </DraftProvider>
  );
}
