import { useLayoutEffect, useMemo, useRef, useState } from "react";
import Panzoom, { type PanzoomObject } from "@panzoom/panzoom";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useDraft } from "../draft/store";
import { updateInDraftArray } from "../draft/draft-array-crud";
import { newStep } from "../draft/createStep";
import { newPath } from "../draft/createPath";
import { seedLocalizedText, resolveDraftLocalizedText } from "../draft/localized-text";
import { t } from "../catalog.js";
import { autoPlaceSteps, type LayoutStep } from "./layout";
import {
  dragDelta,
  exceedsClickThreshold,
  snapToGrid,
  svgPointFromClient,
  routeThroughWaypoints,
  legOfSegment,
  routePath,
  midpointOfRoute,
  segmentLength,
  GRID_STEP,
  NODE_WIDTH,
  NODE_HEIGHT,
  type Point,
  type NodePosition,
  type EdgeStyle,
} from "./geometry";
import { toggleSelection, normalizeRect, nodesInRect } from "./selection";
import { drawnBox, hiddenStepIds, anchorBoxFor, type StepGroup } from "./groups";
import { computeFit, MIN_SCALE, MAX_SCALE, FIT_GUTTER, type Fit } from "./fit";
import { resolveDropGesture } from "./dropGesture";
import { inlineRenamePatch } from "./inlineRename";
import { nextFocus, entryFocus, type ArrowKey, type Focus } from "./traversal";
import { nextStepKey } from "../panels/stepsPanelLogic.js";
import { buildOperands, guardEdgeLabel } from "../panels/shared/conditionLogic";

const HANDLE_RADIUS = 7;
/** The waypoint handle's side. A square, not a circle: the canvas already has
 * one control shape, and the connect handle owns it (design.md). */
const WAYPOINT_HANDLE = 10;
const REJECT_MESSAGE_MS = 4000;
/** The disclosure button's side, in user units. It sits inside the group's own
 * 20-unit margin, so no member node reaches it. */
const DISCLOSURE_SIZE = 20;
/** How far the button's focus indicator reaches past its own border box. The
 * shell's `:focus-visible` token paints a 2px outline at a 2px offset, so the
 * indicator occupies from 2 to 4 units beyond that box on every side. */
const DISCLOSURE_OUTLINE_CLEARANCE = 4;
/** The `<foreignObject>` that hosts the button: the button plus that clearance
 * on each side. A host cut to the button's own size clips the outline away
 * whole, because `<foreignObject>` clips to its rect and an outline paints
 * outside the border box. */
const DISCLOSURE_HOST = DISCLOSURE_SIZE + 2 * DISCLOSURE_OUTLINE_CLEARANCE;
/** How far the focus ring stands outside the node on each side. Its 2px stroke
 * paints centered on that edge, so the gap reads 2px. */
const FOCUS_RING_OFFSET = 3;
const ARROW_KEYS: ArrowKey[] = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];

/** The `<g>` holding a drawn group's member nodes. Both disclosure controls —
 * the canvas's own and the selection toolbar's — name it in `aria-controls`,
 * so the id lives here rather than in either caller. */
export function groupMembersDomId(groupId: string): string {
  return `canvas-group-members-${groupId}`;
}

interface Props {
  layout: Record<string, unknown>;
  onMoveStep: (stepId: string, point: Point) => void;
  /** Overwrites every step's position at once and clears every waypoint,
   * behind its own confirm gate (design.md, Decisions 2, 4 and 5). */
  onArrange: () => void;
  /** The selection is a set, not one id (design.md): it is the interaction
   * state stages 30 to 34 build on, and multi-move and multi-delete come with
   * it. A set of one behaves exactly as the single selection did. */
  selectedStepIds: string[];
  /** The second argument carries the clicked path's id (task 3.13),
   * `undefined` for a node click or a deselect — `PathsPanel` uses it to
   * highlight one row rather than only expanding its section. Writes a set of
   * one, or an empty one. */
  onSelectStep: (stepId: string | undefined, pathId?: string) => void;
  /** The whole set at once: a shift-click's toggle and a marquee's release. */
  onSelectSteps: (stepIds: string[]) => void;
  /** Canvas-wide, never per path (design.md). `EditScreen` resolves an absent
   * or unknown stored value to the default before it reaches here. */
  edgeStyle: EdgeStyle;
  onEdgeStyleChange: (style: EdgeStyle) => void;
  selectedPathId?: string;
  /** Per path id, in the same opaque `layout` blob as node positions. An
   * absent or malformed entry reads as no waypoints (design.md). */
  waypoints: Record<string, Point[]>;
  onWaypointsChange: (pathId: string, points: Point[]) => void;
  /** Presentation only, in the same `layout` blob (design.md). A group never
   * reaches `ProcessBody`, so the engine cannot see one. */
  groups: StepGroup[];
  /** The one writer for every group edit. A box's own disclosure button flips
   * `collapsed` through it, the way the selection toolbar's collapse control
   * already does. */
  onGroupsChange: (groups: StepGroup[]) => void;
  /** The path under the pointer during an edit-rail drag (design.md: "The
   * rail reports its moving position"), or `undefined` outside a drag or
   * over an `end` step. Drawn as the drop-target state on the matching edge
   * group and its guard label; adds no permanent control. */
  insertTargetPathId?: string;
}

function isPoint(value: unknown): value is Point {
  return !!value && typeof (value as Point).x === "number" && typeof (value as Point).y === "number";
}

/** The guard-then-merge shape every `on*PointerMove` handler below repeats:
 * bail when no drag of that kind is active, otherwise merge the
 * caller-computed patch into it. Node, group, waypoint and connect-drag
 * callers merge a fresh `toSvgPoint(e)`; the marquee merges the raw client
 * point into its own `currentClient` field instead (design.md - Decisions).
 * The helper computes neither: each caller passes its own patch, so this
 * never assumes a field name or a coordinate space. */
function trackPointer<T extends object>(drag: T | null, setDrag: (next: T) => void, patch: Partial<T>): void {
  if (!drag) return;
  setDrag({ ...drag, ...patch });
}

/**
 * Interactive, hand-rolled SVG canvas (design.md: not Mermaid, not a graph
 * library). Node position writes to `saveState.layout` via `onMoveStep`
 * (not the Draft model); path creation writes through `useDraft()`/
 * `mutate()`, the same surface `PathsPanel`'s "add path" action uses.
 */
