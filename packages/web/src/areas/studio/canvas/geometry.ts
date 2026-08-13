export const NODE_WIDTH = 180;
export const NODE_HEIGHT = 60;

/**
 * The canvas lattice, in SVG user units, matching the dot pitch `.canvas-wrap`
 * paints. Every layout constant is a whole multiple of it, so an auto-placed
 * step already sits on the lattice and does not shift on its first drag.
 *
 * It lives here rather than in `CanvasView.tsx` so a later waypoint or control
 * point (stages 30 to 33) rounds the same way rather than its own way.
 */
export const GRID_STEP = 20;

/**
 * The nearest lattice point. Called at all three sites that write a position —
 * a drag's release, the drag preview, and a palette drop — so the node under
 * the pointer is the node the author gets. Rounding at the write path alone
 * would leave the preview unrounded and make it jump on release.
 */
export function snapToGrid(point: Point): Point {
  return { x: Math.round(point.x / GRID_STEP) * GRID_STEP, y: Math.round(point.y / GRID_STEP) * GRID_STEP };
}

export interface Point {
  x: number;
  y: number;
}

export interface NodePosition extends Point {
  id: string;
}

/**
 * Point-in-bounding-box hit test against each node's top-left-anchored
 * `NODE_WIDTH`x`NODE_HEIGHT` rect. Iterates back-to-front so the
 * last-drawn (topmost) node wins on overlap.
 */
export function hitTestNode(point: Point, nodes: NodePosition[]): string | undefined {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    if (point.x >= n.x && point.x <= n.x + NODE_WIDTH && point.y >= n.y && point.y <= n.y + NODE_HEIGHT) {
      return n.id;
    }
  }
  return undefined;
}

/** Delta between a drag's start and current pointer position. */
export function dragDelta(start: Point, current: Point): Point {
  return { x: current.x - start.x, y: current.y - start.y };
}

/**
 * How far a pointer travels before a press counts as a drag rather than a
 * click, in SVG user units.
 */
export const CLICK_THRESHOLD = 4;

/**
 * Whether a pointer movement was a drag. Sits beside `dragDelta` rather than
 * inside the event handler because it decides whether a position is written at
 * all: the snap runs only past this line, so a click can never round its own
 * step onto the lattice.
 */
export function exceedsClickThreshold(delta: Point): boolean {
  return Math.abs(delta.x) > CLICK_THRESHOLD || Math.abs(delta.y) > CLICK_THRESHOLD;
}

/**
 * Screen (client) coordinates to the SVG's own user space, through its
 * current pan/zoom transform. `CanvasView.tsx`'s own node/handle drags used
 * this inline before the palette (task 2.3) needed the same conversion from
 * outside the canvas element — one function, so a screen point resolves to
 * the same canvas point regardless of which drag gesture asks.
 */
export function svgPointFromClient(svg: SVGSVGElement, clientX: number, clientY: number): Point {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const transformed = pt.matrixTransform(ctm.inverse());
  return { x: transformed.x, y: transformed.y };
}

/** The two edge styles the canvas offers. There is no straight style. */
export type EdgeStyle = "step" | "smoothstep";

export const DEFAULT_EDGE_STYLE: EdgeStyle = "step";

/** The corner radius `smoothstep` draws, before the per-corner clamp below. */
export const EDGE_CORNER_RADIUS = 8;

/** Which side of a node an edge leaves, and so the axis it travels. */
export type LeaveDirection = "right" | "left" | "down" | "up";

export interface EdgeAnchors {
  source: Point;
  target: Point;
  leaving: LeaveDirection;
}

const rightMid = (n: Point): Point => ({ x: n.x + NODE_WIDTH, y: n.y + NODE_HEIGHT / 2 });
const leftMid = (n: Point): Point => ({ x: n.x, y: n.y + NODE_HEIGHT / 2 });
const bottomMid = (n: Point): Point => ({ x: n.x + NODE_WIDTH / 2, y: n.y + NODE_HEIGHT });
const topMid = (n: Point): Point => ({ x: n.x + NODE_WIDTH / 2, y: n.y });

