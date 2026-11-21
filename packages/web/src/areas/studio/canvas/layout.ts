import { isDockingEnd, snapToGrid, type DockingEnd, type Point } from "./geometry";

/** Structural, not the branded schema `Step` — this module only ever reads
 * `id` and `paths[].to`, so it stays decoupled from the full Draft shape. */
export interface LayoutStep {
  id?: string;
  paths?: Array<{ to?: string }>;
}

// Both are whole multiples of `GRID_STEP`, so an auto-placed step already sits
// on the canvas lattice and does not shift the first time an author drags it.
// The row pitch was 110 until that rule arrived.
export const COLUMN_WIDTH = 240;
export const ROW_HEIGHT = 120;

/**
 * Computes a position for every step id absent from `existingLayout`, via a
 * breadth-first traversal from `initialStepId` (depth -> column, traversal
 * order among same-depth steps -> row). A step unreachable from
 * `initialStepId` (including when `initialStepId` itself doesn't resolve)
 * still gets a position, appended one column past the deepest reached depth.
 *
 * Returns positions for the missing steps only — a step already present in
 * `existingLayout` is left untouched (design.md: this is a rendering
 * default, not persisted until the step is dragged). `arrange.ts`'s
 * `arrangeSteps` is the opposite: every step, always, on explicit
 * invocation.
 */
export function autoPlaceSteps(
  steps: LayoutStep[],
  initialStepId: string | undefined,
  existingLayout: Record<string, unknown>,
): Record<string, Point> {
  const missing = steps.filter((s) => s.id && existingLayout[s.id] === undefined);
  if (missing.length === 0) return {};

  const byId = new Map(steps.filter((s): s is LayoutStep & { id: string } => !!s.id).map((s) => [s.id, s]));
  const depth = new Map<string, number>();
  const order: string[] = [];

  if (initialStepId && byId.has(initialStepId)) {
    depth.set(initialStepId, 0);
    const queue = [initialStepId];
    while (queue.length > 0) {
      const id = queue.shift() as string;
      order.push(id);
      const d = depth.get(id) ?? 0;
      for (const path of byId.get(id)?.paths ?? []) {
        if (!path.to || depth.has(path.to) || !byId.has(path.to)) continue;
        depth.set(path.to, d + 1);
        queue.push(path.to);
      }
    }
  }

  const maxDepth = order.length > 0 ? Math.max(...order.map((id) => depth.get(id) ?? 0)) : -1;
  for (const s of steps) {
    if (s.id && !depth.has(s.id)) {
      depth.set(s.id, maxDepth + 1);
      order.push(s.id);
    }
  }

  const rowByDepth = new Map<number, number>();
  const positions = new Map<string, Point>();
  for (const id of order) {
    const d = depth.get(id) ?? 0;
    const row = rowByDepth.get(d) ?? 0;
    rowByDepth.set(d, row + 1);
    positions.set(id, { x: d * COLUMN_WIDTH, y: row * ROW_HEIGHT });
  }

  const result: Record<string, Point> = {};
  for (const s of missing) {
    if (s.id) result[s.id] = positions.get(s.id) ?? { x: 0, y: 0 };
  }
  return result;
}

/**
 * A stored `layout` entry that parses as a point. A malformed one reads as no
 * entry rather than failing the render, the rule the blob's other reserved
 * keys already follow: a draft saved by a later version must still draw.
 */
export function isPoint(value: unknown): value is Point {
  return !!value && typeof (value as Point).x === "number" && typeof (value as Point).y === "number";
}

/**
 * Every step's drawn position, keyed by step id. This is the position
 * `CanvasView` renders a node at, and the position a placement must test
 * against.
 *
 * Three sources answer, in order. A stored `layout` entry wins where it parses
 * as a point, so a step keeps where its author dragged it. A step absent from
 * the blob takes the `autoPlaceSteps` default, which is what the canvas draws
 * for a step nobody has dragged. A step neither source places takes the
 * origin, so a caller never reads `undefined` out of the record.
 *
 * The rule has this one home. `CanvasView.positionOf` and the canvas bar's own
 * press both call it, so the nodes an author sees and the nodes a new step is
 * placed clear of cannot disagree.
 */
