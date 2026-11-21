import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import Panzoom, { type PanzoomObject } from "@panzoom/panzoom";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useDraft } from "../draft/store";
import { updateInDraftArray } from "../draft/draft-array-crud";
import { newStep } from "../draft/createStep";
import { newPath, triggerForNewPath } from "../draft/createPath";
import { seedLocalizedText } from "../draft/localized-text";
import { t } from "../catalog.js";
import { drawnPositions, pointsAfterMove, type LayoutStep, type PathDockingEnds } from "./layout";
import {
  dragDelta,
  exceedsClickThreshold,
  snapToGrid,
  svgPointFromClient,
  routeThroughWaypoints,
  legOfSegment,
  routePath,
  midpointOfRoute,
  dockingAnchor,
  dockingEndOfAnchor,
  dockingPointsOf,
  pressTargetRect,
  GRID_STEP,
  NODE_WIDTH,
  NODE_HEIGHT,
  type DockingEnd,
  type Point,
  type NodePosition,
  type EdgeStyle,
} from "./geometry";
import { EndHandle, endHandlesOf, type EndHandleSpec } from "./EndHandle";
import { toggleSelection, normalizeRect, nodesInRect } from "./selection";
import { drawnBox, hiddenStepIds, anchorBoxFor, type StepGroup } from "./groups";
import { computeFit, fitInsets, revealPan, zoomAbout, ZOOM_KEY_FACTOR, MIN_SCALE, MAX_SCALE, type Fit } from "./fit";
import { lastInputWasPointer } from "../focusScroll";
import { checkConnectSource, dropTargetOf, endDropEntry, hitTestGrownNode, pressedDockingPoint, resolveConnectDrop, resolveEndDrop } from "./dropGesture";
import { refusalSentence } from "./connection";
import { menuNewStepSpot, wayOutMenuItems, type WayOutMenuItem } from "./wayOutMenuLogic";
import { WayOutMenu, openWayOutMenu } from "./WayOutMenu";
import {
  nodeName,
  pathName,
  stampLines,
  stampWidth,
  stampWords,
  wayOutSentence,
  STAMP_CHROME_HEIGHT,
  STAMP_INSET,
  STAMP_LINE_HEIGHT,
} from "./mapWords";
import {
  arrowheadObstacle,
  groupNameObstacle,
  labelObstacle,
  nodeObstacle,
  placeSentences,
  stampObstacles,
  startArrowObstacle,
  type Obstacle, type SentenceBox, type SentenceInput } from "./sentencePlacement";
import { nextFocus, entryFocus, type ArrowKey, type Focus } from "./traversal";
import { fill, stepTextMap } from "../panels/shared/optionText";
import { buildOperands } from "../panels/shared/conditionLogic";

/** A docking point's drawn dot, and the snap target's dot and ring (design.md,
 * Shape brief). */
const POINT_RADIUS = 3.5;
const SNAP_RADIUS = 5;
const SNAP_RING_RADIUS = 10;
/** A way out's sentence host: six 16-unit lines (design.md D5). It centres on
 * the placed box, so a short estimate never clips a line. */
const SENTENCE_HOST_HEIGHT = 96;
/** The waypoint handle's side. A square, not a circle: the end handle owns the
 * circle shape, and a waypoint stays distinct from it (design.md). */
const WAYPOINT_HANDLE = 10;
const REJECT_MESSAGE_MS = 4000;
/** How far into a node the `C` key's refusal hangs from its top edge, in
 * pixels, so the message's bottom border covers that edge. */
const REFUSAL_INSET = 2;
/** The refusal box's widest width (`maxWidth` of its style, 16rem) and the
 * height its longest sentence needs, in pixels, for keeping it in the frame. */
const REFUSAL_BOX_WIDTH = 256;
const REFUSAL_BOX_HEIGHT = 80;
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