const SIDE: Record<LeaveDirection, (n: Point) => Point> = {
  right: rightMid,
  left: leftMid,
  down: bottomMid,
  up: topMid,
};

const OPPOSITE: Record<LeaveDirection, LeaveDirection> = { right: "left", left: "right", down: "up", up: "down" };

const centreOf = (n: Point): Point => ({ x: n.x + NODE_WIDTH / 2, y: n.y + NODE_HEIGHT / 2 });

/**
 * The side of one node facing a point, and that side's own midpoint. The
 * larger offset from the node's centre picks the axis.
 *
 * The tie takes the horizontal. A zero offset on the chosen axis takes the
 * right side: `|dx| >= |dy|` with `dx` at zero forces `dy` to zero too, so the
 * only state reaching that branch is a point at the node's own centre, and an
 * edge still has to draw.
 */
export function anchorSideToward(node: Point, toward: Point): { anchor: Point; leaving: LeaveDirection } {
  const centre = centreOf(node);
  const dx = toward.x - centre.x;
  const dy = toward.y - centre.y;
  const leaving: LeaveDirection =
    Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "right" : "left") : dy >= 0 ? "down" : "up";
  return { anchor: SIDE[leaving](node), leaving };
}

/**
 * The two anchors for an edge between two nodes with no waypoints. The source
 * faces the target's centre, and the target takes the opposing side.
 *
 * Opposing by construction rather than by a second comparison: two nodes
 * stacked on one position have a zero offset both ways, and facing back would
 * put both anchors on the same right side and collapse the route to a point.
 */
export function anchorsForEdge(source: Point, target: Point): EdgeAnchors {
  const from = anchorSideToward(source, centreOf(target));
  return { source: from.anchor, target: SIDE[OPPOSITE[from.leaving]](target), leaving: from.leaving };
}

/** Whether a side leaves along the x axis or the y axis. */
const axisOf = (d: LeaveDirection): "x" | "y" => (d === "right" || d === "left" ? "x" : "y");

/**
 * One leg of a waypointed route: an L, or a straight line when the two points
 * already share an axis. `leading` is the axis the leg travels first.
 *
 * A leg carries no gutter, and the browser check earned that. `routeEdge`'s
 * gutter exists to clear the node an anchor sits on. A waypoint has no box to
 * clear, so a gutter there turns back on itself and draws a 20-unit spike out
 * of the route's own apex.
 */
function routeLeg(from: Point, to: Point, leading: "x" | "y"): Point[] {
  if (from.x === to.x || from.y === to.y) return [from, to];
  return leading === "x" ? [from, { x: to.x, y: from.y }, to] : [from, { x: from.x, y: to.y }, to];
}

export interface WaypointRoute {
  points: Point[];
  /** Index into `points` at which each leg begins. One entry per leg. */
  legStarts: number[];
}

/**
 * The route from one node to another through an ordered waypoint list.
 *
 * A waypoint feeds the route rather than escaping it, which is the stage 33
 * design of record. The canvas-wide style still governs every segment, since
 * `routePath` rounds corner points and never asks where they came from.
 *
 * The anchors face the first and the last waypoint rather than each other. An
 * edge dragged over a step therefore leaves the top side, which is the whole
 * point of dragging the waypoint up there.
 *
 * A path with no waypoints takes `routeEdge` unchanged, so it draws exactly as
 * it drew before waypoints existed.
 *
 * `legStarts` is not decoration. `midpointOfRoute` returns an index into the
 * drawn polyline's segments, and one leg draws as one or two of them, so that
 * index names nothing in the waypoint list without this map.
 */
