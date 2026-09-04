import { useCallback, useEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import { DraftProvider, useDraft } from "../draft/store.js";
import { draftFields } from "../draft/fields.js";
import type { Draft } from "../draft/types.js";
import { t } from "../catalog.js";
import { StepsPanel } from "../panels/StepsPanel.js";
import { PanelsScreen } from "./PanelsScreen.js";
import { useDraftToolbarActions } from "../panels/DraftToolbar.js";
import { ProcessHeaderBar } from "../panels/ProcessHeaderBar.js";
import { ChecksRail } from "../panels/ChecksRail.js";
import { seedLocalizedText } from "../draft/localized-text";
import { getDraft } from "../api/client.js";
import type { DraftRecord, PublishResult } from "../api/types.js";
import type { Route, PanelView } from "../routing.js";
import { initialSaveState, type DraftSaveState } from "./draftSaveLogic.js";
import { isDirty } from "./draftToolbarState.js";
import { CanvasView, groupMembersDomId } from "../canvas/CanvasView.js";
import { EditRail } from "../canvas/EditRail.js";
import { snapToGrid, svgPointFromClient, DEFAULT_EDGE_STYLE, type Point, type EdgeStyle } from "../canvas/geometry.js";
import { canGroup, groupMatching, type StepGroup } from "../canvas/groups.js";
import { arrangeSteps, hasHandPlacedStep } from "../canvas/arrange.js";
import type { LayoutStep } from "../canvas/layout.js";
import { newStep, type StepKind } from "../draft/createStep.js";
import { addToDraftArray } from "../draft/draft-array-crud.js";
import { insertOnPath } from "../draft/insertOnPath.js";
import { JsonView } from "../panels/JsonView.js";
import { EditorDock, type DockTab } from "../dock/EditorDock.js";
import { describeCaughtError } from "../errors.js";
import { useFail } from "../../../shell/useFail.js";
import { FormEditorScreen } from "./FormEditorScreen.js";
import type { NavigateOptions } from "../../../shell/routing.js";

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
  studioEditScreen: {
    maxWidth: "none",
    display: "flex",
    flex: "1 1 auto",
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
    border: `2px solid ${colors.refusal}`,
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
    border: "2px solid currentcolor",
    paddingBlock: 2,
    paddingInline: 7,
    transform: "rotate(-2deg)",
  },
  errorBannerMessage: {
    flex: 1,
    color: colors.text,
  },
  studioSurfaceToggle: {
    display: "flex",
    gap: space.s2,
    marginBottom: space.s3,
  },
  // `button[aria-selected="true"]`: a JS-computed choice reading the same
  // `aria-selected` the tab already carries.
  surfaceToggleTabSelected: {
    fontWeight: 600,
    textDecoration: "underline",
  },
  studioCanvasLayout: {
    display: "grid",
    flex: "1 1 auto",
    gridTemplateColumns: "12rem minmax(0, 1fr) 22rem",
    gap: space.s3,
    alignItems: "stretch",
    minHeight: "36rem",
  },
  canvasInspector: {
    minWidth: 0,
    overflowY: "auto",
    border: `1px solid ${colors.border}`,
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
  // `.canvas-selection .studio-checks-rail-docked`: `ChecksRail`'s own root
  // no longer carries a literal class this descendant selector can reach,
  // so this screen wraps that one call site instead (the same pattern
  // `PanelsScreen.tsx` uses for its own `ChecksRail` mount, Group 6).
  canvasSelectionChecksRail: {
    width: "100%",
    marginTop: "auto",
  },
});

interface EditScreenProps {
  processId: string;
  /** The `edit` route's optional sub-states. `formStepId` and `panel` each
   * render in place of the canvas and inspector: the form editor for a step,
   * or the panels screen at a view. The form editor wins when both arrive,
   * which `routePath` already encodes. `stepId` is a one-shot canvas target
   * ("Show on the canvas") — it never replaces the canvas, and `EditorArea`
   * clears it from the address once read (task 6.2, `unified-shell`'s
   * navigation requirement). */
  formStepId?: string;
  panel?: PanelView;
  stepId?: string;
  token: string;
  /** Cross-area navigation, threaded down to `ProcessHeaderBar`'s "Manage
   * assignment groups for this process" link (design.md: "Threading `go`
   * down to the link"). `token`, `navigate`, and `onUnauthorized` already
   * take the same shape through this chain. */
  go: (href: string, opts?: NavigateOptions) => void;
  navigate: (route: Route, opts?: NavigateOptions) => void;
  onUnauthorized: () => void;
  /** Reports the open draft's dirty state upward, so `root.tsx` can guard
   * navigation away from it (design.md: "Report dirtiness upward through one
   * callback prop into a ref"). */
  onDirtyChange?: (dirty: boolean) => void;
}