export function CanvasView({
  layout,
  onMoveStep,
  onArrange,
  selectedStepIds,
  onSelectStep,
  onSelectSteps,
  selectedPathId,
  edgeStyle,
  onEdgeStyleChange,
  waypoints,
  onWaypointsChange,
  groups,
  onGroupsChange,
  insertTargetPathId,
}: Props) {
  const { draft, mutate, contentLocale, loadedChildren } = useDraft();
  const steps = draft.workflow?.steps ?? [];
  const initialStepId = draft.workflow?.initialStep;
  const baseLocale = draft.baseLocale ?? "en";

  const svgRef = useRef<SVGSVGElement | null>(null);
  const panzoomRef = useRef<PanzoomObject | null>(null);
  // The toolbar overlays the canvas, so `fitToView` measures it rather than
  // framing content underneath it.
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  // Latches after the first successful auto-fit so the view then stays under
  // the author's own pan/zoom. A ref, not a `[]` effect dep: a brand-new
  // draft mounts with zero steps, and `nodePositions` only turns non-empty
  // once the first step lands.
  const hasFitOnLoad = useRef(false);

  // Shared by the initial `Panzoom()` construction below and by `fitToView`
  // itself: both need the same scale/pan for the same content, measured the
  // same way.
  const measureFit = (svg: SVGSVGElement): Fit => {
    // `getBBox()` reports what the canvas actually draws, in user space and
    // free of Panzoom's transform. That covers the start arrow and start
    // stamp beside the initial step, and the terminal stamp above a
    // terminal step — none of which the node rectangles contain.
    const content = svg.getBBox();

    // `clientWidth`/`clientHeight`, never `getBoundingClientRect()`: Panzoom
    // transforms this same element, so a client rect shrinks with the zoom
    // and a second fit would frame a smaller canvas than the first.
    //
    // Two properties of `.canvas-svg` and `.canvas-wrap` make these two the
    // right reading, and a change to either would break this silently:
    //   - `.canvas-wrap` is `overflow: hidden`. A transform can otherwise
    //     grow an ancestor's scrollable overflow, and a classic scrollbar
    //     appearing re-lays out a `width: 100%` child, which would feed the
    //     zoom back into the measurement after all.
    //   - `.canvas-svg` carries no padding. `clientWidth` is the padding box,
    //     while an SVG with no `viewBox` anchors user space to the content
    //     box; padding would offset the origin and overstate the viewport.
    // Both round to whole pixels, so the framing can sit up to a pixel off.
    // The gutter is 16px, so that is not visible.
    const element = { width: svg.clientWidth, height: svg.clientHeight };

    // The toolbar sits over the top left corner. `offsetTop`/`offsetHeight`
    // are layout values against `.canvas-wrap`, the same origin the SVG box
    // starts from, and no transform touches them.
    //
    // Read the bottom edge, not the height: the toolbar starts `--space-2`
    // below the canvas top, and clearing the height alone leaves it
    // overlapping by those 8px. Measuring the container rather than the
    // button also covers a second control, which belongs in this same flex
    // row.
    const toolbar = toolbarRef.current;
    const toolbarBottom = toolbar ? toolbar.offsetTop + toolbar.offsetHeight : 0;

    return computeFit(content, element, { top: toolbarBottom + FIT_GUTTER, right: FIT_GUTTER, bottom: FIT_GUTTER, left: FIT_GUTTER });
  };

  // Layout, not passive: the auto-fit effect below reads `panzoomRef` and
  // must find it already set. React always runs every layout effect before
  // any passive effect on mount, so that ordering holds only because this
  // effect is a layout effect too — a passive one here would still run
  // after the auto-fit effect's own useLayoutEffect and leave it reading a
  // null ref on the one render that matters.
  useLayoutEffect(() => {
    if (!svgRef.current) return;
    const el = svgRef.current;
    const wrap = el.parentElement;
    // Panzoom's own down-handler binds to `.canvas-wrap` (`canvas: true`),
    // not to `el`: a non-identity transform moves `el`'s own hit-testable
    // box away from the visible canvas, while `.canvas-wrap` never
    // transforms and always covers it (design.md - Decisions). Native
    // addEventListener there runs and calls stopPropagation() *before*
    // React's synthetic event system — bound higher up the tree — ever sees
    // the event, so a React-level e.stopPropagation() inside a node/handle
    // handler is too late to stop it. `panzoom-exclude` (its own default
    // exclude class) is the sanctioned way to opt an element out of
    // Panzoom's own handling instead — every node and edge group carries
    // it, and so does `.canvas-toolbar` now that `.canvas-wrap` is its
    // ancestor too. A future control added over the canvas needs the same
    // class, plus the wheel guard's own exclusion below.
    //
    // Panzoom's own constructor applies `startScale` synchronously but
    // defers `pan(startX, startY)` to a `setTimeout` (its own source: it
    // waits a tick so `zoom` has settled before it reads dimensions to
    // constrain the initial pan). Left at the (0, 0) default, that deferred
    // call would land after the auto-fit effect below has already panned
    // the just-mounted graph into view, and silently reset it back to the
    // top-left corner one tick later. Feeding the same fit in as the start
    // position closes the race instead of trying to out-time it: the
    // deferred call still fires, but lands on the values already showing.
    const initialFit = measureFit(el);
    const panzoom = Panzoom(el, {
      minScale: MIN_SCALE,
      maxScale: MAX_SCALE,
      canvas: true,
      startScale: initialFit.scale,
      startX: initialFit.x,
      startY: initialFit.y,
    });
    panzoomRef.current = panzoom;
    // The manual `wheel` listener binds to the same `.canvas-wrap` element,
    // for the same reason. `zoomWithWheel` carries no `panzoom-exclude`
    // check of its own, so the toolbar needs an explicit guard here — the
    // toolbar's own ref, not a general `.closest(".panzoom-exclude")` walk,
    // since every node and edge already carries that class and already
    // receives wheel-zoom today (stylex-phase-4-canvas design.md D2).
    const onWheel = (e: WheelEvent) => {
      if (toolbarRef.current?.contains(e.target as Node)) return;
      panzoom.zoomWithWheel(e);
    };
    wrap?.addEventListener("wheel", onWheel);

    // The painted grid lives on `.canvas-wrap`, which Panzoom never
    // transforms, so it has to be told what the transform is. Without this a
    // node rounded to the lattice meets the drawn dots at scale 1 and pan 0
    // alone, and an author works at the fit scale, which is rarely 1.
    //
    // Two custom properties, read by the stylesheet: the gradient and its
    // colour role stay in CSS, and this hands over two numbers. Reading the
    // event's own `detail` rather than parsing the element's transform back
    // keeps this off the layout path.
    const paintGrid = (scale: number, x: number, y: number) => {
      if (!wrap) return;
      wrap.style.setProperty("--canvas-grid-size", `${GRID_STEP * scale}px`);
      wrap.style.setProperty("--canvas-grid-offset-x", `${x * scale}px`);
      wrap.style.setProperty("--canvas-grid-offset-y", `${y * scale}px`);
    };
    const onPanzoomChange = (e: Event) => {
      const d = (e as CustomEvent<{ scale: number; x: number; y: number }>).detail;
      paintGrid(d.scale, d.x, d.y);
    };
    el.addEventListener("panzoomchange", onPanzoomChange);
    // Seeded from the fit above, so the grid is right before the first gesture
    // rather than one event later.
    paintGrid(initialFit.scale, initialFit.x, initialFit.y);

    return () => {
      wrap?.removeEventListener("wheel", onWheel);
      el.removeEventListener("panzoomchange", onPanzoomChange);
      panzoom.destroy();
      panzoomRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Neither computation reads pointer/drag state, so without memoization
  // both re-run on every pointer-move event during a drag for nothing.
  // Keyed on their actual inputs only.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const autoPlaced = useMemo(() => autoPlaceSteps(steps as LayoutStep[], initialStepId, layout), [steps, initialStepId, layout]);
  const positionOf = (stepId: string): Point => {
    const recorded = layout[stepId];
    if (isPoint(recorded)) return recorded;
    return autoPlaced[stepId] ?? { x: 0, y: 0 };
  };

  const nodePositions: NodePosition[] = useMemo(
    () => steps.filter((s) => s.id).map((s) => ({ id: s.id as string, ...positionOf(s.id as string) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [steps, initialStepId, layout],
  );

  // The group rules read positions by id. `nodePositions` is the same data as
  // a list, and the boxes need the map.
  const positionsById = useMemo(() => {
    const map: Record<string, Point> = {};
    for (const n of nodePositions) map[n.id] = { x: n.x, y: n.y };
    return map;
  }, [nodePositions]);

  const hidden = useMemo(() => hiddenStepIds(groups, positionsById), [groups, positionsById]);

  // Every group that draws, with its own box. A group of fewer than two
  // present members draws nothing, which is where a step delete leaves one.
  const groupBoxes = useMemo(
    () => groups.map((g) => ({ group: g, box: drawnBox(g, positionsById) })).filter((b) => b.box !== undefined),
    [groups, positionsById],
  );

  // What the marquee and the connect drag may reach: a visible node, plus one
  // pseudo-node per collapsed box so a marquee over the fold selects the
  // members it stands for.
  const visibleNodePositions = useMemo(
    () => nodePositions.filter((n) => !hidden.has(n.id)),
    [nodePositions, hidden],
  );

  // `stepIds` is what the gesture moves; `stepId` is the node under the
  // pointer. The two differ whenever the press lands on a member of a
  // multi-step selection. `startPos` snapshots each mover's position at
  // pointer-down, so the preview and the release read the same origin.
  const [nodeDrag, setNodeDrag] = useState<{
    stepId: string;
    stepIds: string[];
    startPointer: Point;
    startPos: Record<string, Point>;
    current: Point;
  } | null>(null);
  const [connectDrag, setConnectDrag] = useState<{ sourceStepId: string; current: Point } | null>(null);
  // A group box drag moves every member, the way a multi-step node drag does.
  const [groupDrag, setGroupDrag] = useState<{
    groupId: string;
    startPointer: Point;
    startPos: Record<string, Point>;
    current: Point;
  } | null>(null);
  // A waypoint handle drag. `index` names an existing waypoint; `insertAt`
  // names the leg a midpoint-handle drag inserts into. Exactly one is set.
  const [waypointDrag, setWaypointDrag] = useState<{
    pathId: string;
    index?: number;
    insertAt?: number;
    start: Point;
    current: Point;
  } | null>(null);
  // The rubber band. Non-null only while it draws.
  //
  // It carries both spaces on purpose. The band itself is an HTML overlay in
  // `.canvas-wrap`'s own coordinates, the way `.canvas-reject-message` already
  // is: Panzoom scales the SVG element, so an SVG rect would clip at the
  // shrunken viewport whenever the band starts outside it — which is most of
  // the visible canvas at any zoom under 1. `startSvg` is the same press in
  // user space, which the release needs for the hit test against node
  // positions. `origin` is `.canvas-wrap`'s top-left at press time; the wrap
  // never transforms, so one reading holds for the whole gesture.
  const [marquee, setMarquee] = useState<{ origin: Point; startClient: Point; currentClient: Point; startSvg: Point } | null>(null);
  const [rejectMessage, setRejectMessage] = useState<{ text: string; x: number; y: number } | null>(null);
  // The step node whose label is being renamed inline (task 3.8), and the
  // text field's live value. Neither writes the draft until commit.
  const [renaming, setRenaming] = useState<{ stepId: string; value: string } | null>(null);
  // Where the keyboard sits. One element inside the `<svg>` carries the roving
  // `tabindex="0"`, and this names it. The traversal module decides every move;
  // this component only holds the result and points the browser at it.
  const [focus, setFocus] = useState<Focus>(() => entryFocus(steps, groups, initialStepId));

  /** The element a focus names. The stop moves by attribute rather than by a
   * ref map, so this reads the same attributes the markup already carries. */
  const elementFor = (f: Focus): SVGElement | HTMLElement | null => {
    const svg = svgRef.current;
    if (!svg || f.kind === "root") return svg;
    const selector =
      f.kind === "step"
        ? `.canvas-node[data-step-id="${f.stepId}"]`
        : f.kind === "path"
          ? `[data-kind="edge"][data-path-id="${f.pathId}"]`
          : `[data-group-id="${f.groupId}"]`;
    return svg.querySelector<SVGElement | HTMLElement>(selector);
  };

  const moveFocus = (next: Focus) => {
    setFocus(next);
    // The element already stands in the DOM at `tabindex="-1"`, which
    // `focus()` accepts; the next render hands it the stop.
    elementFor(next)?.focus();
  };

  // A focus the canvas stops drawing — its group collapsed, its step deleted
  // from a panel — would leave no element carrying the stop, and the canvas
  // would drop out of the page's tab order. The DOM answers that directly.
  // Layout, not passive, so no frame paints without a stop; keyed on the
  // inputs that can invalidate a focus, so the re-render it causes cannot
  // re-enter it.
  useLayoutEffect(() => {
    const svg = svgRef.current;
    // An open rename takes the node's own `tabindex` away (ARIA forbids a
    // focusable field inside a `role="button"`), and its input is the stop
    // meanwhile.
    if (!svg || renaming) return;
    if (svg.tabIndex === 0 || svg.querySelector('[tabindex="0"]')) return;
    setFocus(entryFocus(steps, groups, initialStepId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps, groups, hidden, renaming]);

  // The rename's `<foreignObject>` unmounts on commit and on cancel, and focus
  // would drop to `<body>`. The node takes it back, now that its own
  // `tabindex` is on the element again.
  const renamedStepId = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (renaming) {
      renamedStepId.current = renaming.stepId;
      return;
    }
    const stepId = renamedStepId.current;
    renamedStepId.current = null;
    if (stepId) elementFor({ kind: "step", stepId })?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renaming]);

  const toSvgPoint = (e: { clientX: number; clientY: number }): Point => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    return svgPointFromClient(svg, e.clientX, e.clientY);
  };

  const fitToView = () => {
    const panzoom = panzoomRef.current;
    const svg = svgRef.current;
    if (!panzoom || !svg || nodePositions.length === 0) return;
    const fit = measureFit(svg);
    panzoom.zoom(fit.scale, { animate: false });
    panzoom.pan(fit.x, fit.y, { animate: false });
  };

  // Centers the graph on open, so an author never has to click "Fit to
  // view" just to see what they opened. Layout, not passive, effect:
  // `fitToView` reads `clientWidth`/`getBBox()` off the just-committed DOM,
  // and running before paint means the very first frame is already framed,
  // instead of flashing the raw top-left layout first.
  useLayoutEffect(() => {
    if (hasFitOnLoad.current || nodePositions.length === 0) return;
    hasFitOnLoad.current = true;
    fitToView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodePositions]);

  // Pointer capture keeps a fast drag tracking even if the pointer leaves
  // the element; failure to acquire it (e.g. an already-released pointer)
  // shouldn't abort the drag/connect gesture itself.
  const capturePointer = (e: React.PointerEvent) => {
    try {
      (e.target as Element).setPointerCapture(e.pointerId);
    } catch {
      // best-effort
    }
  };

  const onNodePointerDown = (e: React.PointerEvent, stepId: string) => {
    e.stopPropagation();
    capturePointer(e);
    // The roving stop follows the pointer. Without this the next arrow key
    // walks from whatever the keyboard last touched, and Enter still binds
    // against that older focus.
    moveFocus({ kind: "step", stepId });
    const p = toSvgPoint(e);
    // Pointer-down writes no selection (design.md): every selection write
    // stays at pointer-up, where the shift decides between a toggle and a
    // replace. Writing here instead would replace the set under a
    // shift-press, and the second shift-click of a pair would leave one step
    // selected.
    const stepIds = selectedStepIds.includes(stepId) && !e.shiftKey ? selectedStepIds : [stepId];
    const startPos: Record<string, Point> = {};
    for (const id of stepIds) startPos[id] = positionOf(id);
    setNodeDrag({ stepId, stepIds, startPointer: p, startPos, current: p });
  };

  const onNodePointerMove = (e: React.PointerEvent) => trackPointer(nodeDrag, setNodeDrag, { current: toSvgPoint(e) });

  /**
   * A waypoint handle's own gesture. Every handler stops propagation: the edge
   * group's `onPointerUp` selects the path, and a drag that ended in a
   * re-selection would fight the gesture it just finished.
   */
  /**
   * A group box drag moves every member by one delta, and each member rounds
   * its own result — the rule a multi-step node drag already applies. The box
   * has no position of its own: it follows the members it encloses.
   */
  const onGroupPointerDown = (e: React.PointerEvent, group: StepGroup) => {
    e.stopPropagation();
    capturePointer(e);
    const p = toSvgPoint(e);
    const startPos: Record<string, Point> = {};
    for (const id of group.stepIds) startPos[id] = positionOf(id);
    setGroupDrag({ groupId: group.id, startPointer: p, startPos, current: p });
  };

  const onGroupPointerMove = (e: React.PointerEvent) => trackPointer(groupDrag, setGroupDrag, { current: toSvgPoint(e) });

  const onGroupPointerUp = (e: React.PointerEvent, group: StepGroup) => {
    e.stopPropagation();
    if (!groupDrag) return;
    const delta = dragDelta(groupDrag.startPointer, groupDrag.current);
    setGroupDrag(null);
    if (exceedsClickThreshold(delta)) {
      for (const id of group.stepIds) {
        const start = groupDrag.startPos[id];
        if (start) onMoveStep(id, snapToGrid({ x: start.x + delta.x, y: start.y + delta.y }));
      }
      return;
    }
    // Under the threshold this is a click, and a click on the box selects
    // exactly its members. The canvas keeps one selection concept.
    onSelectSteps([...group.stepIds]);
  };

  const onWaypointPointerDown = (e: React.PointerEvent, pathId: string, at: { index?: number; insertAt?: number }) => {
    e.stopPropagation();
    capturePointer(e);
    const p = toSvgPoint(e);
    setWaypointDrag({ pathId, ...at, start: p, current: p });
  };

  const onWaypointPointerMove = (e: React.PointerEvent) => trackPointer(waypointDrag, setWaypointDrag, { current: toSvgPoint(e) });

  const onWaypointPointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (!waypointDrag) return;
    const { pathId, index, insertAt, start, current } = waypointDrag;
    setWaypointDrag(null);
    // Under the threshold this was a click, not a drag: it writes nothing.
    // That is the rule a node drag already applies, so a stray press on a
    // handle cannot bend an edge.
    if (!exceedsClickThreshold(dragDelta(start, current))) return;
    const landed = snapToGrid(current);
    const existing = waypoints[pathId] ?? [];
    if (index !== undefined) {
      onWaypointsChange(
        pathId,
        existing.map((w, i) => (i === index ? landed : w)),
      );
    } else if (insertAt !== undefined) {
      const next = [...existing];
      next.splice(insertAt, 0, landed);
      onWaypointsChange(pathId, next);
    }
  };

  const onWaypointDoubleClick = (e: React.MouseEvent, pathId: string, index: number) => {
    e.stopPropagation();
    onWaypointsChange(pathId, (waypoints[pathId] ?? []).filter((_, i) => i !== index));
  };

  const onNodePointerUp = (e: React.PointerEvent, stepId: string) => {
    e.stopPropagation();
    if (!nodeDrag) return;
    const delta = dragDelta(nodeDrag.startPointer, nodeDrag.current);
    if (exceedsClickThreshold(delta)) {
      // After the click threshold, never before: a movement under it selects
      // rather than moves, and rounding first would write a position for a
      // click. Each mover rounds its own result, not the shared delta — every
      // layout constant is a whole multiple of GRID_STEP, so a group on the
      // lattice keeps its relative offsets and each member stays on it.
      for (const id of nodeDrag.stepIds) {
        const start = nodeDrag.startPos[id];
        if (start) onMoveStep(id, snapToGrid({ x: start.x + delta.x, y: start.y + delta.y }));
      }
      // Dragging a node the set did not hold makes it the whole selection.
      if (!selectedStepIds.includes(nodeDrag.stepId)) onSelectStep(nodeDrag.stepId);
    } else if (e.shiftKey) {
      onSelectSteps(toggleSelection(selectedStepIds, stepId));
    } else {
      onSelectStep(stepId);
    }
    setNodeDrag(null);
  };

  /**
   * The marquee binds to `.canvas-wrap`, and in the CAPTURE phase. Both halves
   * are load-bearing, and each one cost a browser check.
   *
   * The wrap, not the SVG: Panzoom scales the SVG element itself, so at any
   * zoom under 1 most of what an author reads as canvas — grid dots and all —
   * sits outside the SVG's own box. A handler on the SVG never sees that
   * press. `onPaletteDrop` resolves through `.canvas-wrap` for the same
   * reason.
   *
   * The capture phase, not the bubble phase: Panzoom's own down-handler binds
   * to `.canvas-wrap` and its default `handleStartEvent` calls
   * `stopPropagation()`. React binds at the root, an ancestor of the wrap, so
   * a bubble-phase handler here would never run at all. React dispatches its
   * capture handlers while the event still travels down, before the wrap's own
   * listener fires.
   *
   * A node, edge or toolbar press reaches this too, so it needs the same
   * `.panzoom-exclude` guard the wheel listener uses.
   */
  const onCanvasPointerDownCapture = (e: React.PointerEvent) => {
    if (!e.shiftKey) return;
    if ((e.target as Element).closest(".panzoom-exclude")) return;
    capturePointer(e);
    // Panzoom has not run yet, but it will, and it will set `isPanning`. Its
    // `constrainXY` reads `disablePan` off a fresh options spread on every
    // call, so setting it here kills the pan that is about to start.
    panzoomRef.current?.setOptions({ disablePan: true });
    const wrap = e.currentTarget.getBoundingClientRect();
    const client = { x: e.clientX, y: e.clientY };
    setMarquee({ origin: { x: wrap.left, y: wrap.top }, startClient: client, currentClient: client, startSvg: toSvgPoint(e) });
  };

  const onMarqueePointerMove = (e: React.PointerEvent) =>
    trackPointer(marquee, setMarquee, { currentClient: { x: e.clientX, y: e.clientY } });

  // Restoring `disablePan` is not optional and not only a pointer-up concern:
  // Panzoom binds `up` on `document`, so a release outside the SVG would leave
  // the canvas unpannable for the life of the screen. Pointer capture (above)
  // routes the release here, and lost capture is the backstop.
  const releasePan = () => panzoomRef.current?.setOptions({ disablePan: false });

  const onMarqueePointerUp = (e: React.PointerEvent) => {
    if (!marquee) return;
    const band = normalizeRect(marquee.startSvg, toSvgPoint(e));
    const picked = nodesInRect(band, visibleNodePositions);
    // A collapsed group stands in for its members: a marquee over the box
    // selects them, and a hidden member is never selected on its own.
    for (const { group, box } of groupBoxes) {
      if (!group.collapsed || !box) continue;
      const overlaps =
        box.x <= band.x + band.width && box.x + box.width >= band.x && box.y <= band.y + band.height && box.y + box.height >= band.y;
      if (overlaps) for (const id of group.stepIds) if (!picked.includes(id)) picked.push(id);
    }
    onSelectSteps(picked);
    setMarquee(null);
    releasePan();
  };

  const startRename = (stepId: string, currentLabel: string) => {
    setRenaming({ stepId, value: currentLabel });
    // The roving stop follows, so the arrow keys resume from the node the
    // rename closes back onto.
    setFocus({ kind: "step", stepId });
  };

  const commitRename = () => {
    if (!renaming) return;
    const index = steps.findIndex((s) => s.id === renaming.stepId);
    const step = steps[index];
    if (step) {
      const patch = inlineRenamePatch(step.label, contentLocale, renaming.value);
      if (patch) {
        const siblingKeys = new Set(steps.filter((s) => s.id !== step.id).map((s) => s.key ?? ""));
        const derivedKey = nextStepKey(step.key ?? "", step.label, patch, baseLocale, siblingKeys);
        const stepPatch: Partial<(typeof steps)[number]> = derivedKey === undefined ? { label: patch } : { label: patch, key: derivedKey };
        updateInDraftArray(mutate, (d) => d.workflow?.steps?.[index], stepPatch);
      }
    }
    setRenaming(null);
  };

  const onHandlePointerDown = (e: React.PointerEvent, stepId: string) => {
    e.stopPropagation();
    capturePointer(e);
    setRejectMessage(null);
    setConnectDrag({ sourceStepId: stepId, current: toSvgPoint(e) });
  };

  const onHandlePointerMove = (e: React.PointerEvent) => trackPointer(connectDrag, setConnectDrag, { current: toSvgPoint(e) });

  const showRejection = (e: { clientX: number; clientY: number }, text: string) => {
    // Screen-relative, not the SVG's (panned/zoomed) user-space `point` — the
    // message is an absolutely-positioned HTML sibling of the SVG.
    const rect = svgRef.current?.getBoundingClientRect();
    setRejectMessage({ text, x: rect ? e.clientX - rect.left : 0, y: rect ? e.clientY - rect.top : 0 });
    setTimeout(() => setRejectMessage(null), REJECT_MESSAGE_MS);
  };

  const onHandlePointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (!connectDrag) return;
    const point = toSvgPoint(e);
    const sourceIndex = steps.findIndex((s) => s.id === connectDrag.sourceStepId);
    const sourceStep = steps[sourceIndex];

    if (sourceStep?.id) {
      const existingPaths = sourceStep.paths ?? [];
      const candidateTrigger = existingPaths[0]?.trigger ?? "manual";
      // Visible nodes only: a hidden member is not a connect-drag target, or
      // a release over a collapsed box would create a path to a step nobody
      // can see.
      const result = resolveDropGesture(point, visibleNodePositions, existingPaths, candidateTrigger, sourceStep.terminal === true);

      if (result.kind === "rejected") {
        showRejection(e, result.reason);
      } else if (result.kind === "connect-to-step") {
        const targetStep = steps.find((s) => s.id === result.targetStepId);
        const path = newPath(
          sourceStep,
          targetStep,
          result.targetStepId,
          result.trigger,
          contentLocale,
          baseLocale,
          t("steps.unnamedStep"),
        );
        updateInDraftArray(mutate, (d) => d.workflow?.steps?.[sourceIndex], { paths: [...existingPaths, path] });
      } else {
        // create-step-and-connect: the step first, then the path (design.md)
        // — a candidate already accepted by resolveDropGesture above never
        // leaves an orphan step behind, but ordering it this way keeps that
        // true even if a future change moves the check.
        const step = newStep("task", seedLocalizedText(contentLocale));
        const path = newPath(sourceStep, step, step.id, result.trigger, contentLocale, baseLocale, t("steps.unnamedStep"));
        mutate((d) => {
          d.workflow ??= {};
          d.workflow.steps ??= [];
          d.workflow.steps.push(step);
          const source = d.workflow.steps[sourceIndex];
          if (source) {
            source.paths ??= [];
            source.paths.push(path);
          }
        });
        if (step.id) onMoveStep(step.id, result.point);
      }
    }
    setConnectDrag(null);
  };

  const onBackgroundPointerUp = (e: React.PointerEvent) => {
    // A marquee release is not a deselect. It runs on the wrap, after this
    // one, and would otherwise empty the set it had just built.
    if (marquee) return;
    if (e.target === svgRef.current) onSelectStep(undefined);
  };

  const stepLabel = (s: (typeof steps)[number] | undefined) =>
    resolveDraftLocalizedText(s?.label, contentLocale, baseLocale) || s?.key || t("steps.unnamedStep");

  /** The palette's own three words. `end` is a `terminal` flag on an ordinary
   * task step, never a `type` of its own. */
  const stepKind = (s: (typeof steps)[number]) =>
    s.type === "subprocess" ? t("palette.subprocess") : s.terminal === true ? t("palette.end") : t("palette.step");

  /** A step's accessible name. The base template carries the segments every
   * step has; a stamp appends only where it applies, because an unfilled slot
   * would print a bare comma. `outgoing` counts the paths the traversal
   * reaches, which is the set the edge pass below drew, and it picks the
   * template: one fixed plural announces "1 outgoing paths". */
  const nodeName = (s: (typeof steps)[number], outgoing: number) => {
    const parts = [
      t(outgoing === 1 ? "canvas.nodeLabelOnePath" : "canvas.nodeLabel")
        .replace("{label}", stepLabel(s))
        .replace("{key}", s.key ?? "")
        .replace("{kind}", stepKind(s))
        .replace("{paths}", String(outgoing)),
    ];
    if (s.terminal === true && s.outcome) parts.push(t("canvas.nodeLabelOutcome").replace("{outcome}", s.outcome));
    if (s.id !== undefined && s.id === initialStepId) parts.push(t("canvas.nodeLabelInitial"));
    return parts.join(", ");
  };

  /** A path's accessible name. The guard is a slot rather than an appended
   * segment: every path either carries one or says it carries none. The
   * trigger slot takes the schema's own enum value, which this catalog leaves
   * untranslated on purpose.
   *
   * `guardText` is the readable guard the edge label already draws, and the
   * caller passes it because the operands it rests on resolve per step. A
   * reader would otherwise hear the CEL source, `data.amount > 1000`, while
   * the readable string sits beside it under `aria-hidden`. `guardEdgeLabel`
   * returns the source itself where nothing resolves, so the fallback holds. */
  const pathName = (
    path: NonNullable<(typeof steps)[number]["paths"]>[number],
    source: (typeof steps)[number],
    guardText: string | undefined,
  ) => {
    const parts = [
      t("canvas.pathLabel")
        .replace("{label}", path.label ?? "")
        .replace("{source}", stepLabel(source))
        .replace("{target}", stepLabel(steps.find((s) => s.id === path.to)))
        .replace("{trigger}", path.trigger ?? t("canvas.pathLabelNoTrigger"))
        .replace("{guard}", guardText ?? t("canvas.pathLabelNoGuard")),
    ];
    if (path.trigger === "automatic" && path.priority !== undefined) {
      parts.push(t("canvas.pathLabelPriority").replace("{priority}", String(path.priority)));
    }
    return parts.join(", ");
  };

  /**
   * The canvas's own keyboard. It binds on the `<svg>` rather than on
   * `.canvas-wrap`, which would also catch the toolbar's buttons.
   */
  const onCanvasKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    // The inline rename owns Enter, Escape and its own caret movement. A
    // disclosure button is no text field, so an arrow key and Escape still
    // reach this handler from one.
    if ((e.target as Element).closest("input, textarea, [contenteditable]")) return;
    if (e.key === "Escape") {
      // The stop moves with the focus. Without that move Tab walks straight
      // back in, since the roving `0` would still sit inside the `<svg>`.
      setFocus({ kind: "root" });
      svgRef.current?.focus();
      return;
    }
    if (e.key === "Enter") {
      // A group's disclosure is a real button and answers Enter itself.
      if (focus.kind === "step") onSelectStep(focus.stepId);
      else if (focus.kind === "path") {
        const owner = steps.find((s) => s.paths?.some((p) => p.id === focus.pathId));
        if (owner?.id) onSelectStep(owner.id, focus.pathId);
      }
      return;
    }
    const arrow = ARROW_KEYS.find((k) => k === e.key);
    if (!arrow) return;
    // Without this an arrow both moves canvas focus and scrolls the page.
    e.preventDefault();
    moveFocus(nextFocus(focus, arrow, steps, groups, initialStepId));
  };

  const toggleGroup = (groupId: string) => {
    onGroupsChange(groups.map((g) => (g.id === groupId ? { ...g, collapsed: !g.collapsed } : g)));
  };

  // Guard labels render in their own pass, after every node (below), instead
  // of inline in the edge that computes them: `.canvas-node-rect` is opaque,
  // and nodes draw after edges, so a label inline in the edge group could
  // sit partly behind a nearby node's fill and read as a clipped fragment.
  // Collected here during the edge pass, rendered after the node pass.
  const guardLabels: Array<{ key: string; x: number; y: number; maxWidth: number; text: string; stepId: string; pathId: string | undefined }> =
    [];

  // Waypoint handles ride that same late pass, and for the same reason: a
  // handle inside the edge group sits behind a nearby node's opaque fill.
  // Drawing after the guard labels also keeps a handle grabbable where the
  // two share the route's midpoint.
  const waypointHandles: Array<{ key: string; x: number; y: number; pathId: string; index?: number; insertAt?: number }> = [];

  // The disclosure buttons ride the same late pass, and they need it most: a
  // guard label is a 220-wide `<foreignObject>` carrying its own pointer
  // handler, and it lands wherever a route midpoint lands, so it can cover a
  // box corner. Collected in the group pass, drawn after every other one.
  const disclosures: Array<{ group: StepGroup; x: number; y: number }> = [];

  // How many outgoing paths each step reaches, filled by the edge pass below
  // and read by the node pass after it. The edge pass is the canvas's own
  // decision about which paths draw, and the traversal walks exactly that set,
  // so counting what drew states no second rule.
  const outgoingCount = new Map<string, number>();

  /** One step's node. Two sites call it: the flat pass, for a step no drawn
   * group holds, and the members `<g>` of a group that draws a box. */
  const renderNode = (step: (typeof steps)[number]) => {
    if (!step.id) return null;
    if (hidden.has(step.id)) return null;
    const pos = positionOf(step.id);
    const draggedFrom = nodeDrag?.startPos[step.id];
    // The preview rounds exactly as the release does, so the node under
    // the pointer is the node the author gets. Drawing the raw point
    // here would make it jump at release. Every member of the moving set
    // previews, not only the node under the pointer.
    const previewed = draggedFrom
      ? snapToGrid({
          x: draggedFrom.x + dragDelta(nodeDrag!.startPointer, nodeDrag!.current).x,
          y: draggedFrom.y + dragDelta(nodeDrag!.startPointer, nodeDrag!.current).y,
        })
      : pos;
    const x = previewed.x;
    const y = previewed.y;
    const isSelected = selectedStepIds.includes(step.id);
    const isInitial = initialStepId === step.id;
    const isTerminal = step.terminal === true;
    const isRenaming = renaming?.stepId === step.id;
    const label = stepLabel(step);

    return (
      <g
        key={step.id}
        data-step-id={step.id}
        transform={`translate(${x}, ${y})`}
        className="canvas-node panzoom-exclude"
        // All three drop while the rename is open: ARIA forbids a focusable
        // field inside a `role="button"`, and the field is that node's own.
        role={isRenaming ? undefined : "button"}
        tabIndex={isRenaming ? undefined : focus.kind === "step" && focus.stepId === step.id ? 0 : -1}
        aria-label={isRenaming ? undefined : nodeName(step, outgoingCount.get(step.id) ?? 0)}
        onPointerDown={(e) => onNodePointerDown(e, step.id as string)}
        onPointerUp={(e) => onNodePointerUp(e, step.id as string)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          // The resolved label alone, with no fallback: a step carrying no
          // entry for the chosen locale opens an empty field, so the author
          // writes a translation rather than committing a copy of the key.
          startRename(step.id as string, resolveDraftLocalizedText(step.label, contentLocale, baseLocale) ?? "");
        }}
      >
        {isInitial && (
          <line x1={-24} y1={NODE_HEIGHT / 2} x2={0} y2={NODE_HEIGHT / 2} className="canvas-initial-arrow" markerEnd="url(#canvas-arrow)" />
        )}
        <rect
          width={NODE_WIDTH}
          height={NODE_HEIGHT}
          rx={0}
          className={isSelected ? "canvas-node-rect canvas-node-selected" : "canvas-node-rect"}
        />
        {step.type === "subprocess" && (
          // The doubled rule BPMN draws on a call activity. It sits before
          // the label, the key, the stamps and the connect handle, so the
          // handle's own circle covers the 3px it overlaps on the right.
          <rect x={4} y={4} width={NODE_WIDTH - 8} height={NODE_HEIGHT - 8} rx={0} className="canvas-node-subprocess" />
        )}
        {isRenaming ? (
          <foreignObject x={6} y={14} width={NODE_WIDTH - 12} height={22} className="panzoom-exclude">
            <input
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              aria-label={t("stepSections.renameLabel")}
              className="canvas-rename-input"
              value={renaming.value}
              onChange={(e) => setRenaming({ stepId: step.id as string, value: e.target.value })}
              onBlur={commitRename}
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                else if (e.key === "Escape") setRenaming(null);
              }}
            />
          </foreignObject>
        ) : (
          <text x={10} y={24} className="canvas-node-label">
            {label}
          </text>
        )}
        {/* The key draws only where the label line does not already print it.
            A step whose label resolves to nothing falls back to that key, and
            one value must not appear on both lines. */}
        {step.key && step.key !== label && (
          <text x={10} y={44} className="canvas-node-key">
            {step.key}
          </text>
        )}
        {isTerminal && (
          <g transform={`translate(${NODE_WIDTH - 22}, -12) rotate(-8)`} className="canvas-terminal-stamp">
            <circle r={16} />
            <text y={4}>{(step.outcome ?? "").slice(0, 4) || "•"}</text>
          </g>
        )}
        {isInitial && (
          <g transform="translate(22, -12)" className="canvas-initial-stamp">
            <circle r={16} />
            <text y={4}>{t("canvas.initialStamp")}</text>
          </g>
        )}
        <circle
          cx={NODE_WIDTH}
          cy={NODE_HEIGHT / 2}
          r={HANDLE_RADIUS}
          className={isTerminal ? "canvas-connect-handle canvas-connect-handle-terminal" : "canvas-connect-handle"}
          onPointerDown={(e) => onHandlePointerDown(e, step.id as string)}
          onPointerUp={onHandlePointerUp}
        />
        {/* Last, so nothing the node draws paints over it. A CSS outline does
            not follow an SVG shape, so the ring is an element; the stroke keeps
            its 2px under the canvas zoom, while the offset scales with the
            node, which is what makes it hug the shape. */}
        <rect
          className="canvas-node-focus-ring"
          x={-FOCUS_RING_OFFSET}
          y={-FOCUS_RING_OFFSET}
          width={NODE_WIDTH + FOCUS_RING_OFFSET * 2}
          height={NODE_HEIGHT + FOCUS_RING_OFFSET * 2}
          rx={0}
          vectorEffect="non-scaling-stroke"
        />
      </g>
    );
  };

  return (
    <div
      className="canvas-wrap"
      onPointerDownCapture={onCanvasPointerDownCapture}
      onPointerMove={onMarqueePointerMove}
      onPointerUp={onMarqueePointerUp}
      onLostPointerCapture={() => {
        if (marquee) setMarquee(null);
        releasePan();
      }}
    >
      <div className="canvas-toolbar panzoom-exclude" ref={toolbarRef}>
        <button type="button" className="btn btn-secondary" onClick={fitToView}>
          {t("canvas.fitToView")}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          aria-pressed={edgeStyle === "smoothstep"}
          onClick={() => onEdgeStyleChange(edgeStyle === "smoothstep" ? "step" : "smoothstep")}
        >
          {t("canvas.edgeStyleToggle")}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onArrange}>
          {t("canvas.arrange")}
        </button>
      </div>
      <svg
        ref={svgRef}
        className="canvas-svg"
        // `application` is load-bearing, not cosmetic: a screen reader's
        // browse mode otherwise consumes an arrow key before this handler
        // sees it. The price is that every element inside must be a named
        // control, which each node, path and disclosure now is.
        role="application"
        aria-label={t("canvas.svgLabel")}
        // `-1` still answers the `focus()` call Escape makes; the root takes
        // the roving stop only once a focus names it.
        tabIndex={focus.kind === "root" ? 0 : -1}
        onKeyDown={onCanvasKeyDown}
        onPointerMove={(e) => {
          onNodePointerMove(e);
          onHandlePointerMove(e);
        }}
        onPointerUp={(e) => {
          onBackgroundPointerUp(e);
        }}
      >
        <defs>
          <marker id="canvas-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="canvas-arrowhead" />
          </marker>
        </defs>

        {/* Groups draw first, so every node and every route sits over them.
            A box is a container, not a control: the design language gives it
            a hairline and no fill, and the grid dots stay visible through it. */}
        {groupBoxes.map(({ group, box }) => {
          if (!box) return null;
          const dragging = groupDrag?.groupId === group.id;
          const delta = dragging ? dragDelta(groupDrag.startPointer, groupDrag.current) : { x: 0, y: 0 };
          const moved = dragging ? snapToGrid({ x: box.x + delta.x, y: box.y + delta.y }) : box;
          const members = group.stepIds.length;
          // The drag preview offset rides along, so the button follows a group
          // the author is dragging. The point is the host's corner, not the
          // button's: the button sits inset by the clearance below, which puts
          // it back at `box.width - DISCLOSURE_SIZE`.
          disclosures.push({
            group,
            x: moved.x + box.width - DISCLOSURE_SIZE - DISCLOSURE_OUTLINE_CLEARANCE,
            y: moved.y + box.height - DISCLOSURE_SIZE - DISCLOSURE_OUTLINE_CLEARANCE,
          });
          return (
            <g
              key={group.id}
              className={`canvas-group panzoom-exclude${group.collapsed ? " canvas-group-collapsed" : ""}`}
              onPointerDown={(e) => onGroupPointerDown(e, group)}
              onPointerMove={onGroupPointerMove}
              onPointerUp={(e) => onGroupPointerUp(e, group)}
            >
              <rect x={moved.x} y={moved.y} width={box.width} height={box.height} rx={0} className="canvas-group-box" />
              <text x={moved.x + 8} y={group.collapsed ? moved.y + 24 : moved.y - 6} className="canvas-group-name">
                {group.name}
              </text>
              {group.collapsed && (
                <text x={moved.x + 8} y={moved.y + 44} className="canvas-group-count">
                  {members} {t("canvas.groupStepCount")}
                </text>
              )}
            </g>
          );
        })}

        {steps.map((step) => {
          if (!step.id) return null;
          const operands = buildOperands({
            fields: draft.fields,
            locale: contentLocale,
            baseLocale,
            child: loadedChildren[step.id],
          });
          return (step.paths ?? []).map((path, pathIndex) => {
            if (!path.to) return null;
            // Both anchors depend on the target, so they resolve per path
            // rather than once per step: one step's paths can leave four
            // different sides. With waypoints they face the first and the
            // last of those instead.
            const pathWaypoints = (path.id !== undefined ? waypoints[path.id] : undefined) ?? [];
            // A collapsed group's box stands in for a hidden member, so the
            // route ends on the box rather than on a step nobody can see. Two
            // members of one collapsed group have nothing to draw between.
            const sourceBox = anchorBoxFor(step.id as string, groups, positionsById);
            const targetBox = anchorBoxFor(path.to as string, groups, positionsById);
            if (!sourceBox || !targetBox) return null;
            if (hidden.has(step.id as string) && hidden.has(path.to) && sourceBox.x === targetBox.x && sourceBox.y === targetBox.y) {
              return null;
            }
            const routed = routeThroughWaypoints(
              { x: sourceBox.x, y: sourceBox.y },
              { x: targetBox.x, y: targetBox.y },
              pathWaypoints,
              {
                source: { width: sourceBox.width, height: sourceBox.height },
                target: { width: targetBox.width, height: targetBox.height },
              },
            );
            const route = routed.points;
            const d = routePath(route, edgeStyle);
            // The badge and the guard label follow the route, not a straight
            // line between the anchors. On a five-segment route those two
            // points are nowhere near each other.
            const mid = midpointOfRoute(route);
            const midX = mid.point.x;
            const midY = mid.point.y;
            const automaticGuarded = path.trigger === "automatic" && path.guard !== undefined;
            const automaticDefault = path.trigger === "automatic" && path.guard === undefined;
            const isSelected = path.id !== undefined && path.id === selectedPathId;
            const guardSrc = path.guard?.src;
            // The readable guard serves both the drawn label and the path's
            // accessible name, so it resolves once for either. Only an
            // automatic guarded path draws it.
            const guardText = guardSrc ? guardEdgeLabel(guardSrc, operands) : undefined;
            const guardLabel = automaticGuarded ? guardText : undefined;
            if (guardLabel) {
              // Cap the label to the free space on the segment its midpoint
              // actually falls on, so it never needs to spill onto a
              // neighboring node in the first place; the post-node paint
              // order (below) is the fallback for when that gap is too
              // narrow for even the ellipsis to clear it.
              //
              // The segment, not the anchor gap: a five-segment route puts
              // its midpoint on a vertical run, where the distance between
              // the two anchors says nothing about the room available.
              const gap = segmentLength(route, mid.segment);
              const maxWidth = Math.min(220, Math.max(60, gap - 24));
              guardLabels.push({
                key: path.id ?? `${step.id}-${pathIndex}-guard`,
                x: midX,
                y: midY + 4,
                maxWidth,
                text: guardLabel,
                stepId: step.id as string,
                pathId: path.id,
              });
            }
            // Only the selected path shows handles. Every path showing them
            // would put a control every twenty pixels on a busy graph.
            if (isSelected && path.id !== undefined) {
              const pathId = path.id;
              for (const [index, w] of pathWaypoints.entries()) {
                waypointHandles.push({ key: `${pathId}-w${index}`, x: w.x, y: w.y, pathId, index });
              }
              // The midpoint's own segment names a leg, never a list index:
              // one leg draws as two to six segments.
              waypointHandles.push({
                key: `${pathId}-mid`,
                x: midX,
                y: midY,
                pathId,
                insertAt: legOfSegment(routed.legStarts, mid.segment),
              });
            }
            const isInsertTarget = path.id !== undefined && path.id === insertTargetPathId;
            // A path with no id draws, but nothing can reference it, so the
            // traversal never reaches it and it never joins a fan count.
            if (path.id !== undefined) {
              outgoingCount.set(step.id as string, (outgoingCount.get(step.id as string) ?? 0) + 1);
            }
            return (
              <g
                key={path.id ?? `${step.id}-${pathIndex}`}
                className={`canvas-edge-group panzoom-exclude${isSelected ? " canvas-edge-group-selected" : ""}${isInsertTarget ? " canvas-edge-insert-target" : ""}`}
                data-kind="edge"
                data-path-id={path.id}
                data-step-id={path.id !== undefined ? step.id : undefined}
                role="button"
                tabIndex={focus.kind === "path" && focus.pathId === path.id ? 0 : -1}
                aria-label={pathName(path, step, guardText)}
                // The press takes the roving stop, entered through the source,
                // which is the end Up and Down walk from. A path with no id
                // takes none: nothing can name it.
                onPointerDown={() => {
                  if (path.id !== undefined) moveFocus({ kind: "path", pathId: path.id, from: "source" });
                }}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  onSelectStep(step.id, path.id);
                }}
              >
                {/* The halo, not a ring: a stroke holds no offset, so a line's
                    indicator is a band around the shape. It shares the edge's
                    own `d` and draws before it, and the 1.5px edge paints over
                    its middle — a manual path keeps its dash, and about 2px of
                    accent reads on each side. */}
                <path d={d} className="canvas-edge-focus-halo" vectorEffect="non-scaling-stroke" />
                <path
                  d={d}
                  className={path.trigger === "manual" ? "canvas-edge canvas-edge-manual" : "canvas-edge canvas-edge-automatic"}
                  markerEnd="url(#canvas-arrow)"
                />
                {/* The same `d`, so the pointer target follows the route
                    rather than a straight line the canvas no longer draws.
                    `.canvas-edge-hitarea` needs `fill: none` for that: a
                    `<line>` cannot fill, a `<path>` can, and a five-segment
                    route encloses area SVG would otherwise paint black. */}
                <path d={d} className="canvas-edge-hitarea" />
                {automaticGuarded && (
                  <text x={midX} y={midY - 6} className="canvas-edge-badge">
                    {path.priority ?? "?"}
                  </text>
                )}
                {automaticDefault && (
                  <text x={midX} y={midY - 6} className="canvas-edge-badge">
                    {t("canvas.elseMarker")}
                  </text>
                )}
              </g>
            );
          });
        })}

        {connectDrag &&
          (() => {
            const source = positionOf(connectDrag.sourceStepId);
            const start = { x: source.x + NODE_WIDTH, y: source.y + NODE_HEIGHT / 2 };
            return (
              <line
                x1={start.x}
                y1={start.y}
                x2={connectDrag.current.x}
                y2={connectDrag.current.y}
                className="canvas-edge canvas-edge-dragging"
              />
            );
          })()}

        {/* Each drawn group's members sit inside one `<g>`, the element both
            disclosure controls name in `aria-controls`. The wrapper renders in
            both states; a collapsed group's holds nothing, so the attribute
            never points at an element that is not there. */}
        {(() => {
          const emitted = new Set<string>();
          return steps.map((step) => {
            if (!step.id) return null;
            const boxed = groupBoxes.find(({ group }) => group.stepIds.includes(step.id as string));
            if (!boxed) return renderNode(step);
            if (emitted.has(boxed.group.id)) return null;
            emitted.add(boxed.group.id);
            return (
              <g key={boxed.group.id} id={groupMembersDomId(boxed.group.id)}>
                {steps.filter((s) => s.id !== undefined && boxed.group.stepIds.includes(s.id)).map(renderNode)}
              </g>
            );
          });
        })()}

        {guardLabels.map((label) => (
          <foreignObject
            key={label.key}
            x={label.x - label.maxWidth / 2}
            y={label.y}
            width={label.maxWidth}
            height={16}
            className="panzoom-exclude"
            data-path-id={label.pathId}
            data-step-id={label.pathId !== undefined ? label.stepId : undefined}
          >
            <div
              className="canvas-edge-guard-label"
              // Out of the accessibility tree: the path itself now carries the
              // role, the name and the tab stop, and this only duplicates a
              // pointer route the edge group already offers.
              aria-hidden="true"
              title={label.text}
              onPointerUp={(e) => {
                e.stopPropagation();
                onSelectStep(label.stepId, label.pathId);
              }}
            >
              {label.text}
            </div>
          </foreignObject>
        ))}

        {waypointHandles.map((h) => {
          // The drag previews where the handle will land, snapped, so the
          // square under the pointer is the square the author gets.
          const dragging =
            waypointDrag?.pathId === h.pathId &&
            waypointDrag.index === h.index &&
            waypointDrag.insertAt === h.insertAt;
          const at = dragging ? snapToGrid(waypointDrag.current) : { x: h.x, y: h.y };
          return (
            <rect
              key={h.key}
              x={at.x - WAYPOINT_HANDLE / 2}
              y={at.y - WAYPOINT_HANDLE / 2}
              width={WAYPOINT_HANDLE}
              height={WAYPOINT_HANDLE}
              rx={0}
              // `panzoom-exclude` is load-bearing, and the browser check
              // earned it: Panzoom's down-handler calls `stopPropagation` at
              // `.canvas-wrap`, and React listens at the root, an ancestor.
              // Without the class the press never reaches this rect and pans
              // the canvas instead. Every node and edge group carries it.
              className={`canvas-waypoint-handle panzoom-exclude${h.index === undefined ? " canvas-waypoint-handle-new" : ""}`}
              onPointerDown={(e) => onWaypointPointerDown(e, h.pathId, { index: h.index, insertAt: h.insertAt })}
              onPointerMove={onWaypointPointerMove}
              onPointerUp={onWaypointPointerUp}
              onDoubleClick={h.index === undefined ? undefined : (e) => onWaypointDoubleClick(e, h.pathId, h.index as number)}
            />
          );
        })}

        {/* Last of all, so no route, node, guard label or waypoint handle can
            take a press meant for a disclosure. A guard label is a 220-wide
            `<foreignObject>` carrying its own pointer handler, and it lands
            wherever a route midpoint lands. Each button is a sibling of its box
            `<g>`, so the group's drag handlers never see the press either. */}
        {disclosures.map(({ group, x, y }) => (
          <foreignObject
            key={group.id}
            x={x}
            y={y}
            width={DISCLOSURE_HOST}
            height={DISCLOSURE_HOST}
            // The host stands 4 units clear of the button on every side, and
            // that band lies over a member node's corner at one end and over
            // empty canvas at the other. `canvas-group-disclosure-host` makes
            // it inert, so only the button's own 20 units take a press.
            className="canvas-group-disclosure-host panzoom-exclude"
          >
            <button
              type="button"
              className="canvas-group-disclosure"
              data-group-id={group.id}
              tabIndex={focus.kind === "group" && focus.groupId === group.id ? 0 : -1}
              aria-expanded={group.collapsed !== true}
              aria-controls={groupMembersDomId(group.id)}
              aria-label={t("canvas.groupDisclosure").replace("{group}", group.name)}
              // The press stops here rather than reaching the `<svg>`'s own
              // handlers, the rule the rename input already follows.
              // `panzoom-exclude` above is what keeps Panzoom's native
              // down-handler and the marquee's capture handler off it.
              //
              // It also takes the roving stop. Enter binds for a step focus
              // and a path focus alone, so a stop left on a step would let one
              // Enter both toggle this group and open that step's inspector.
              onPointerDown={(e) => {
                e.stopPropagation();
                moveFocus({ kind: "group", groupId: group.id });
              }}
              onClick={() => toggleGroup(group.id)}
            >
              {group.collapsed ? (
                <ChevronRight size={18} strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <ChevronDown size={18} strokeWidth={1.75} aria-hidden="true" />
              )}
            </button>
          </foreignObject>
        ))}

      </svg>
      {marquee &&
        (() => {
          // Wrap-relative, so the band covers every part of the visible canvas
          // rather than clipping at the transformed SVG's own viewport.
          const r = normalizeRect(marquee.startClient, marquee.currentClient);
          return (
            <div
              className="canvas-marquee"
              style={{ left: r.x - marquee.origin.x, top: r.y - marquee.origin.y, width: r.width, height: r.height }}
            />
          );
        })()}
      {rejectMessage && (
        <div className="canvas-reject-message" style={{ left: rejectMessage.x, top: rejectMessage.y }}>
          {rejectMessage.text}
        </div>
      )}
    </div>
  );
}