const styles = stylex.create({
  // The live region's hiding: laid out but invisible, since `display: none`
  // is announced by no engine.
  visuallyHidden: {
    position: "absolute",
    width: 1,
    height: 1,
    margin: -1,
    padding: 0,
    overflow: "hidden",
    clipPath: "inset(50%)",
    whiteSpace: "nowrap",
    borderWidth: 0,
  },
  wrap: {
    position: "relative",
    flex: "1 1 auto",
    minWidth: 0,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
    overflow: "clip",
    backgroundColor: colors.surfaceMuted,
    backgroundImage: `radial-gradient(${colors.border} 1px, transparent 1px)`,
    // paintGrid() writes these two custom properties via style.setProperty()
    // inside the same useLayoutEffect that mounts Panzoom, which always runs
    // before the browser's first paint — so no fallback declaration for
    // either property is reachable and none is declared here.
    backgroundSize: "var(--canvas-grid-size) var(--canvas-grid-size)",
    backgroundPosition: "var(--canvas-grid-offset-x) var(--canvas-grid-offset-y)",
  },
  toolbar: {
    position: "absolute",
    top: space.s2,
    left: space.s2,
    zIndex: 1,
    display: "flex",
    gap: space.s2,
  },
  // The chosen edge style reads off `aria-pressed` today; this composes the
  // same active-state treatment directly from the `edgeStyle === "smoothstep"`
  // boolean that already drives that attribute, instead of an attribute
  // selector (design.md D3, case 4).
  toolbarToggleActive: {
    borderColor: colors.accent,
    color: colors.accent,
    boxShadow: `inset 0 -2px 0 ${colors.accent}`,
  },
  svg: {
    width: "100%",
    height: "100%",
    overflow: "visible",
    touchAction: "none",
  },
  // `canvas-node` stays a literal, unhashed class name (elementFor()'s
  // querySelector, per the task's own mandate). This style composes
  // alongside it. `outline: "none"` is unconditional rather than gated on
  // `:focus-visible`: the shell's global `:focus-visible` rule is the only
  // thing that would ever paint an outline here, so suppressing it always
  // has no effect outside that state.
  node: {
    cursor: "grab",
    outline: "none",
  },
  group: {
    cursor: "grab",
  },
  groupBox: {
    fill: "none",
    stroke: colors.border,
    strokeWidth: 1,
    pointerEvents: "none",
  },
  groupBoxCollapsed: {
    fill: colors.surface,
    strokeWidth: 1.5,
    pointerEvents: "all",
  },
  groupName: {
    cursor: "grab",
    fontFamily: fonts.body,
    fontSize: 12,
    fill: colors.textMuted,
  },
  groupNameCollapsed: {
    fontSize: 13,
    fill: colors.text,
  },
  groupCount: {
    fontFamily: fonts.mono,
    fontSize: 11,
    fill: colors.textMuted,
  },
  nodeRect: {
    fill: colors.surface,
    stroke: colors.border,
    strokeWidth: 1.5,
  },
  nodeRectSelected: {
    stroke: colors.accent,
    strokeWidth: 2,
  },
  nodeSubprocess: {
    fill: "none",
    stroke: colors.border,
    strokeWidth: 1,
  },
  // The label's outer box. It positions the one or two lines it holds, which
  // `nodeLabel` cannot do for itself: the clamp below needs
  // `display: -webkit-box`, and `align-items` reaches neither that nor any
  // other non-flex container.
  //
  // `center` over `flex-start`, so one line and two read from the node's own
  // middle. A fixed 20 of top padding put both first lines on 34, which cost
  // a two-line label its centring: 39 of clamped text closed on 59 inside the
  // 60-unit box. Centred, two lines run 10.5 to 49.5, and one line lands on
  // 20.25 — a quarter unit from where the padding drew it.
  nodeLabelBox: {
    height: "100%",
    display: "flex",
    alignItems: "center",
  },
  // Two lines, then an ellipsis. `-webkit-line-clamp` needs all four
  // declarations together, and it draws the ellipsis itself, so no
  // `text-overflow` belongs here.
  //
  // `overflow-wrap: anywhere` is what makes the clamp reach German. A
  // compound is one token, and a token wider than the box does not break on
  // its own, so the block stayed one line, never exceeded two, and got cut
  // mid-glyph with no ellipsis at all.
  nodeLabel: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.text,
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
    overflow: "hidden",
    overflowWrap: "anywhere",
  },
  // Merges app.css's two declarations for this selector (the shared
  // display/fill/stroke/pointer-events block plus its own stroke-width/
  // stroke-dasharray block) into one entry, per design.md D3 case 1. The
  // ancestor is `.canvas-node`, marked via `stylex.defaultMarker()` at its
  // own render site.
  nodeFocusRing: {
    display: { default: "none", [stylex.when.ancestor(":focus-visible")]: "inline" },
    fill: "none",
    stroke: colors.accent,
    pointerEvents: "none",
    strokeWidth: 2,
    strokeDasharray: "5 4",
  },
  // `canvas-edge-group` composes this style at its own render site, marked
  // via `stylex.defaultMarker()` for `edgeFocusHalo`'s ancestor selector.
  // See `node`'s own comment for why `outline` is unconditional.
  edgeGroup: {
    outline: "none",
  },
  // Merges app.css's two declarations for this selector, the same way
  // `nodeFocusRing` does (design.md D3, case 1).
  edgeFocusHalo: {
    display: { default: "none", [stylex.when.ancestor(":focus-visible")]: "inline" },
    fill: "none",
    stroke: colors.accent,
    pointerEvents: "none",
    strokeWidth: 6,
  },
  groupDisclosureHost: {
    pointerEvents: "none",
  },
  groupDisclosure: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 20,
    height: 20,
    margin: 4,
    padding: 0,
    backgroundColor: "transparent",
    color: { default: colors.textMuted, ":hover": colors.text },
    pointerEvents: "auto",
  },
  // A docking point's drawn forms. The press target over each takes every press.
  pointFree: {
    fill: colors.surface,
    stroke: colors.textMuted,
    strokeWidth: 1.25,
    pointerEvents: "none",
  },
  pointHeld: {
    fill: colors.textMuted,
    pointerEvents: "none",
  },
  // A dashed stroke already means "not there yet": an end has no way out.
  pointEnd: {
    fill: "none",
    stroke: colors.textMuted,
    strokeWidth: 1.25,
    strokeDasharray: "2 2",
    pointerEvents: "none",
  },
  pointSnap: {
    fill: colors.accent,
    pointerEvents: "none",
  },
  pointSnapRing: {
    fill: "none",
    stroke: colors.accent,
    strokeWidth: 2,
    pointerEvents: "none",
  },
  // Transparent counts as painted, so the shape takes the press.
  pointTarget: {
    fill: "transparent",
    cursor: "crosshair",
  },
  pointTargetEnd: {
    cursor: "not-allowed",
  },
  waypointHandle: {
    fill: colors.accent,
    stroke: colors.accent,
    strokeWidth: 1,
    cursor: "grab",
  },
  waypointHandleNew: {
    fill: colors.surface,
  },
  initialArrow: {
    stroke: colors.textMuted,
    strokeWidth: 2,
    fill: "none",
  },
  edge: {
    fill: "none",
    strokeWidth: 1.5,
  },
  edgeAutomatic: {
    stroke: colors.textMuted,
  },
  edgeManual: {
    stroke: colors.textMuted,
    strokeDasharray: "5 4",
  },
  edgeDragging: {
    stroke: colors.accent,
    strokeDasharray: "3 3",
  },
  // Was `.canvas-edge-group-selected .canvas-edge`. `isSelected` is already
  // in scope where the edge `<path>` renders, so this composes directly off
  // that boolean instead of an ancestor selector (design.md D3, case 2).
  edgeSelected: {
    stroke: colors.accent,
  },
  // Was `.canvas-edge-insert-target .canvas-edge`, the same treatment as
  // `edgeSelected` off `isInsertTarget` (design.md D3, case 2).
  edgeInsertTarget: {
    stroke: colors.accent,
    strokeWidth: 3,
    strokeLinecap: "butt",
    strokeLinejoin: "miter",
  },
  edgeHitarea: {
    fill: "none",
    stroke: "transparent",
    strokeWidth: 12,
    cursor: "pointer",
  },
  arrowhead: {
    fill: colors.textMuted,
  },
  // A stamp's host. `overflow: visible`, so a short line estimate never
  // clips a letter; no pointer events, so the node under it keeps the press.
  stampHost: {
    overflow: "visible",
    pointerEvents: "none",
  },
  // A flex column with the stamp at its foot, so a second line grows upward
  // from the node's top edge.
  stampColumn: {
    height: "100%",
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-end",
  },
  stampColumnStart: {
    alignItems: "flex-start",
  },
  stampColumnEnd: {
    alignItems: "flex-end",
  },
  // The register's stamp at canvas scale (design-language.md). Four values
  // repeat `mapWords.ts`'s stamp constants, which `stampLines` estimates
  // from: the 2px rule (`STAMP_RULE`), the 4px inline padding
  // (`STAMP_PADDING_X`), the 13px line (`STAMP_LINE_HEIGHT`), and the 1px
  // block padding `STAMP_CHROME_HEIGHT` leaves after both rules. StyleX
  // evaluates a value at build time and cannot follow an import from a
  // plain module, so they stand as literals here; a test pins each to its
  // constant.
  stamp: {
    boxSizing: "border-box",
    maxWidth: "100%",
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: 600,
    lineHeight: "13px",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    overflowWrap: "anywhere",
    color: colors.text,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: colors.text,
    paddingBlock: 1,
    paddingInline: 4,
  },
  marquee: {
    position: "absolute",
    zIndex: 1,
    backgroundColor: `color-mix(in srgb, ${colors.accent} 8%, transparent)`,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.accent,
    pointerEvents: "none",
  },
  rejectMessage: {
    position: "absolute",
    zIndex: 2,
    transform: "translate(-50%, -100%)",
    backgroundColor: colors.surface,
    color: colors.refusal,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.refusal,
    padding: `${space.s1} ${space.s2}`,
    fontSize: "0.8rem",
    pointerEvents: "none",
    maxWidth: "16rem",
  },
  // Hangs below its point instead, where no room is left above the node.
  rejectMessageBelow: {
    transform: "translate(-50%, 0)",
  },
  // A way out's sentence host. It takes no press, so its empty corners never
  // swallow one meant for a node; the text block below takes them instead.
  edgeLabelHost: {
    pointerEvents: "none",
  },
  // Centres the text block, so one line and six share the placed box's centre.
  edgeLabelBox: {
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  // Six lines, then an ellipsis: the clamp needs all four of its
  // declarations, as `nodeLabel`'s does. `SENTENCE_MAX_LINES` in
  // `sentencePlacement.ts` holds the same six; StyleX cannot read an import.
  edgeLabel: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: "16px",
    textAlign: "start",
    color: colors.textMuted,
    backgroundColor: colors.surface,
    // `SENTENCE_PADDING` in `sentencePlacement.ts`; StyleX cannot read an
    // import, and a test pins the two together.
    paddingInline: 4,
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 6,
    overflow: "hidden",
    overflowWrap: "anywhere",
    pointerEvents: "auto",
    cursor: "pointer",
  },
});

/** Whether a pointer leaving an element of one step lands on that step's node
 * or its docking points, so the step stays pointed at. */
function pointerMovesToStep(e: React.PointerEvent, stepId: string): boolean {
  const to = e.relatedTarget;
  if (!(to instanceof Element)) return false;
  // The selector names attributes only; the id is compared in code, so an id
  // holding a quote or a bracket cannot break it.
  const host = to.closest(".canvas-node[data-step-id], [data-docking-step-id], [data-end-handle-step]");
  if (!host) return false;
  return (
    (host.classList.contains("canvas-node") && host.getAttribute("data-step-id") === stepId) ||
    host.getAttribute("data-docking-step-id") === stepId ||
    host.getAttribute("data-end-handle-step") === stepId
  );
}

/** The drawn positions of the listed steps, for the ones `positions` holds. */
function pointsOf(stepIds: string[], positions: Record<string, Point>): Record<string, Point> {
  const out: Record<string, Point> = {};
  for (const id of stepIds) {
    const at = positions[id];
    if (at) out[id] = at;
  }
  return out;
}

/** The `<g>` holding a drawn group's member nodes. Both disclosure controls —
 * the canvas's own and the selection toolbar's — name it in `aria-controls`,
 * so the id lives here rather than in either caller. */
export function groupMembersDomId(groupId: string): string {
  return `canvas-group-members-${groupId}`;
}