interface EditorAreaProps {
  processId: string;
  formStepId?: string;
  panel?: PanelView;
  stepId?: string;
  token: string;
  go: (href: string, opts?: NavigateOptions) => void;
  initialRevision: number;
  initialLayout: Record<string, unknown>;
  /** The published version this draft sits on, for the dock's Changes tab.
   * Not `initialBaseVersion`: `initialRevision` and `initialLayout` seed a
   * useState, and this one seeds nothing. `EditScreen` never refreshes the
   * loaded record — `load` depends on processId/token/onUnauthorized alone —
   * so a publish moves the real base version without moving this prop.
   * `EditorArea` folds `publishResult.version` over it instead. */
  loadedBaseVersion: number | null;
  /** The loaded draft's `canPublish` report, for the same reason and by the
   * same route: `load` never re-runs, and an administrator can grant or
   * withdraw the permission while this screen sits open. `EditorArea` folds
   * whatever `reload()` re-read over it. It deliberately does NOT join
   * `DraftSaveState`, whose exact shape `studio-draftSaveLogic.test.ts` pins
   * with `toEqual`. */
  loadedCanPublish: boolean;
  navigate: (route: Route, opts?: NavigateOptions) => void;
  onUnauthorized: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

/** Rendered inside DraftProvider, so it can read/replace the Draft via
 * useDraft() — and pass that access down to every panel it mounts, `EditRail`
 * and `StepsPanel` included. `useDraftToolbarActions` (below) is the one
 * remaining direct consumer of `DraftToolbarProps`; `DraftToolbar` itself no
 * longer mounts here (design.md: "DraftToolbar keeps its logic.
 * ProcessHeaderBar renders the buttons."). */
function EditorArea({ processId, formStepId, panel, stepId, token, go, initialRevision, initialLayout, loadedBaseVersion, loadedCanPublish, navigate, onUnauthorized, onDirtyChange }: EditorAreaProps) {
  const { draft, mutate, validation, replace, contentLocale } = useDraft();
  const baseLocale = draft.baseLocale ?? "en";
  const [saveState, setSaveState] = useState<DraftSaveState>(() => initialSaveState(initialRevision, initialLayout));
  // The canvas selection is a set (design.md). A set of one drives the
  // inspector exactly as the single id did; a set of several drives the group
  // summary instead, since the inspector edits one step.
  const [selectedStepIds, setSelectedStepIds] = useState<string[]>([]);
  const [selectedPathId, setSelectedPathId] = useState<string | undefined>(undefined);
  // The path an edit-rail drag currently sits over, resolved the same way the
  // drop itself resolves one (design.md: "The rail reports its moving
  // position"). Drives the drop-target render in `CanvasView`; not the
  // selection, which the drag never touches until release.
  const [insertTargetPathId, setInsertTargetPathId] = useState<string | undefined>(undefined);
  const [surface, setSurface] = useState<"structure" | "json">("structure");
  // The dock persists nothing. Component state, so both survive a canvas
  // selection and a trip to the panels screen (this component stays mounted
  // across the ladder), and a reload returns the dock to collapsed. Neither
  // goes into `saveState.layout`: that blob is per-draft, so one author's
  // open dock would open for every author of the draft.
  const [dockOpen, setDockOpen] = useState(false);
  const [dockTab, setDockTab] = useState<DockTab>("changes");
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
  const dockBaseVersion = publishResult?.version ?? loadedBaseVersion;
  // Folded exactly like `dockBaseVersion` above: the loaded prop underneath,
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

  // The route's one-shot step target ("Show on the canvas", task 6.2). Keyed
  // on `stepId` alone, not on mount: `EditorArea` stays mounted across a trip
  // to the panels screen and back (the same routing decision
  // `panels-list-and-detail` made), so a mount-only read would never fire on
  // this navigation. An unknown id selects nothing, the same rule an unknown
  // view already follows. The effect then replaces the address with the
  // plain `edit` route — a push here would leave `/edit/step/:stepId` as a
  // live history entry that re-selects the step, and re-pushes itself, on
  // every Back, so Back could never reach the panels screen the navigation
  // came from (unified-shell's navigation requirement).
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

  /** Deletes every step in the set, the way `StepsPanel.removeStep` deletes
   * one. A path pointing at a deleted step stays as it is; the single delete
   * leaves one the same way, and the checks rail reports it. */
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

  /** `EditRail.onDragMove` (task 4.1): fired on every pointer move a rail drag
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

  /** The rail's own drag-to-place (task 2.3), through the same `newStep`/
   * `addToDraftArray` creation path every step-creating control in this
   * screen shares. Screen coordinates in, since `EditRail` holds no canvas
   * geometry of its own: `elementFromPoint` finds the live `.canvas-svg`
   * element (or none, when the drop misses the canvas), and
   * `svgPointFromClient` converts through its current pan/zoom transform —
   * the same conversion `CanvasView`'s own node/handle drags use.
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
    // Resolve through `.canvas-wrap`, not through the SVG under the pointer.
    // Panzoom scales the SVG element itself, so a zoomed-out canvas leaves
    // most of the wrap outside the SVG's own box, while the wrap still paints
    // the grid and still shows the graph. Every point the author reads as
    // canvas therefore places a step. `svgPointFromClient` maps a point
    // outside the box just as well: an inverse CTM is a linear map, not a
    // bounded one.
    const svg =
      target?.closest(".canvas-wrap")?.querySelector<SVGSVGElement>("svg.canvas-svg") ??
      target?.closest<SVGSVGElement>("svg.canvas-svg");
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

  return (
    <main {...stylex.props(styles.studioScreen, styles.studioEditScreen)}>
      <nav {...stylex.props(styles.studioHeaderNav)}>
        <button type="button" className="btn btn-ghost" {...stylex.props(styles.studioBackInNav)} onClick={() => navigate({ name: "processes" })}>
          ← Back to processes
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          {...stylex.props(styles.studioBackInNav)}
          onClick={() => navigate({ name: "versions", processId })}
        >
          Versions
        </button>
        <button type="button" className="btn btn-ghost" {...stylex.props(styles.studioBackInNav)} onClick={() => navigate({ name: "play", processId })}>
          Player
        </button>
      </nav>
      {!validation.zodValid && <p {...stylex.props(styles.draftIncomplete)}>{t("app.draftIncomplete")}</p>}
      {/* Renders on both surfaces (studio-json-view: DraftToolbar and the
          content-locale switcher "SHALL remain visible and usable
          regardless of which surface is active") — only its "Process, saved
          with the draft" menu group is surface-gated, via `structureActive`,
          since that group's controls mutate the draft body the same way the
          old Structure-only ProcessHeader did. */}
      <ProcessHeaderBar
        revision={saveState.revision}
        isDirty={dirtyNow}
        lastSavedAt={lastSavedAt}
        publishResult={publishResult}
        conflict={saveState.conflict}
        actions={actions}
        structureActive={surface === "structure"}
        processId={processId}
        canPublish={canPublish}
        baseVersion={dockBaseVersion}
        go={go}
        surfaceToggle={
          <div {...stylex.props(styles.studioSurfaceToggle)} role="tablist">
            <button
              type="button"
              role="tab"
              {...stylex.props(surface === "structure" && styles.surfaceToggleTabSelected)}
              aria-selected={surface === "structure"}
              onClick={() => setSurface("structure")}
            >
              {t("edit.structureTab")}
            </button>
            <button
              type="button"
              role="tab"
              {...stylex.props(surface === "json" && styles.surfaceToggleTabSelected)}
              aria-selected={surface === "json"}
              onClick={() => setSurface("json")}
            >
              {t("edit.jsonTab")}
            </button>
          </div>
        }
      />
      {surface === "structure" ? (
        <>
          {panel !== undefined ? (
            <PanelsScreen
              openView={panel}
              onBack={() => navigate({ name: "edit", processId })}
              onOpenView={(view) => navigate({ name: "edit", processId, panel: view })}
              onShowStep={(targetStepId) => navigate({ name: "edit", processId, stepId: targetStepId })}
              token={token}
              canPublish={canPublish}
            />
          ) : formStepId !== undefined ? (
            formStep ? (
              <FormEditorScreen
                step={formStep}
                index={formStepIndex}
                fields={fields}
                onBack={() => navigate({ name: "edit", processId })}
              />
            ) : (
              <div {...stylex.props(styles.errorBanner, styles.errorBannerInEditScreen)} role="alert">
                <span {...stylex.props(styles.errorBannerStamp)}>{t("error.failed")}</span>
                <span {...stylex.props(styles.errorBannerMessage)}>{t("formEditor.stepNotFound")}</span>
              </div>
            )
          ) : (
            <>
            <div {...stylex.props(styles.studioCanvasLayout)}>
              <EditRail
                onDrop={onPaletteDrop}
                onDragMove={onPaletteDragMove}
                onOpenPanel={(view) => navigate({ name: "edit", processId, panel: view })}
              />
              <CanvasView
                layout={saveState.layout}
                onMoveStep={onMoveStep}
                onArrange={onArrange}
                selectedStepIds={selectedStepIds}
                onSelectStep={onSelectStep}
                onSelectSteps={onSelectSteps}
                selectedPathId={selectedPathId}
                edgeStyle={edgeStyle}
                onEdgeStyleChange={onEdgeStyleChange}
                waypoints={waypoints}
                onWaypointsChange={onWaypointsChange}
                groups={groups}
                onGroupsChange={onGroupsChange}
                insertTargetPathId={insertTargetPathId}
              />
              {/* The third column has three states (studio-canvas). Nothing
                  selected shows the full checks rail. One step or a path
                  shows the inspector. Several steps show the group summary,
                  since the inspector edits one step and a set of several
                  names none for it. The inspector and the summary each dock
                  their own collapsed `ChecksRail`; this column never mounts a
                  second copy beside one of them. */}
              {selectedStepIds.length > 1 ? (
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
                  <div {...stylex.props(styles.canvasSelectionChecksRail)}>
                    <ChecksRail validation={validation} canPublish={canPublish} collapsed />
                  </div>
                </aside>
              ) : inspectedStepId !== undefined || selectedPathId !== undefined ? (
                <aside {...stylex.props(styles.canvasInspector)}>
                  <StepsPanel
                    fields={fields}
                    token={token}
                    selectedStepId={inspectedStepId}
                    onSelectStep={onSelectStep}
                    selectedPathId={selectedPathId}
                    navigate={(stepId) => navigate({ name: "edit", processId, formStepId: stepId })}
                    canPublish={canPublish}
                  />
                </aside>
              ) : (
                <ChecksRail validation={validation} canPublish={canPublish} />
              )}
            </div>
            {/* The dock is a flex SIBLING of the grid, not a fourth grid
              * child: `.studio-canvas-layout`'s template is a strict three
              * columns, so a fourth child would land in an implicit fourth
              * one. `.studio-edit-screen` is already a flex column, and the
              * grid inside it carries `flex: 1 1 auto` with `min-height:
              * 36rem`, so the grid yields its height to the dock down to that
              * floor and the page scrolls past it. Item 1 built that pair. */}
            <EditorDock
              processId={processId}
              token={token}
              draft={draft}
              contentLocale={contentLocale}
              baseVersion={dockBaseVersion}
              open={dockOpen}
              onOpenChange={setDockOpen}
              tab={dockTab}
              onTabChange={setDockTab}
            />
            </>
          )}
        </>
      ) : (
        <JsonView draft={draft} onApply={replace} />
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

export function EditScreen({ processId, formStepId, panel, stepId, token, go, navigate, onUnauthorized, onDirtyChange }: EditScreenProps) {
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
      <EditorArea
        processId={processId}
        formStepId={formStepId}
        panel={panel}
        stepId={stepId}
        token={token}
        go={go}
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