export function routeThroughWaypoints(source: Point, target: Point, waypoints: Point[] = []): WaypointRoute {
  if (waypoints.length === 0) {
    const a = anchorsForEdge(source, target);
    return { points: routeEdge(a.source, a.target, a.leaving), legStarts: [0] };
  }

  const from = anchorSideToward(source, waypoints[0]);
  const to = anchorSideToward(target, waypoints[waypoints.length - 1]);
  const chain = [from.anchor, ...waypoints, to.anchor];
  const last = chain.length - 2;

  const points: Point[] = [];
  const legStarts: number[] = [];
  for (let i = 0; i < chain.length - 1; i++) {
    legStarts.push(points.length === 0 ? 0 : points.length - 1);
    // The first leg leaves along its anchor's own axis, and the last one has
    // to ARRIVE along the target anchor's axis, so it leads with the other.
    // A leg between two waypoints leads along its own larger offset.
    const a = chain[i];
    const b = chain[i + 1];
    const leading: "x" | "y" =
      i === 0
        ? axisOf(from.leaving)
        : i === last
          ? axisOf(to.leaving) === "x"
            ? "y"
            : "x"
          : Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)
            ? "x"
            : "y";
    for (const p of routeLeg(a, b, leading)) {
      const tail = points[points.length - 1];
      if (!tail || tail.x !== p.x || tail.y !== p.y) points.push(p);
    }
  }
  return { points, legStarts };
}

/**
 * The leg a route segment belongs to, and so the waypoint index an insert on
 * that segment takes. Leg 0 runs from the source anchor to the first waypoint,
 * so an insert there goes at index 0.
 */
export function legOfSegment(legStarts: number[], segment: number): number {
  let leg = 0;
  for (let i = 0; i < legStarts.length; i++) if (legStarts[i] <= segment) leg = i;
  return leg;
}

/**
 * Maps a point into the canonical space `routeRightward` works in, where the
 * source leaves rightward and the target is entered from its left.
 *
 * Every one of the four composes with itself to the identity, which is what
 * lets the same function map a returned point back. That is worth checking
 * rather than assuming: swap followed by a negated x reaches the canonical
 * space too, and composes to a 180-degree rotation, so every upward edge would
 * return drawn on the far side of the canvas.
 */
const CANONICAL: Record<LeaveDirection, (p: Point) => Point> = {
  right: (p) => p,
  left: (p) => ({ x: -p.x, y: p.y }),
  down: (p) => ({ x: p.y, y: p.x }),
  up: (p) => ({ x: -p.y, y: -p.x }),
};

/**
 * The orthogonal route between two anchors, as its corner points.
 *
 * `leaving` defaults to `right`, the fixed pair every anchor took before
 * floating anchors landed. The transform lives here rather than in
 * `CanvasView`: routing arithmetic in a component would sit outside the pure
 * modules `studio-canvas` requires it to live in.
 */
export function routeEdge(source: Point, target: Point, leaving: LeaveDirection = "right"): Point[] {
  const toCanonical = CANONICAL[leaving];
  return routeRightward(toCanonical(source), toCanonical(target)).map(toCanonical);
}

/**
 * The route in canonical space. The gutter is `GRID_STEP` rather than a
 * constant of its own, so a route's corners land on the same lattice the nodes
 * do.
 *
 * Three cases, and the count reads off BOTH axes. Reading only the x axis was
 * the review's first finding: it makes every route three segments, and the
 * common edge on this canvas is one. `autoPlaceSteps` writes
 * `y: row * ROW_HEIGHT` with `rowByDepth` starting at 0 per depth, so a linear
 * chain of steps sits on one row and every edge in it is straight.
 */