export function drawnPositions(
  steps: LayoutStep[],
  initialStepId: string | undefined,
  layout: Record<string, unknown>,
): Record<string, Point> {
  const autoPlaced = autoPlaceSteps(steps, initialStepId, layout);
  const drawn: Record<string, Point> = {};
  for (const s of steps) {
    if (!s.id) continue;
    const stored = layout[s.id];
    drawn[s.id] = isPoint(stored) ? stored : (autoPlaced[s.id] ?? { x: 0, y: 0 });
  }
  return drawn;
}

/** The stored ends of one path. Either end may be absent. */
export interface PathDockingEnds {
  source?: DockingEnd;
  target?: DockingEnd;
}

/**
 * Every path's stored docking ends, keyed by path id, from `layout.dockingPoints`.
 * An end that is not a well-formed `DockingEnd` drops, and so does an entry left
 * with no end, so a draft saved by a later version still draws.
 */
export function readDockingPoints(layout: Record<string, unknown>): Record<string, PathDockingEnds> {
  const stored = layout.dockingPoints;
  const out: Record<string, PathDockingEnds> = {};
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return out;
  for (const [pathId, entry] of Object.entries(stored as Record<string, unknown>)) {
    if (!entry || typeof entry !== "object") continue;
    const { source, target } = entry as { source?: unknown; target?: unknown };
    const ends: PathDockingEnds = {};
    if (isDockingEnd(source)) ends.source = source;
    if (isDockingEnd(target)) ends.target = target;
    if (ends.source || ends.target) out[pathId] = ends;
  }
  return out;
}

/**
 * A copy of `layout` with one path's stored ends replaced. An entry with no end
 * leaves no key, so a reset does not grow the blob. A stored value that is no
 * plain object starts the record over. The input is not mutated.
 */
export function withDockingPoints(
  layout: Record<string, unknown>,
  pathId: string,
  ends: PathDockingEnds,
): Record<string, unknown> {
  const stored = layout.dockingPoints;
  const next: Record<string, PathDockingEnds> =
    stored && typeof stored === "object" && !Array.isArray(stored) ? { ...(stored as Record<string, PathDockingEnds>) } : {};
  const entry: PathDockingEnds = {};
  if (ends.source) entry.source = ends.source;
  if (ends.target) entry.target = ends.target;
  if (entry.source || entry.target) next[pathId] = entry;
  else delete next[pathId];
  return { ...layout, dockingPoints: next };
}

/**
 * The layout after an arrange: every arranged step at its grid-snapped
 * position, and no waypoint and no docking point left on any path.
 */
export function layoutAfterArrange(
  layout: Record<string, unknown>,
  arranged: Record<string, Point>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...layout, waypoints: {}, dockingPoints: {} };
  for (const [stepId, point] of Object.entries(arranged)) next[stepId] = snapToGrid(point);
  return next;
}

/**
 * The layout after a step drops onto a path: the new step's position, the split
 * path's waypoints cleared, its source end kept and its target end cleared.
 */
export function layoutAfterInsert(
  layout: Record<string, unknown>,
  stepId: string,
  point: Point,
  splitPathId: string,
): Record<string, unknown> {
  const waypoints = { ...(layout.waypoints as Record<string, Point[]> | undefined) };
  delete waypoints[splitPathId];
  const { source } = readDockingPoints(layout)[splitPathId] ?? {};
  return withDockingPoints({ ...layout, [stepId]: point, waypoints }, splitPathId, { source });
}

/**
 * The layout after a step move: every moved position and every path's stored
 * ends in one result. A path absent from `points` keeps its entry.
 */
export function layoutAfterMove(
  layout: Record<string, unknown>,
  positions: Record<string, Point>,
  points: Record<string, PathDockingEnds>,
): Record<string, unknown> {
  let next: Record<string, unknown> = { ...layout, ...positions };
  for (const [pathId, ends] of Object.entries(points)) next = withDockingPoints(next, pathId, ends);
  return next;
}