interface Props {
  layout: Record<string, unknown>;
  onMoveStep: (stepId: string, point: Point) => void;
  /** A node or group drag's release: every mover's new position and the
   * docking points the move stores, for one layout write. */
  onMoveSteps: (positions: Record<string, Point>, points: Record<string, PathDockingEnds>) => void;
  /** Overwrites every step's position at once and clears every waypoint and
   * every stored docking point, behind its own confirm gate (design.md, Decisions 2, 4 and 5). */
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
  /** Opens the Steps tab on one step, after the selection is written. Enter
   * and a double-click call it; a single press never does. A click has to
   * leave the author on the canvas: shift-click builds a set and the delete
   * control acts on one, and neither survives a press that switches tabs
   * (`studio-canvas`'s "Every canvas gesture ... SHALL stay live"). A
   * `pathId` asks for that way out's Ways out section, open again even where
   * the same way out stays selected (design.md D7). */
  onOpenStepPage?: (stepId: string, pathId?: string) => void;
  /** Canvas-wide, never per path (design.md). `EditScreen` resolves an absent
   * or unknown stored value to the default before it reaches here. */
  edgeStyle: EdgeStyle;
  onEdgeStyleChange: (style: EdgeStyle) => void;
  selectedPathId?: string;
  /** Per path id, in the same opaque `layout` blob as node positions. An
   * absent or malformed entry reads as no waypoints (design.md). */
  waypoints: Record<string, Point[]>;
  /** Every path's stored docking ends, read from `layout.dockingPoints` by
   * `readDockingPoints`; keyed by path id. */
  dockingPoints: Record<string, PathDockingEnds>;
  onWaypointsChange: (pathId: string, points: Point[]) => void;
  /** Replaces one path's stored docking ends in the draft layout. A connect
   * drag calls it for the path it adds, and an end handle release calls it for
   * the path it re-hangs. The optional third argument holds the drawn
   * positions of the steps a connect drag joins; each lands in the same layout
   * write unless that step already stores a position. */
  onDockingPointsChange: (pathId: string, ends: PathDockingEnds, drawn?: Record<string, Point>) => void;
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
   * group; adds no permanent control. */
  insertTargetPathId?: string;
  /** False while the Map tab hides. Every tab body stays mounted and five
   * hide, so this canvas can mount inside a `hidden` subtree, where the SVG
   * measures zero and the auto-fit below would frame nothing and then latch.
   * The fit waits for the tab to open instead. Defaults to true, so a caller
   * that stands the canvas alone needs no flag. */
  visible?: boolean;
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
 * Whether the clamp on `ref`'s element cut `text`. A label carries its full
 * text as a hover title only where this reads true.
 *
 * The `title` is the only reveal a sighted pointer user has, so it carries a
 * meaning worth keeping: a tooltip on every label, cut or not, stops saying
 * "there is more text here". It therefore rides the measurement rather than
 * the text.
 *
 * The state opens `true` so the server-rendered markup and the first paint
 * both carry it, and the effect clears it on a text that fits. The reverse
 * default would flash a label with no tooltip and render SSR markup that
 * contradicts the client.
 */
function useClipped(ref: React.RefObject<HTMLElement | null>, text: string): boolean {
  const [clipped, setClipped] = useState(true);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // A `ResizeObserver` and not a one-shot measurement, because the box
    // changes without the text changing. Every tab body stays mounted and
    // `EditScreen`'s `tabBodyHidden` is `display: none`, so a label edited on
    // the Steps tab re-renders while the canvas lays out at zero. Measured on
    // a one-shot: the node came back to a visible canvas clamped and with no
    // title. The zero guard leaves the state alone until the observer is
    // called again with a real box.
    const measure = (): void => {
      if (el.clientHeight === 0) return;
      setClipped(el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, text]);
  return clipped;
}

/** A step node's label, over one or two lines, with the full text on hover
 * where the clamp cut it. */
function NodeLabel({ label }: { label: string }): React.JSX.Element {
  const line = useRef<HTMLDivElement | null>(null);
  const clipped = useClipped(line, label);
  return (
    <div {...stylex.props(styles.nodeLabelBox)} aria-hidden="true" title={clipped ? label : undefined}>
      <div ref={line} {...stylex.props(styles.nodeLabel)}>
        {label}
      </div>
    </div>
  );
}

/**
 * One stamp across a node's top edge, in node coordinates (design.md D4). The
 * host ends `STAMP_INSET` below the top edge and grows upward one line at a
 * time, by `stampLines`' estimate, so `getBBox()` frames the stamp's real
 * extent. Its words stand in the node's accessible name, so the stamp leaves
 * the accessibility tree.
 */
function NodeStamp({ text, corner, width }: { text: string; corner: "start" | "end"; width: number }): React.JSX.Element {
  const height = stampLines(text, width) * STAMP_LINE_HEIGHT + STAMP_CHROME_HEIGHT;
  return (
    <foreignObject
      x={corner === "start" ? STAMP_INSET : NODE_WIDTH - STAMP_INSET - width}
      y={STAMP_INSET - height}
      width={width}
      height={height}
      {...stylex.props(styles.stampHost)}
    >
      <div {...stylex.props(styles.stampColumn, corner === "start" ? styles.stampColumnStart : styles.stampColumnEnd)}>
        <div {...stylex.props(styles.stamp)} aria-hidden="true">
          {text}
        </div>
      </div>
    </foreignObject>
  );
}

/**
 * A way out's sentence, at the box `placeSentences` chose for it, over up to
 * six lines (design.md D5). The host is the box's width wide and six lines
 * high, centred on the box. The path's own name carries the sentence, so the
 * text block leaves the accessibility tree. It takes the press its host does
 * not.
 */
function EdgeLabel({
  box,
  text,
  stepId,
  pathId,
  onPress,
  onSelect,
  onOpen,
}: {
  box: SentenceBox;
  text: string;
  stepId: string;
  pathId: string | undefined;
  onPress: () => void;
  onSelect: () => void;
  onOpen: () => void;
}): React.JSX.Element {
  const block = useRef<HTMLDivElement | null>(null);
  const clipped = useClipped(block, text);
  return (
    <foreignObject
      x={box.x}
      y={box.y + box.height / 2 - SENTENCE_HOST_HEIGHT / 2}
      width={box.width}
      height={SENTENCE_HOST_HEIGHT}
      className={`panzoom-exclude ${stylex.props(styles.edgeLabelHost).className}`}
      data-path-id={pathId}
      data-step-id={pathId !== undefined ? stepId : undefined}
    >
      <div {...stylex.props(styles.edgeLabelBox)}>
        <div
          ref={block}
          {...stylex.props(styles.edgeLabel)}
          aria-hidden="true"
          title={clipped ? text : undefined}
          // The press takes the roving stop, as a press on the line does.
          onPointerDown={onPress}
          // The mouse press's default would move focus off the path the
          // press just focused, to the canvas `<svg>`. Click, pointerup and
          // double-click still fire.
          onMouseDown={(e) => e.preventDefault()}
          onPointerUp={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
        >
          {text}
        </div>
      </div>
    </foreignObject>
  );
}

/**
 * Interactive, hand-rolled SVG canvas (design.md: not Mermaid, not a graph
 * library). Node position writes to `saveState.layout` via `onMoveSteps`
 * and `onMoveStep` (not the Draft model); path creation writes through `useDraft()`/
 * `mutate()`, the same surface `PathsPanel`'s "add path" action uses.
 */
export function CanvasView({
  layout,
  onMoveStep,
  onMoveSteps,
  onArrange,
  selectedStepIds,
  onSelectStep,
  onSelectSteps,
  onOpenStepPage,
  selectedPathId,
  edgeStyle,
  onEdgeStyleChange,
  waypoints,
  dockingPoints,
  onWaypointsChange,
  onDockingPointsChange,
  groups,
  onGroupsChange,
  insertTargetPathId,
  visible = true,
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
    //   - `.canvas-wrap` is `overflow: clip`. A transform can otherwise
    //     grow an ancestor's scrollable overflow, and a classic scrollbar
    //     appearing re-lays out a `width: 100%` child, which would feed the
    //     zoom back into the measurement after all. A clip box is no scroll
    //     container, so a focus can never scroll it either.
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

    return computeFit(content, element, fitInsets(toolbarBottom));
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
      // Panzoom writes the parent's overflow inline, so the class alone loses.
      overflow: "clip",
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
  }, []);

  // Neither computation reads pointer/drag state, so without memoization
  // both re-run on every pointer-move event during a drag for nothing.
  // Keyed on their actual inputs only.
  const drawn = useMemo(() => drawnPositions(steps as LayoutStep[], initialStepId, layout), [steps, initialStepId, layout]);
  // The origin here answers a lookup miss, not the resolution's own last
  // resort, which `drawnPositions` already applies. A selection or a group can
  // name a step the draft no longer holds, and that id is in no record.
  const positionOf = (stepId: string): Point => drawn[stepId] ?? { x: 0, y: 0 };

  const nodePositions: NodePosition[] = useMemo(
    () => steps.filter((s) => s.id).map((s) => ({ id: s.id as string, ...positionOf(s.id as string) })),
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

  // Every path that draws, routed, with the sentence its line carries. Read
  // by the edge pass below and by the sentence placement. Keyed on the
  // committed geometry, which is also what the routes follow, so a pointer
  // move during a drag re-runs neither.
  const drawnPaths = useMemo(() => {
    const out: Array<{
      step: (typeof steps)[number];
      path: NonNullable<(typeof steps)[number]["paths"]>[number];
      pathIndex: number;
      routed: ReturnType<typeof routeThroughWaypoints>;
      mid: ReturnType<typeof midpointOfRoute>;
      sentence: string | undefined;
      sentenceKey: string;
      pathWaypoints: Point[];
    }> = [];
    for (const step of steps) {
      if (!step.id) continue;
      const operands = buildOperands({
        fields: draft.fields,
        locale: contentLocale,
        baseLocale,
        child: loadedChildren[step.id],
      });
      for (const [pathIndex, path] of (step.paths ?? []).entries()) {
        if (!path.to) continue;
        // Both anchors depend on the target, so they resolve per path
        // rather than once per step: one step's paths can leave four
        // different sides. With waypoints they face the first and the
        // last of those instead.
        const pathWaypoints = (path.id !== undefined ? waypoints[path.id] : undefined) ?? [];
        const storedEnds = path.id !== undefined ? dockingPoints[path.id] : undefined;
        // A collapsed group's box stands in for a hidden member, so the
        // route ends on the box rather than on a step nobody can see. Two
        // members of one collapsed group have nothing to draw between.
        const sourceBox = anchorBoxFor(step.id, groups, positionsById);
        const targetBox = anchorBoxFor(path.to, groups, positionsById);
        if (!sourceBox || !targetBox) continue;
        if (hidden.has(step.id) && hidden.has(path.to) && sourceBox.x === targetBox.x && sourceBox.y === targetBox.y) {
          continue;
        }
        const routed = routeThroughWaypoints(
          { x: sourceBox.x, y: sourceBox.y },
          { x: targetBox.x, y: targetBox.y },
          pathWaypoints,
          {
            source: { width: sourceBox.width, height: sourceBox.height },
            target: { width: targetBox.width, height: targetBox.height },
          },
          // A box on a collapsed group takes the automatic side, whatever its
          // hidden member stores. The stored entry stays in the layout.
          {
            source: hidden.has(step.id) ? undefined : storedEnds?.source,
            target: hidden.has(path.to) ? undefined : storedEnds?.target,
          },
        );
        out.push({
          step,
          path,
          pathIndex,
          routed,
          // The sentence follows the route, not a straight line between the
          // anchors. On a five-segment route those two points are nowhere
          // near each other.
          mid: midpointOfRoute(routed.points),
          // The sentence the line draws is also the sentence the path's
          // accessible name reads, so the guard parses once for both.
          sentence: wayOutSentence(path, step, operands),
          sentenceKey: path.id ?? `${step.id}-${pathIndex}-sentence`,
          pathWaypoints,
        });
      }
    }
    return out;
  }, [steps, draft.fields, contentLocale, baseLocale, loadedChildren, waypoints, dockingPoints, groups, positionsById, hidden]);

  // The docking points a path end sits on, per step: `side:at` keys. A step
  // hidden in a collapsed group has no point, and its box draws none.
  const heldPoints = useMemo(() => {
    const held = new Map<string, Set<string>>();
    const hold = (stepId: string, anchor: Point | undefined) => {
      const at = positionsById[stepId];
      if (!anchor || !at || hidden.has(stepId)) return;
      const end = dockingEndOfAnchor(at, anchor);
      if (!end) return;
      const keys = held.get(stepId) ?? new Set<string>();
      keys.add(`${end.side}:${end.at}`);
      held.set(stepId, keys);
    };
    for (const { step, path, routed } of drawnPaths) {
      hold(step.id as string, routed.points[0]);
      if (path.to) hold(path.to, routed.points[routed.points.length - 1]);
    }
    return held;
  }, [drawnPaths, positionsById, hidden]);

  // Where each sentence stands (design.md D5): clear of every drawn node, its
  // label and its stamps, the start arrow, every arrowhead, every group's
  // name or collapsed box, and the sentences placed before it. A hidden Map tab
  // places nothing and draws no sentence; the render that shows the tab places
  // them all before it paints.
  const sentenceBoxes = useMemo(() => {
    if (!visible) return new Map<string, SentenceBox>();
    const obstacles: Obstacle[] = [];
    for (const step of steps) {
      if (!step.id || hidden.has(step.id)) continue;
      const at = positionsById[step.id];
      if (!at) continue;
      obstacles.push(
        nodeObstacle(at),
        labelObstacle(at),
        ...stampObstacles(stampWords(step, initialStepId), at),
      );
      if (step.id === initialStepId) obstacles.push(startArrowObstacle(at));
    }
    for (const { group, box } of groupBoxes) {
      if (!box) continue;
      obstacles.push(...(group.collapsed ? [nodeObstacle(box), labelObstacle(box)] : [groupNameObstacle(box, group.name)]));
    }
    for (const drawnPath of drawnPaths) obstacles.push(arrowheadObstacle(drawnPath.routed.points));
    const sentences: SentenceInput[] = [];
    for (const drawnPath of drawnPaths) {
      if (drawnPath.sentence === undefined) continue;
      sentences.push({
        key: drawnPath.sentenceKey,
        text: drawnPath.sentence,
        route: drawnPath.routed.points,
        midpoint: drawnPath.mid.point,
      });
    }
    return placeSentences(sentences, obstacles);
  }, [visible, drawnPaths, steps, hidden, positionsById, initialStepId, groupBoxes]);

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
  // `start` is the press point, so a release under the click threshold reads
  // as a click and writes nothing.
  const [connectDrag, setConnectDrag] = useState<{
    sourceStepId: string;
    pressed: DockingEnd;
    refused: boolean;
    start: Point;
    current: Point;
  } | null>(null);
  // An end handle drag: the end's own step and the point it held at the press.
  const [endDrag, setEndDrag] = useState<(EndHandleSpec & { start: Point; current: Point }) | null>(null);
  // The step the pointer rests on, whose docking points draw. Its own state,
  // outside every memo above: a pointer crossing ten steps redraws ten sets of
  // points and no route.
  const [pointedStepId, setPointedStepId] = useState<string | undefined>(undefined);
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
  const [rejectMessage, setRejectMessage] = useState<{ text: string; x: number; y: number; below: boolean } | null>(null);
  const rejectTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
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
    elementFor(next)?.focus({ preventScroll: true });
  };

  // A focus the canvas stops drawing — its group collapsed, its step deleted
  // from a panel — would leave no element carrying the stop, and the canvas
  // would drop out of the page's tab order. The DOM answers that directly.
  // Layout, not passive, so no frame paints without a stop; keyed on the
  // inputs that can invalidate a focus, so the re-render it causes cannot
  // re-enter it.
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    if (svg.tabIndex === 0 || svg.querySelector('[tabindex="0"]')) return;
    setFocus(entryFocus(steps, groups, initialStepId));
  }, [steps, groups, hidden]);

  const toSvgPoint = (e: { clientX: number; clientY: number }): Point => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    return svgPointFromClient(svg, e.clientX, e.clientY);
  };

  // The polite live region's text. Empty on the first commit, so the first
  // message reaches a screen reader.
  const [announcement, setAnnouncement] = useState("");
  const announcedRef = useRef("");
  const announceFrame = useRef(0);
  /** Speaks `text`. A repeat clears the region first and writes one frame
   * later, so the reader speaks it again. */
  const announce = (text: string) => {
    cancelAnimationFrame(announceFrame.current);
    if (announcedRef.current === text) setAnnouncement("");
    announcedRef.current = text;
    announceFrame.current = requestAnimationFrame(() => setAnnouncement(text));
  };
  useEffect(() => () => cancelAnimationFrame(announceFrame.current), []);

  const announceZoom = (scale: number) => announce(t("canvas.zoomAnnounce").replace("{percent}", String(Math.round(scale * 100))));

  /** Zooms by one key step about the focused element's centre; a root focus
   * anchors at the view centre. */
  const zoomByKey = (factor: number) => {
    const panzoom = panzoomRef.current;
    const svg = svgRef.current;
    const frame = svg?.parentElement;
    if (!panzoom || !svg || !frame) return;
    const view = { width: frame.clientWidth, height: frame.clientHeight };
    let anchor = { x: view.width / 2, y: view.height / 2 };
    const active = document.activeElement;
    if (active && active !== svg && svg.contains(active)) {
      const rect = active.getBoundingClientRect();
      const frameRect = frame.getBoundingClientRect();
      anchor = {
        x: rect.left + rect.width / 2 - frameRect.left - frame.clientLeft,
        y: rect.top + rect.height / 2 - frameRect.top - frame.clientTop,
      };
    }
    const pan = panzoom.getPan();
    const current: Fit = { scale: panzoom.getScale(), x: pan.x, y: pan.y };
    const next = zoomAbout(current, current.scale * factor, anchor, view);
    panzoom.zoom(next.scale, { animate: false });
    panzoom.pan(next.x, next.y, { animate: false });
    announceZoom(next.scale);
  };

  const fitToView = () => {
    const panzoom = panzoomRef.current;
    const svg = svgRef.current;
    if (!panzoom || !svg || nodePositions.length === 0) return;
    const fit = measureFit(svg);
    panzoom.zoom(fit.scale, { animate: false });
    panzoom.pan(fit.x, fit.y, { animate: false });
  };

  /** Pans the focused element into the frame by the least distance. The frame
   * never transforms, so its rect and border give one pixel space for a node,
   * a path and a disclosure button alike. A pointer focus and a root focus
   * reveal nothing. */
  const revealRect = (rect: { left: number; top: number; width: number; height: number }) => {
    const panzoom = panzoomRef.current;
    const frame = svgRef.current?.parentElement;
    if (!panzoom || !frame) return;
    const frameRect = frame.getBoundingClientRect();
    const toolbar = toolbarRef.current;
    const toolbarBottom = toolbar ? toolbar.offsetTop + toolbar.offsetHeight : 0;
    const pan = panzoom.getPan();
    const current: Fit = { scale: panzoom.getScale(), x: pan.x, y: pan.y };
    const next = revealPan(
      {
        x: rect.left - frameRect.left - frame.clientLeft,
        y: rect.top - frameRect.top - frame.clientTop,
        width: rect.width,
        height: rect.height,
      },
      { width: frame.clientWidth, height: frame.clientHeight },
      fitInsets(toolbarBottom),
      current,
    );
    if (next.x !== current.x || next.y !== current.y) panzoom.pan(next.x, next.y, { animate: false });
  };

  const revealFocused = (e: React.FocusEvent<SVGSVGElement>) => {
    if (e.target === svgRef.current || lastInputWasPointer()) return;
    revealRect((e.target as Element).getBoundingClientRect());
  };

  // Centers the graph on open, so an author never has to click "Fit to
  // view" just to see what they opened. Layout, not passive, effect:
  // `fitToView` reads `clientWidth`/`getBBox()` off the just-committed DOM,
  // and running before paint means the very first frame is already framed,
  // instead of flashing the raw top-left layout first.
  useLayoutEffect(() => {
    if (hasFitOnLoad.current || nodePositions.length === 0 || !visible) return;
    hasFitOnLoad.current = true;
    fitToView();
  }, [nodePositions, visible]);

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

  /**
   * One layout write for a release that moved steps: every new position, and
   * the docking points of the paths on them. `positionsById` still holds the
   * geometry before the move, which is what the stored points must keep. Only
   * a release past the click threshold calls it.
   */
  const releaseMove = (moved: Record<string, Point>) => {
    if (Object.keys(moved).length === 0) return;
    const paths = steps.flatMap((step) =>
      step.id ? (step.paths ?? []).map((path) => ({ id: path.id, from: step.id as string, to: path.to })) : [],
    );
    onMoveSteps(
      moved,
      pointsAfterMove({ paths, moved: Object.keys(moved), positions: positionsById, stored: dockingPoints, waypoints, groups }),
    );
  };

  const onGroupPointerUp = (e: React.PointerEvent, group: StepGroup) => {
    e.stopPropagation();
    if (!groupDrag) return;
    const delta = dragDelta(groupDrag.startPointer, groupDrag.current);
    setGroupDrag(null);
    if (exceedsClickThreshold(delta)) {
      const moved: Record<string, Point> = {};
      for (const id of group.stepIds) {
        const start = groupDrag.startPos[id];
        if (start) moved[id] = snapToGrid({ x: start.x + delta.x, y: start.y + delta.y });
      }
      releaseMove(moved);
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

  const onEndPointerDown = (e: React.PointerEvent, handle: EndHandleSpec) => {
    e.stopPropagation();
    capturePointer(e);
    const p = toSvgPoint(e);
    setEndDrag({ ...handle, start: p, current: p });
  };

  const onEndPointerMove = (e: React.PointerEvent) => trackPointer(endDrag, setEndDrag, { current: toSvgPoint(e) });

  /** A release stores the dragged end. The other end keeps what it held, except
   * on a self path that stores no end: `endDropEntry` stores both there. Only
   * the layout changes, never the Draft model. */
  const onEndPointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (!endDrag) return;
    const { pathId, end, stepId, exclude, start } = endDrag;
    const point = toSvgPoint(e);
    setEndDrag(null);
    if (!exceedsClickThreshold(dragDelta(start, point))) return;
    const next = resolveEndDrop({ stepId, nodes: visibleNodePositions, point, exclude });
    const entry = endDropEntry(dockingPoints[pathId], end, next, exclude);
    if (entry) onDockingPointsChange(pathId, entry);
  };

  const onWaypointDoubleClick = (e: React.MouseEvent, pathId: string, index: number) => {
    e.stopPropagation();
    onWaypointsChange(pathId, (waypoints[pathId] ?? []).filter((_, i) => i !== index));
  };

  /** The midpoint handle's double-click: the pair the line's double-click
   * calls, so the source step's Ways out opens on this way out. */
  const onMidpointDoubleClick = (e: React.MouseEvent, stepId: string, pathId: string) => {
    e.stopPropagation();
    onSelectStep(stepId, pathId);
    onOpenStepPage?.(stepId, pathId);
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
      const moved: Record<string, Point> = {};
      for (const id of nodeDrag.stepIds) {
        const start = nodeDrag.startPos[id];
        if (start) moved[id] = snapToGrid({ x: start.x + delta.x, y: start.y + delta.y });
      }
      releaseMove(moved);
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

  /** A press on one docking point's target. `pressed` is the point the canvas
   * resolved the press to. */
  const onHandlePointerDown = (e: React.PointerEvent, stepId: string, pressed: DockingEnd) => {
    e.stopPropagation();
    capturePointer(e);
    setRejectMessage(null);
    // The roving stop follows the press, as a press on the node moves it.
    moveFocus({ kind: "step", stepId });
    const p = toSvgPoint(e);
    // The source check runs once, here: it reads nothing the drag changes.
    const source = steps.find((s) => s.id === stepId);
    const refused =
      !source || checkConnectSource(source.terminal === true, source.paths ?? [], triggerForNewPath(source)) !== undefined;
    setConnectDrag({ sourceStepId: stepId, pressed, refused, start: p, current: p });
  };

  const onHandlePointerMove = (e: React.PointerEvent) => trackPointer(connectDrag, setConnectDrag, { current: toSvgPoint(e) });

  /** Shows a refusal at a client point and speaks it. The message is an
   * absolutely positioned child of `.canvas-wrap`, so the point is measured
   * against the frame, which never transforms, inside its border. The box
   * hangs above the point. It stays inside the frame sideways, and with no
   * room above under the toolbar it hangs from `belowClientY` instead. */
  const showRejection = (e: { clientX: number; clientY: number }, text: string, belowClientY?: number) => {
    const frame = svgRef.current?.parentElement;
    const rect = frame?.getBoundingClientRect();
    let x = 0;
    let y = 0;
    let below = false;
    if (frame && rect) {
      const toolbar = toolbarRef.current;
      const top = toolbar ? toolbar.offsetTop + toolbar.offsetHeight : 0;
      const half = Math.min(REFUSAL_BOX_WIDTH, frame.clientWidth) / 2;
      x = Math.max(half, Math.min(e.clientX - rect.left - frame.clientLeft, frame.clientWidth - half));
      y = e.clientY - rect.top - frame.clientTop;
      if (belowClientY !== undefined && y - REFUSAL_BOX_HEIGHT < top) {
        below = true;
        y = belowClientY - rect.top - frame.clientTop;
      }
    }
    setRejectMessage({ text, x, y, below });
    clearTimeout(rejectTimer.current);
    rejectTimer.current = setTimeout(() => setRejectMessage(null), REJECT_MESSAGE_MS);
    announce(text);
  };

  /**
   * Adds a way out from the step at `sourceIndex`, with the trigger a new path
   * out of it takes. A step id target adds the path alone. A point target
   * mints a task step there first, then the path to it. The connect drop and
   * the way-out menu both call this, so the two add the same way out.
   */
  const addWayOut = (
    sourceIndex: number,
    target: { stepId: string } | { at: Point },
    ends?: PathDockingEnds,
  ): { pathId: string; targetId: string } | undefined => {
    const sourceStep = steps[sourceIndex];
    if (!sourceStep?.id) return undefined;
    const existingPaths = sourceStep.paths ?? [];
    const trigger = triggerForNewPath(sourceStep);
    if ("stepId" in target) {
      const targetStep = steps.find((s) => s.id === target.stepId);
      const path = newPath(sourceStep, targetStep, target.stepId, trigger, contentLocale, baseLocale, t("steps.unnamedStep"));
      updateInDraftArray(mutate, (d) => d.workflow?.steps?.[sourceIndex], { paths: [...existingPaths, path] });
      if (path.id && ends) {
        const drawn = pointsOf([sourceStep.id, target.stepId], positionsById);
        onDockingPointsChange(path.id, ends, drawn);
      }
      return path.id ? { pathId: path.id, targetId: target.stepId } : undefined;
    }
    // The step first, then the path (design.md): a refused candidate never
    // reaches here, and this order keeps an orphan step impossible even if the
    // check moves.
    const step = newStep("task", seedLocalizedText(contentLocale));
    const path = newPath(sourceStep, step, step.id, trigger, contentLocale, baseLocale, t("steps.unnamedStep"));
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
    // With points, the new step's position and the source's drawn one travel
    // in the points' own layout write.
    if (step.id && path.id && ends) {
      onDockingPointsChange(path.id, ends, { ...pointsOf([sourceStep.id], positionsById), [step.id]: target.at });
    } else if (step.id) {
      onMoveStep(step.id, target.at);
    }
    return path.id && step.id ? { pathId: path.id, targetId: step.id } : undefined;
  };

  const onHandlePointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (!connectDrag) return;
    const point = toSvgPoint(e);
    // Under the threshold this was a click, not a drag: it writes no way out,
    // the rule the waypoint handle applies. It acts as a press on the node: it
    // selects, and Shift toggles. Without the threshold a click, and each
    // click of a double-click, wrote a way out to the step itself or to a new
    // step at the press point.
    if (!exceedsClickThreshold(dragDelta(connectDrag.start, point))) {
      const { sourceStepId } = connectDrag;
      setConnectDrag(null);
      if (e.shiftKey) onSelectSteps(toggleSelection(selectedStepIds, sourceStepId));
      else onSelectStep(sourceStepId);
      return;
    }
    const sourceIndex = steps.findIndex((s) => s.id === connectDrag.sourceStepId);
    const sourceStep = steps[sourceIndex];

    if (sourceStep?.id) {
      // Visible nodes only: a hidden member is not a connect-drag target, or
      // a release over a collapsed box would create a path to a step nobody
      // can see.
      const result = resolveConnectDrop({
        point,
        nodes: visibleNodePositions,
        sourceStepId: sourceStep.id,
        pressed: connectDrag.pressed,
        existingPaths: sourceStep.paths ?? [],
        trigger: triggerForNewPath(sourceStep),
        sourceTerminal: sourceStep.terminal === true,
      });

      if (result.kind === "rejected") showRejection(e, refusalSentence(result, draft, sourceStep));
      else if (result.kind === "connect-to-step") addWayOut(sourceIndex, { stepId: result.targetStepId }, { source: result.source, target: result.target });
      else addWayOut(sourceIndex, { at: result.point }, { source: result.source });
    }
    setConnectDrag(null);
  };

  const onBackgroundPointerUp = (e: React.PointerEvent) => {
    // A marquee release is not a deselect. It runs on the wrap, after this
    // one, and would otherwise empty the set it had just built.
    if (marquee) return;
    if (e.target === svgRef.current) onSelectStep(undefined);
  };

  /** The step text the node body and both accessible names read: the step
   * page's selects' own text, which never falls back to a key and numbers
   * repeats (design.md D11). */
  const stepTexts = useMemo(() => stepTextMap(steps, contentLocale, baseLocale), [steps, contentLocale, baseLocale]);
  const nameText = (id: string | undefined) => (id !== undefined ? stepTexts.get(id) : undefined) ?? t("steps.unnamedStep");

  // The way-out menu. Its items follow what a connect drop can reach; the
  // source is the step `C` opened it on.
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuSourceId, setMenuSourceId] = useState<string | undefined>(undefined);
  const menuItems = useMemo(() => wayOutMenuItems(steps, hidden, stepTexts), [steps, hidden, stepTexts]);
  // A way out the menu added, waiting for its `<g>` to draw.
  const [pendingPath, setPendingPath] = useState<{ pathId: string; sourceId: string; targetId: string } | undefined>(undefined);

  useLayoutEffect(() => {
    if (!pendingPath) return;
    if (!steps.some((s) => s.paths?.some((p) => p.id === pendingPath.pathId))) {
      setPendingPath(undefined);
      return;
    }
    if (!elementFor({ kind: "path", pathId: pendingPath.pathId, from: "source" })) return;
    setPendingPath(undefined);
    const pathEl = elementFor({ kind: "path", pathId: pendingPath.pathId, from: "source" });
    moveFocus({ kind: "path", pathId: pendingPath.pathId, from: "source" });
    // One pan brings the new way out and the step it ends on into view; it
    // supersedes the focus reveal of the way out alone.
    const pathRect = pathEl?.getBoundingClientRect();
    const stepRect = nodeRectOf(pendingPath.targetId);
    if (pathRect && stepRect) {
      const left = Math.min(pathRect.left, stepRect.left);
      const top = Math.min(pathRect.top, stepRect.top);
      revealRect({
        left,
        top,
        width: Math.max(pathRect.right, stepRect.right) - left,
        height: Math.max(pathRect.bottom, stepRect.bottom) - top,
      });
    }
    announce(fill(t("canvas.wayOutAdded"), { source: nameText(pendingPath.sourceId), target: nameText(pendingPath.targetId) }));
  }, [pendingPath, drawnPaths]);

  /** The node's own box on screen, without its focus ring or its stamps. */
  const nodeRectOf = (stepId: string): DOMRect | undefined =>
    elementFor({ kind: "step", stepId })?.querySelector("rect")?.getBoundingClientRect();

  /** `C` on a step: the menu, or the refusal a connect drop from it shows. */
  const openWayOutMenuOn = (stepId: string) => {
    const source = steps.find((s) => s.id === stepId);
    const rect = nodeRectOf(stepId);
    if (!source || !rect) return;
    const refused = checkConnectSource(source.terminal === true, source.paths ?? [], triggerForNewPath(source));
    if (refused) {
      // The box hangs from this point. A point on the edge itself can round to
      // a gap of a fraction of a pixel, so it sits just inside the node.
      showRejection({ clientX: rect.left + rect.width / 2, clientY: rect.top + REFUSAL_INSET }, refusalSentence(refused, draft, source), rect.bottom);
      return;
    }
    const menu = menuRef.current;
    if (!menu) return;
    setMenuSourceId(stepId);
    openWayOutMenu(menu, rect);
  };

  const onWayOutPicked = (item: WayOutMenuItem) => {
    const sourceIndex = steps.findIndex((s) => s.id === menuSourceId);
    const source = steps[sourceIndex];
    if (!source?.id || item.kind === "separator") return;
    let added: { pathId: string; targetId: string } | undefined;
    if (item.kind === "step") added = addWayOut(sourceIndex, { stepId: item.stepId });
    else {
      // Every step counts, hidden ones too, so the new step never lands on a
      // collapsed group's member.
      const from = positionOf(source.id);
      added = addWayOut(sourceIndex, { at: menuNewStepSpot(from, nodePositions) });
    }
    if (added) setPendingPath({ ...added, sourceId: source.id });
  };

  const onWayOutMenuReturn = () => {
    if (menuSourceId !== undefined) moveFocus({ kind: "step", stepId: menuSourceId });
  };

  /**
   * The canvas's own keyboard. It binds on the `<svg>` rather than on
   * `.canvas-wrap`, which would also catch the toolbar's buttons.
   */
  const onCanvasKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    // A text field owns Enter, Escape and its own caret movement. The canvas
    // draws none today; the guard keeps the rule general. A disclosure button
    // is no text field, so an arrow key and Escape still reach this handler
    // from one.
    if ((e.target as Element).closest("input, textarea, [contenteditable]")) return;
    if (e.key === "Escape") {
      // The stop moves with the focus. Without that move Tab walks straight
      // back in, since the roving `0` would still sit inside the `<svg>`.
      setFocus({ kind: "root" });
      svgRef.current?.focus({ preventScroll: true });
      return;
    }
    if (e.key === "Enter") {
      // A group's disclosure is a real button and answers Enter itself.
      if (focus.kind === "step") {
        onSelectStep(focus.stepId);
        onOpenStepPage?.(focus.stepId);
      } else if (focus.kind === "path") {
        const owner = steps.find((s) => s.paths?.some((p) => p.id === focus.pathId));
        if (owner?.id) {
          onSelectStep(owner.id, focus.pathId);
          onOpenStepPage?.(owner.id, focus.pathId);
        }
      }
      return;
    }
    // A modified key belongs to the browser: Ctrl with `+` zooms the page.
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.toLowerCase() === "c") {
      if (focus.kind !== "step") return;
      // Keeps a browser's find-as-you-type from taking the letter.
      e.preventDefault();
      openWayOutMenuOn(focus.stepId);
      return;
    }
    if (e.key === "+" || e.key === "=" || e.key === "-") {
      e.preventDefault();
      zoomByKey(e.key === "-" ? 1 / ZOOM_KEY_FACTOR : ZOOM_KEY_FACTOR);
      return;
    }
    if (e.key === "0") {
      e.preventDefault();
      fitToView();
      const scale = panzoomRef.current?.getScale();
      if (scale !== undefined) announceZoom(scale);
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

  // Way-out sentences render in their own pass, after every node (below),
  // instead of inline in the edge that computes them: `.canvas-node-rect` is
  // opaque, and nodes draw after edges, so a sentence inline in the edge group
  // could sit partly behind a nearby node's fill and read as a clipped
  // fragment. Collected here during the edge pass, rendered after the node
  // pass.
  const edgeLabels: Array<{ key: string; box: SentenceBox; text: string; stepId: string; pathId: string | undefined }> = [];

  // Waypoint handles ride that same late pass, and for the same reason: a
  // handle inside the edge group sits behind a nearby node's opaque fill.
  // Drawing after the sentences also keeps a handle grabbable where the two
  // share the route's midpoint.
  const waypointHandles: Array<{
    key: string;
    x: number;
    y: number;
    stepId: string;
    pathId: string;
    index?: number;
    insertAt?: number;
  }> = [];

  // The docking points ride the late pass too, after the sentences and the
  // waypoint handles, so no sentence covers a point and takes its press. A
  // sentence may stand over a node's edge where the room runs out.
  const dockingSets: Array<{ stepId: string; x: number; y: number; isTerminal: boolean }> = [];
  // The selected path's end handles ride above the docking points.
  const endHandles: EndHandleSpec[] = [];

  // Which steps draw their points: the selected ones, the step the pointer
  // rests on, and during a connect drag the pressed step and the step under the
  // pointer. A drag ignores the resting pointer, whose events a captured
  // pointer no longer reports. The snap names the point the drag will land on.
  const snap = (() => {
    if (endDrag) {
      const end = resolveEndDrop({ stepId: endDrag.stepId, nodes: visibleNodePositions, point: endDrag.current, exclude: endDrag.exclude });
      const point = end && positionsById[endDrag.stepId] ? dockingAnchor(positionsById[endDrag.stepId], end) : undefined;
      return end && point ? { stepId: endDrag.stepId, point: { ...end, point } } : undefined;
    }
    // A refused source draws no ring: the release shows the refusal.
    if (!connectDrag || connectDrag.refused) return undefined;
    return dropTargetOf(connectDrag.current, visibleNodePositions, connectDrag.sourceStepId, connectDrag.pressed);
  })();
  const dockedStepIds = new Set<string>(selectedStepIds);
  if (connectDrag) {
    dockedStepIds.add(connectDrag.sourceStepId);
    // The step under the pointer draws its points even where the source is
    // refused and no ring shows.
    const under = hitTestGrownNode(connectDrag.current, visibleNodePositions);
    if (under !== undefined) dockedStepIds.add(under);
  } else if (endDrag) {
    dockedStepIds.add(endDrag.stepId);
  } else if (pointedStepId !== undefined) {
    dockedStepIds.add(pointedStepId);
  }

  // The disclosure buttons ride the same late pass, and they need it most: a
  // sentence's text block is up to 200 wide and carries its own pointer
  // handler, and it lands wherever its route has room, so it can cover a
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
    const stamps = stampWords(step, initialStepId);
    const widthOfStamps = stampWidth(stamps);
    // The docking points draw in the late pass, above every sentence, where
    // the node draws now, drag preview included.
    if (dockedStepIds.has(step.id)) dockingSets.push({ stepId: step.id, x, y, isTerminal });

    return (
      <g
        key={step.id}
        data-step-id={step.id}
        transform={`translate(${x}, ${y})`}
        className={`canvas-node panzoom-exclude ${stylex.props(styles.node, stylex.defaultMarker()).className}`}
        role="button"
        aria-keyshortcuts="C"
        tabIndex={focus.kind === "step" && focus.stepId === step.id ? 0 : -1}
        // `outgoing` counts the paths the traversal reaches, the set the edge
        // pass drew.
        aria-label={nodeName(step, nameText(step.id), outgoingCount.get(step.id) ?? 0, stamps)}
        onPointerDown={(e) => onNodePointerDown(e, step.id as string)}
        onPointerUp={(e) => onNodePointerUp(e, step.id as string)}
        onPointerEnter={() => setPointedStepId(step.id)}
        // A move onto the step's own points keeps it pointed at.
        onPointerLeave={(e) => {
          if (!pointerMovesToStep(e, step.id as string)) setPointedStepId(undefined);
        }}
        // The pointer's route to the Steps tab, the pair Enter calls. The
        // first click of the two already selected; this repeats it so the
        // end state matches Enter's.
        onDoubleClick={(e) => {
          e.stopPropagation();
          onSelectStep(step.id as string);
          onOpenStepPage?.(step.id as string);
        }}
      >
        {isInitial && <line x1={-24} y1={NODE_HEIGHT / 2} x2={0} y2={NODE_HEIGHT / 2} {...stylex.props(styles.initialArrow)} markerEnd="url(#canvas-arrow)" />}
        <rect width={NODE_WIDTH} height={NODE_HEIGHT} rx={0} {...stylex.props(styles.nodeRect, isSelected && styles.nodeRectSelected)} />
        {step.type === "subprocess" && (
          // The doubled rule BPMN draws on a call activity. It sits before
          // the label and the stamps.
          <rect x={4} y={4} width={NODE_WIDTH - 8} height={NODE_HEIGHT - 8} rx={0} {...stylex.props(styles.nodeSubprocess)} />
        )}
        {/* The node's body, over one or two lines. All four attributes are
            load-bearing: a `<foreignObject>` with no `height` draws nothing,
            and the outer `<div>` resolves its own `height: 100%` against this
            rect. The 26 units on the right keep the label clear of the
            right side's three docking points. */}
        <foreignObject x={10} y={0} width={NODE_WIDTH - 36} height={NODE_HEIGHT} className="panzoom-exclude">
          <NodeLabel label={nameText(step.id)} />
        </foreignObject>
        {stamps.start !== undefined && <NodeStamp text={stamps.start} corner="start" width={widthOfStamps} />}
        {stamps.end !== undefined && <NodeStamp text={stamps.end} corner="end" width={widthOfStamps} />}
        {/* Last, so nothing the node draws paints over it. A CSS outline does
            not follow an SVG shape, so the ring is an element; the stroke keeps
            its 2px under the canvas zoom, while the offset scales with the
            node, which is what makes it hug the shape. */}
        <rect
          {...stylex.props(styles.nodeFocusRing)}
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
    <>
      <div
        {...stylex.props(styles.wrap)}
        onPointerDownCapture={onCanvasPointerDownCapture}
        onPointerMove={onMarqueePointerMove}
        onPointerUp={onMarqueePointerUp}
        onLostPointerCapture={() => {
          if (marquee) setMarquee(null);
          releasePan();
        }}
      >
        <div className={`panzoom-exclude ${stylex.props(styles.toolbar).className}`} ref={toolbarRef}>
          <button type="button" className="btn btn-secondary" onClick={fitToView}>
            {t("canvas.fitToView")}
          </button>
          <button
            type="button"
            className={`btn btn-secondary ${stylex.props(edgeStyle === "smoothstep" && styles.toolbarToggleActive).className}`}
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
          {...stylex.props(styles.svg)}
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
          onFocus={revealFocused}
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
              <path d="M0,0 L10,5 L0,10 z" {...stylex.props(styles.arrowhead)} />
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
                className={`panzoom-exclude ${stylex.props(styles.group).className}`}
                onPointerDown={(e) => onGroupPointerDown(e, group)}
                onPointerMove={onGroupPointerMove}
                onPointerUp={(e) => onGroupPointerUp(e, group)}
              >
                <rect
                  x={moved.x}
                  y={moved.y}
                  width={box.width}
                  height={box.height}
                  rx={0}
                  {...stylex.props(styles.groupBox, group.collapsed && styles.groupBoxCollapsed)}
                />
                <text
                  x={moved.x + 8}
                  y={group.collapsed ? moved.y + 24 : moved.y - 6}
                  {...stylex.props(styles.groupName, group.collapsed && styles.groupNameCollapsed)}
                >
                  {group.name}
                </text>
                {group.collapsed && (
                  <text x={moved.x + 8} y={moved.y + 44} {...stylex.props(styles.groupCount)}>
                    {members} {t("canvas.groupStepCount")}
                  </text>
                )}
              </g>
            );
          })}

          {drawnPaths.map(({ step, path, pathIndex, routed, mid, sentence, sentenceKey, pathWaypoints }) => {
            const route = routed.points;
            const d = routePath(route, edgeStyle);
            const midX = mid.point.x;
            const midY = mid.point.y;
            const isSelected = path.id !== undefined && path.id === selectedPathId;
            const box = sentenceBoxes.get(sentenceKey);
            if (sentence !== undefined && box !== undefined) {
              edgeLabels.push({ key: sentenceKey, box, text: sentence, stepId: step.id as string, pathId: path.id });
            }
            // Only the selected path shows handles. Every path showing them
            // would put a control every twenty pixels on a busy graph.
            if (isSelected && path.id !== undefined) {
              const pathId = path.id;
              for (const [index, w] of pathWaypoints.entries()) {
                waypointHandles.push({ key: `${pathId}-w${index}`, x: w.x, y: w.y, stepId: step.id as string, pathId, index });
              }
              // The midpoint's own segment names a leg, never a list index:
              // one leg draws as two to six segments.
              waypointHandles.push({
                key: `${pathId}-mid`,
                x: midX,
                y: midY,
                stepId: step.id as string,
                pathId,
                insertAt: legOfSegment(routed.legStarts, mid.segment),
              });
              endHandles.push(
                ...endHandlesOf({
                  pathId,
                  sourceId: step.id as string,
                  targetId: path.to as string,
                  route,
                  positions: positionsById,
                  hidden,
                }),
              );
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
                className={`panzoom-exclude ${stylex.props(styles.edgeGroup, stylex.defaultMarker()).className}`}
                data-kind="edge"
                data-path-id={path.id}
                data-step-id={path.id !== undefined ? step.id : undefined}
                role="button"
                tabIndex={focus.kind === "path" && focus.pathId === path.id ? 0 : -1}
                aria-label={pathName(path, nameText(step.id), nameText(path.to), sentence)}
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
                // Opens the source step's Ways out on this way out, the pair
                // Enter on a focused path calls. A waypoint handle draws
                // outside this group, so its own double-click never lands here.
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  onSelectStep(step.id, path.id);
                  onOpenStepPage?.(step.id as string, path.id);
                }}
              >
                {/* The halo, not a ring: a stroke holds no offset, so a line's
                    indicator is a band around the shape. It shares the edge's
                    own `d` and draws before it, and the 1.5px edge paints over
                    its middle — a manual path keeps its dash, and about 2px of
                    accent reads on each side. */}
                <path d={d} {...stylex.props(styles.edgeFocusHalo)} vectorEffect="non-scaling-stroke" />
                <path
                  d={d}
                  {...stylex.props(
                    styles.edge,
                    path.trigger === "manual" ? styles.edgeManual : styles.edgeAutomatic,
                    isSelected && styles.edgeSelected,
                    isInsertTarget && styles.edgeInsertTarget,
                  )}
                  markerEnd="url(#canvas-arrow)"
                />
                {/* The same `d`, so the pointer target follows the route
                    rather than a straight line the canvas no longer draws.
                    `edgeHitarea` needs `fill: none` for that: a
                    `<line>` cannot fill, a `<path>` can, and a five-segment
                    route encloses area SVG would otherwise paint black. */}
                <path d={d} {...stylex.props(styles.edgeHitarea)} />
              </g>
            );
          })}

          {connectDrag &&
            (() => {
              const source = positionOf(connectDrag.sourceStepId);
              const start = dockingAnchor(source, connectDrag.pressed) ?? source;
              const end = snap?.point.point ?? connectDrag.current;
              return <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} {...stylex.props(styles.edge, styles.edgeDragging)} />;
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

          {edgeLabels.map((label) => (
            <EdgeLabel
              key={label.key}
              box={label.box}
              text={label.text}
              stepId={label.stepId}
              pathId={label.pathId}
              // The press takes the roving stop exactly as the line's does.
              onPress={() => {
                if (label.pathId !== undefined) moveFocus({ kind: "path", pathId: label.pathId, from: "source" });
              }}
              onSelect={() => onSelectStep(label.stepId, label.pathId)}
              onOpen={() => {
                onSelectStep(label.stepId, label.pathId);
                onOpenStepPage?.(label.stepId, label.pathId);
              }}
            />
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
                className={`panzoom-exclude ${stylex.props(styles.waypointHandle, h.index === undefined && styles.waypointHandleNew).className}`}
                onPointerDown={(e) => onWaypointPointerDown(e, h.pathId, { index: h.index, insertAt: h.insertAt })}
                onPointerMove={onWaypointPointerMove}
                onPointerUp={onWaypointPointerUp}
                // An existing waypoint's double-click deletes it. The midpoint
                // handle stands over its sentence, so it takes the second click
                // of a double-click on it, and opens the way out as the line
                // does. Its first click stayed under the drag threshold, so it
                // wrote no waypoint.
                onDoubleClick={(e) =>
                  h.index === undefined ? onMidpointDoubleClick(e, h.stepId, h.pathId) : onWaypointDoubleClick(e, h.pathId, h.index)
                }
              />
            );
          })}

          {dockingSets.map((set) => (
            // Out of the accessibility tree, as it was inside the node, whose
            // own name already names the step. The `<title>` still shows on
            // hover.
            <g
              key={set.stepId}
              data-docking-step-id={set.stepId}
              aria-hidden="true"
              onPointerEnter={() => setPointedStepId(set.stepId)}
              // A move back onto the node keeps the step pointed at.
              onPointerLeave={(e) => {
                if (!pointerMovesToStep(e, set.stepId)) setPointedStepId(undefined);
              }}
            >
              {dockingPointsOf({ x: set.x, y: set.y }).map((p) => {
                const key = `${p.side}:${p.at}`;
                const held = heldPoints.get(set.stepId)?.has(key) === true;
                const snapped = snap?.stepId === set.stepId && snap.point.side === p.side && snap.point.at === p.at;
                const target = pressTargetRect(p);
                return (
                  // `panzoom-exclude`, or Panzoom takes the press and pans: a
                  // target reaches outside its node.
                  <g
                    key={key}
                    className="panzoom-exclude"
                    data-docking-point={key}
                    data-docking-held={held}
                    data-docking-end={set.isTerminal ? true : undefined}
                  >
                    {/* The target takes the press, the cursor and the tooltip
                        naming the gesture. The press resolves to the nearest
                        point of the step, whichever shape took it. */}
                    <rect
                      {...target}
                      {...stylex.props(styles.pointTarget, set.isTerminal && styles.pointTargetEnd)}
                      onPointerDown={(e) => {
                        const pressed = pressedDockingPoint({ x: set.x, y: set.y }, toSvgPoint(e)) ?? p;
                        onHandlePointerDown(e, set.stepId, { side: pressed.side, at: pressed.at });
                      }}
                      // The mouse press's default would move focus off the node
                      // the press just focused, to the canvas `<svg>`, which
                      // draws its outline around the whole graph.
                      onMouseDown={(e) => e.preventDefault()}
                      onPointerUp={onHandlePointerUp}
                      // The point belongs to its node: a double-click opens the
                      // step.
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        onSelectStep(set.stepId);
                        onOpenStepPage?.(set.stepId);
                      }}
                    >
                      <title>{t(set.isTerminal ? "canvas.connectHandleEnd" : "canvas.connectHandle")}</title>
                    </rect>
                    {snapped ? (
                      <>
                        <circle cx={p.point.x} cy={p.point.y} r={SNAP_RING_RADIUS} {...stylex.props(styles.pointSnapRing)} />
                        <circle cx={p.point.x} cy={p.point.y} r={SNAP_RADIUS} {...stylex.props(styles.pointSnap)} />
                      </>
                    ) : (
                      <circle
                        cx={p.point.x}
                        cy={p.point.y}
                        r={POINT_RADIUS}
                        {...stylex.props(set.isTerminal ? styles.pointEnd : held ? styles.pointHeld : styles.pointFree)}
                      />
                    )}
                  </g>
                );
              })}
            </g>
          ))}

          {endHandles.map((h) => {
            const dragging = endDrag?.pathId === h.pathId && endDrag.end === h.end;
            return (
              <EndHandle
                key={`${h.pathId}-${h.end}`}
                at={dragging ? (snap?.point.point ?? endDrag.current) : h.anchor}
                pathId={h.pathId}
                end={h.end}
                stepId={h.stepId}
                onPointerLeave={(e) => {
                  if (!pointerMovesToStep(e, h.stepId)) setPointedStepId(undefined);
                }}
                onPointerDown={(e) => onEndPointerDown(e, h)}
                onPointerMove={onEndPointerMove}
                onPointerUp={onEndPointerUp}
              />
            );
          })}

          {/* Last of all, so no route, node, sentence, waypoint handle or
              docking point can take a press meant for a disclosure. A sentence's
              text block is up to 200 wide, carries its own pointer handler, and
              lands wherever its route has room. Each button is a sibling of its
              box `<g>`, so the group's drag handlers never see the press either. */}
          {disclosures.map(({ group, x, y }) => (
            <foreignObject
              key={group.id}
              x={x}
              y={y}
              width={DISCLOSURE_HOST}
              height={DISCLOSURE_HOST}
              // The host stands 4 units clear of the button on every side, and
              // that band lies over a member node's corner at one end and over
              // empty canvas at the other. `groupDisclosureHost` makes
              // it inert, so only the button's own 20 units take a press.
              className={`panzoom-exclude ${stylex.props(styles.groupDisclosureHost).className}`}
            >
              <button
                type="button"
                {...stylex.props(styles.groupDisclosure)}
                data-group-id={group.id}
                tabIndex={focus.kind === "group" && focus.groupId === group.id ? 0 : -1}
                aria-expanded={group.collapsed !== true}
                aria-controls={groupMembersDomId(group.id)}
                aria-label={t("canvas.groupDisclosure").replace("{group}", group.name)}
                // The press stops here rather than reaching the `<svg>`'s own
                // handlers.
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
        <p {...stylex.props(styles.visuallyHidden)} role="status" aria-live="polite">
          {announcement}
        </p>
        {marquee &&
          (() => {
            // Wrap-relative, so the band covers every part of the visible canvas
            // rather than clipping at the transformed SVG's own viewport.
            const r = normalizeRect(marquee.startClient, marquee.currentClient);
            return (
              <div
                {...stylex.props(styles.marquee)}
                style={{ left: r.x - marquee.origin.x, top: r.y - marquee.origin.y, width: r.width, height: r.height }}
              />
            );
          })()}
        {rejectMessage && (
          <div {...stylex.props(styles.rejectMessage, rejectMessage.below && styles.rejectMessageBelow)} style={{ left: rejectMessage.x, top: rejectMessage.y }}>
            {rejectMessage.text}
          </div>
        )}
      </div>
      {/* Outside the frame: Panzoom's press handler and the wheel zoom bind
          there, and the canvas's own keys bind on the <svg>. */}
      <WayOutMenu menuRef={menuRef} items={menuItems} onPick={onWayOutPicked} onReturnFocus={onWayOutMenuReturn} />
    </>
  );
}