function routeRightward(source: Point, target: Point): Point[] {
  const ahead = target.x > source.x;

  if (ahead && source.y === target.y) return [source, target];

  // The turn sits one gutter out from the source anchor, never at the midpoint
  // between the two. A midpoint lands off the lattice for the ordinary column
  // pitch: COLUMN_WIDTH 240 against NODE_WIDTH 180 puts it 30 out, and 30 is
  // not a whole grid step.
  const outX = source.x + GRID_STEP;

  if (ahead) {
    return dedupe([source, { x: outX, y: source.y }, { x: outX, y: target.y }, target]);
  }

  // Not ahead: the route has to reach the target's entry edge from outside it.
  // It leaves by the gutter, crosses on a row between the two, comes back past
  // the entry edge by the gutter, and turns in.
  const backX = target.x - GRID_STEP;
  // Two anchors on one row leave no row between them, and the midpoint would
  // collapse the route to duplicate points. It dips below instead, clear of
  // both nodes: the anchor sits at the node's middle, so half its height plus
  // a gutter would land off the lattice, and three grid steps clears it and
  // stays on.
  const midY = source.y === target.y ? source.y + GRID_STEP * 3 : snapToGrid({ x: 0, y: (source.y + target.y) / 2 }).y;
  return dedupe([
    source,
    { x: outX, y: source.y },
    { x: outX, y: midY },
    { x: backX, y: midY },
    { x: backX, y: target.y },
    target,
  ]);
}

/**
 * Drops a point identical to the one before it. A zero-length segment carries
 * no direction, so `routePath`'s corner arithmetic would read `Math.sign(0)`
 * and place an arc on an axis the route never travels.
 */
function dedupe(points: Point[]): Point[] {
  return points.filter((p, i) => i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y);
}

/**
 * The point half way along the route by travelled length, and the index of the
 * segment it falls on. The index is not decoration: a guard label bounds its
 * own width by the segment it sits on, and on a five-segment route that
 * segment is not the one between the two anchors.
 */
export function midpointOfRoute(points: Point[]): { point: Point; segment: number } {
  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const d = Math.abs(points[i].x - points[i - 1].x) + Math.abs(points[i].y - points[i - 1].y);
    lengths.push(d);
    total += d;
  }
  if (total === 0) return { point: points[0], segment: 0 };

  let travelled = 0;
  for (let i = 0; i < lengths.length; i++) {
    if (travelled + lengths[i] >= total / 2) {
      const into = total / 2 - travelled;
      const a = points[i];
      const b = points[i + 1];
      const ratio = lengths[i] === 0 ? 0 : into / lengths[i];
      return { point: { x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio }, segment: i };
    }
    travelled += lengths[i];
  }
  return { point: points[points.length - 1], segment: lengths.length - 1 };
}

/** The length of one segment of a route, in user units. */
export function segmentLength(points: Point[], index: number): number {
  const a = points[index];
  const b = points[index + 1];
  if (!a || !b) return 0;
  return Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
}

/**
 * The route as an SVG `d` attribute. `step` joins the corner points directly.
 * `smoothstep` replaces each corner with a quarter-arc, whose radius clamps to
 * half the shorter of the two segments it joins — otherwise a short segment
 * carries an arc that overshoots its own corner. A route with no corner (the
 * common same-row case) carries no arc under either style.
 */
export function routePath(points: Point[], style: EdgeStyle, radius = EDGE_CORNER_RADIUS): string {
  if (points.length < 2) return "";
  if (style === "step" || points.length === 2) {
    return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  }

  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const corner = points[i];
    const next = points[i + 1];
    const r = Math.min(radius, segmentLength(points, i - 1) / 2, segmentLength(points, i) / 2);
    if (r === 0) {
      d += ` L${corner.x},${corner.y}`;
      continue;
    }
    const into = { x: corner.x + Math.sign(prev.x - corner.x) * r, y: corner.y + Math.sign(prev.y - corner.y) * r };
    const out = { x: corner.x + Math.sign(next.x - corner.x) * r, y: corner.y + Math.sign(next.y - corner.y) * r };
    d += ` L${into.x},${into.y} Q${corner.x},${corner.y} ${out.x},${out.y}`;
  }
  const last = points[points.length - 1];
  return `${d} L${last.x},${last.y}`;
}
