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

/**
 * How many steps rightward `freeLatticePoint` walks before it gives up and
 * answers its last candidate.
 *
 * ponytail: a row this long has no realistic process behind it; past this
 * cap the canvas bar's Add step button would need to wrap to a new row or
 * pick an empty region instead of walking further right. Nothing in this
 * codebase approaches the cap today.
 */
const FREE_LATTICE_POINT_STEP_LIMIT = 500;

/**
 * The nearest point at or right of `wanted`, on the lattice, whose
 * `NODE_WIDTH`x`NODE_HEIGHT` rect clears every rect in `placed`. Walks right
 * by `NODE_WIDTH + GRID_STEP` — a whole lattice multiple that a one-cell step
 * could not clear against an inclusive bound — until it finds one.
 *
 * Performs its own rect test rather than importing `nodesInRect` from
 * `selection.ts`, which already imports this module; the reverse import
 * would make a cycle. The test itself is the same inclusive bound
 * `hitTestNode` and `nodesInRect` use, so a step placed edge-to-edge with
 * another still counts as clear.
 */
export function freeLatticePoint(wanted: Point, placed: NodePosition[]): Point {
  let candidate = wanted;
  for (let i = 0; i < FREE_LATTICE_POINT_STEP_LIMIT; i++) {
    const overlapped = placed.some(
      (n) =>
        candidate.x <= n.x + NODE_WIDTH &&
        candidate.x + NODE_WIDTH >= n.x &&
        candidate.y <= n.y + NODE_HEIGHT &&
        candidate.y + NODE_HEIGHT >= n.y,
    );
    if (!overlapped) return candidate;
    candidate = { x: candidate.x + NODE_WIDTH + GRID_STEP, y: candidate.y };
  }
  return candidate;
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

/** A box's own extent. A step node takes `NODE_SIZE`; a collapsed group takes
 * its own, which is why the anchor rule reads a size rather than assuming. */
export interface Size {
  width: number;
  height: number;
}

export const NODE_SIZE: Size = { width: NODE_WIDTH, height: NODE_HEIGHT };

const SIDE: Record<LeaveDirection, (n: Point, z: Size) => Point> = {
  right: (n, z) => ({ x: n.x + z.width, y: n.y + z.height / 2 }),
  left: (n, z) => ({ x: n.x, y: n.y + z.height / 2 }),
  down: (n, z) => ({ x: n.x + z.width / 2, y: n.y + z.height }),
  up: (n, z) => ({ x: n.x + z.width / 2, y: n.y }),
};

const OPPOSITE: Record<LeaveDirection, LeaveDirection> = { right: "left", left: "right", down: "up", up: "down" };

const centreOf = (n: Point, z: Size = NODE_SIZE): Point => ({ x: n.x + z.width / 2, y: n.y + z.height / 2 });

/**
 * The side of one node facing a point, and that side's own midpoint. The
 * larger offset from the node's centre picks the axis.
 *
 * The tie takes the horizontal. A zero offset on the chosen axis takes the
 * right side: `|dx| >= |dy|` with `dx` at zero forces `dy` to zero too, so the
 * only state reaching that branch is a point at the node's own centre, and an
 * edge still has to draw.
 */
export function anchorSideToward(node: Point, toward: Point, size: Size = NODE_SIZE): { anchor: Point; leaving: LeaveDirection } {
  const centre = centreOf(node, size);
  const dx = toward.x - centre.x;
  const dy = toward.y - centre.y;
  const leaving: LeaveDirection =
    Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "right" : "left") : dy >= 0 ? "down" : "up";
  return { anchor: SIDE[leaving](node, size), leaving };
}

/**
 * The two anchors for an edge between two nodes with no waypoints. The source
 * faces the target's centre, and the target takes the opposing side.
 *
 * Opposing by construction rather than by a second comparison: two nodes
 * stacked on one position have a zero offset both ways, and facing back would
 * put both anchors on the same right side and collapse the route to a point.
 */
export function anchorsForEdge(source: Point, target: Point, sizes: { source?: Size; target?: Size } = {}): EdgeAnchors {
  const sz = sizes.source ?? NODE_SIZE;
  const tz = sizes.target ?? NODE_SIZE;
  const from = anchorSideToward(source, centreOf(target, tz), sz);
  return { source: from.anchor, target: SIDE[OPPOSITE[from.leaving]](target, tz), leaving: from.leaving };
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
 * A path with no waypoints and no stored end takes `routeEdge` unchanged, so it
 * draws exactly as it drew before waypoints existed. A stored end anchors on its
 * docking point in place of the turned anchor. With no waypoints, a stored end
 * sends the path to `routeBetweenEnds`. With waypoints, the leg at a stored end
 * leaves along that end's side (`legFromStoredEnd`).
 *
 * `legStarts` is not decoration. `midpointOfRoute` returns an index into the
 * drawn polyline's segments, and one leg draws as one or two of them, so that
 * index names nothing in the waypoint list without this map.
 */
export function routeThroughWaypoints(
  source: Point,
  target: Point,
  waypoints: Point[] = [],
  // A collapsed group's box stands in for a hidden member, and it is not the
  // node size. This is the one function the canvas calls per path, so a size
  // on the anchor rule alone would never reach it.
  sizes: { source?: Size; target?: Size } = {},
  // A stored docking end per side of the path. An end with none, or with one
  // its box lacks, takes the automatic rule.
  ends: { source?: DockingEnd; target?: DockingEnd } = {},
): WaypointRoute {
  const sz = sizes.source ?? NODE_SIZE;
  const tz = sizes.target ?? NODE_SIZE;
  const storedSource = ends.source && dockingAnchor(source, ends.source, sz) ? ends.source : undefined;
  const storedTarget = ends.target && dockingAnchor(target, ends.target, tz) ? ends.target : undefined;
  if (waypoints.length === 0) {
    if (storedSource || storedTarget) {
      let s = routeEndOf(source, sz, storedSource, centreOf(target, tz));
      let t = routeEndOf(target, tz, storedTarget, centreOf(source, sz));
      // Both anchors on one point of one box (a self path) would draw no line.
      // Two boxes that touch keep the zero-length route their shared point gives.
      const oneBox = source.x === target.x && source.y === target.y && sz.width === tz.width && sz.height === tz.height;
      if (oneBox && s.anchor.x === t.anchor.x && s.anchor.y === t.anchor.y) {
        // Two identical stored ends take the automatic loop. One stored end
        // keeps its point, and the other end turns to the opposing side.
        if (storedSource && storedTarget) {
          const a = anchorsForEdge(source, target, sizes);
          return { points: routeEdge(a.source, a.target, a.leaving), legStarts: [0] };
        }
        if (storedSource) t = opposingEnd(t, s);
        else s = opposingEnd(s, t);
      }
      return { points: routeBetweenEnds(s, t), legStarts: [0] };
    }
    const a = anchorsForEdge(source, target, sizes);
    return { points: routeEdge(a.source, a.target, a.leaving), legStarts: [0] };
  }

  const sourceEnd = storedSource && routeEndOf(source, sz, storedSource, waypoints[0]);
  const targetEnd = storedTarget && routeEndOf(target, tz, storedTarget, waypoints[waypoints.length - 1]);
  const from = sourceEnd ? { anchor: sourceEnd.anchor, leaving: DOCKING_LEAVING[sourceEnd.side] } : anchorSideToward(source, waypoints[0], sz);
  const to = targetEnd
    ? { anchor: targetEnd.anchor, leaving: DOCKING_LEAVING[targetEnd.side] }
    : anchorSideToward(target, waypoints[waypoints.length - 1], tz);
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
    const leg =
      i === 0 && sourceEnd
        ? legFromStoredEnd(sourceEnd, b)
        : i === last && targetEnd
          ? legFromStoredEnd(targetEnd, a).reverse()
          : routeLeg(a, b, leading);
    for (const p of leg) {
      const tail = points[points.length - 1];
      if (!tail || tail.x !== p.x || tail.y !== p.y) points.push(p);
    }
  }
  return { points, legStarts };
}

/**
 * A path end for the router. A stored end names its side and anchor. Any other
 * turns toward `toward` and takes that side's midpoint, which is the automatic
 * rule.
 */
function routeEndOf(node: Point, size: Size, stored: DockingEnd | undefined, toward: Point): RouteEnd {
  if (stored) return { anchor: dockingAnchor(node, stored, size) as Point, side: stored.side, node, size };
  const turned = anchorSideToward(node, toward, size);
  return { anchor: turned.anchor, side: SIDE_OF_LEAVING[turned.leaving], node, size };
}

/** `end` turned to the side opposing `held`'s, at that side's midpoint. */
function opposingEnd(end: RouteEnd, held: RouteEnd): RouteEnd {
  const side = SIDE_OF_LEAVING[OPPOSITE[DOCKING_LEAVING[held.side]]];
  return { ...end, side, anchor: dockingPointAt(end.node, side, 0, end.size) as Point };
}

/**
 * The leg from a stored end to the waypoint after it. A waypoint ahead of the
 * side takes the plain leg, leading along the side's axis. One level with the
 * side or behind it first gets a stub of one grid step outward.
 *
 * The leg then turns along the side to the waypoint's own coordinate on that
 * axis, which a node's span plus one grid step may contain. It then first
 * passes the nearer corner, one grid step clear, and takes its L from there:
 * four segments at most. A tie takes the lower coordinate. This is the one leg
 * with a gutter, since only an anchor has a box to clear.
 */
function legFromStoredEnd(end: RouteEnd, waypoint: Point): Point[] {
  const d = OUTWARD[end.side];
  const a = end.anchor;
  if ((waypoint.x - a.x) * d.x + (waypoint.y - a.y) * d.y > 0) return routeLeg(a, waypoint, d.x !== 0 ? "x" : "y");

  const stub = { x: a.x + d.x * GRID_STEP, y: a.y + d.y * GRID_STEP };
  const r = rectOf(end.node, end.size);
  const level = d.x !== 0;
  const wanted = level ? waypoint.y : waypoint.x;
  const lo = (level ? r.y0 : r.x0) - GRID_STEP;
  const hi = (level ? r.y1 : r.x1) + GRID_STEP;
  const clear = wanted <= lo || wanted >= hi;
  const turn = clear ? wanted : Math.abs(wanted - lo) <= Math.abs(wanted - hi) ? lo : hi;
  const raw = level
    ? [a, stub, { x: stub.x, y: turn }, { x: waypoint.x, y: turn }, waypoint]
    : [a, stub, { x: turn, y: stub.y }, { x: turn, y: waypoint.y }, waypoint];
  return simplify(raw).points;
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

/** A side of a node's box, as a stored docking end names it. */
export type DockingSide = "top" | "right" | "bottom" | "left";

/**
 * One end of a path as stored: a side and a whole-number position counted from
 * that side's midpoint in grid steps. It grows rightward on a top or bottom
 * side and downward on a left or right side.
 */
export interface DockingEnd {
  side: DockingSide;
  at: number;
}

/** A docking point of one box: its stored end and its canvas point. */
export interface DockingPoint extends DockingEnd {
  point: Point;
}

const DOCKING_SIDES: DockingSide[] = ["top", "right", "bottom", "left"];

/** The largest `|at|` a side holds. Fixed counts of 7 and 3, independent of the box size. */
const DOCKING_REACH: Record<DockingSide, number> = { top: 3, bottom: 3, left: 1, right: 1 };

const DOCKING_LEAVING: Record<DockingSide, LeaveDirection> = { top: "up", right: "right", bottom: "down", left: "left" };

const dockingPointAt = (node: Point, side: DockingSide, at: number, size: Size): Point => {
  const mid = SIDE[DOCKING_LEAVING[side]](node, size);
  return side === "top" || side === "bottom" ? { x: mid.x + at * GRID_STEP, y: mid.y } : { x: mid.x, y: mid.y + at * GRID_STEP };
};

/**
 * Every docking point of a box: seven on the top and bottom sides, three on the
 * left and right sides, one grid step apart, the middle one on the side's
 * midpoint. Order is top, right, bottom, left, each from low `at` to high.
 */
export function dockingPointsOf(node: Point, size: Size = NODE_SIZE): DockingPoint[] {
  const points: DockingPoint[] = [];
  for (const side of DOCKING_SIDES) {
    const reach = DOCKING_REACH[side];
    for (let at = -reach; at <= reach; at++) points.push({ side, at, point: dockingPointAt(node, side, at, size) });
  }
  return points;
}

/**
 * The docking point of a box nearest a position, by straight distance. A tie
 * takes the earlier point in `dockingPointsOf` order. `exclude` skips one end,
 * for a drop on the pressed step's own box.
 */
export function nearestDockingPoint(
  node: Point,
  position: Point,
  options: { exclude?: DockingEnd; size?: Size } = {},
): DockingPoint {
  const { exclude, size = NODE_SIZE } = options;
  let best: DockingPoint | undefined;
  let bestDistance = Infinity;
  for (const p of dockingPointsOf(node, size)) {
    if (exclude && p.side === exclude.side && p.at === exclude.at) continue;
    const d = Math.hypot(p.point.x - position.x, p.point.y - position.y);
    if (d < bestDistance) {
      best = p;
      bestDistance = d;
    }
  }
  return best as DockingPoint;
}

/**
 * Whether untrusted JSON is a stored end: an object naming one of the four
 * sides and a whole-number position that side holds.
 */
export function isDockingEnd(value: unknown): value is DockingEnd {
  if (!value || typeof value !== "object") return false;
  const { side, at } = value as { side?: unknown; at?: unknown };
  if (typeof side !== "string" || !DOCKING_SIDES.includes(side as DockingSide)) return false;
  return typeof at === "number" && Number.isInteger(at) && Math.abs(at) <= DOCKING_REACH[side as DockingSide];
}

/**
 * The anchor a stored end names on a box, or `undefined` for an unknown side or
 * a position the side lacks (non-integer or beyond its reach).
 */
export function dockingAnchor(node: Point, end: DockingEnd, size: Size = NODE_SIZE): Point | undefined {
  if (!isDockingEnd(end)) return undefined;
  return dockingPointAt(node, end.side, end.at, size);
}

/**
 * The stored end for an automatic anchor, which always sits on a side's
 * midpoint. `undefined` when the anchor is no docking point of the box. A
 * corner shared by two sides answers the earlier side in `dockingPointsOf` order.
 */
export function dockingEndOfAnchor(node: Point, anchor: Point, size: Size = NODE_SIZE): DockingEnd | undefined {
  const hit = dockingPointsOf(node, size).find((p) => p.point.x === anchor.x && p.point.y === anchor.y);
  return hit ? { side: hit.side, at: hit.at } : undefined;
}

/** Press target reach beyond a point's border, in user units. */
export const PRESS_REACH_OUT = 12;
/** Press target reach into the node from a point's border, in user units. */
const PRESS_REACH_IN = 6;

/**
 * Whether a press lands on one docking point's target: 12 units outward and 6
 * inward across the border, and half a grid step either way along it, so
 * neighbouring targets meet halfway. Bounds are inclusive.
 */
export function inPressTarget(target: DockingPoint, press: Point): boolean {
  const dx = press.x - target.point.x;
  const dy = press.y - target.point.y;
  const along = target.side === "top" || target.side === "bottom" ? dx : dy;
  if (Math.abs(along) > GRID_STEP / 2) return false;
  const across = target.side === "top" ? dy : target.side === "bottom" ? -dy : target.side === "left" ? dx : -dx;
  // across < 0 is outward for every side.
  return across >= -PRESS_REACH_OUT && across <= PRESS_REACH_IN;
}

/**
 * One docking point's press target as rect attributes, the rectangle
 * `inPressTarget` tests: 12 units outward from the border, 6 inward, and half a
 * grid step either way along the side.
 */
export function pressTargetRect(p: DockingPoint): { x: number; y: number; width: number; height: number } {
  const half = GRID_STEP / 2;
  const { x, y } = p.point;
  const depth = PRESS_REACH_OUT + PRESS_REACH_IN;
  if (p.side === "top") return { x: x - half, y: y - PRESS_REACH_OUT, width: GRID_STEP, height: depth };
  if (p.side === "bottom") return { x: x - half, y: y - PRESS_REACH_IN, width: GRID_STEP, height: depth };
  if (p.side === "left") return { x: x - PRESS_REACH_OUT, y: y - half, width: depth, height: GRID_STEP };
  return { x: x - PRESS_REACH_IN, y: y - half, width: depth, height: GRID_STEP };
}

/**
 * One end of a path as the router reads it: the anchor, the side it sits on,
 * and the box that side belongs to.
 */
export interface RouteEnd {
  anchor: Point;
  side: DockingSide;
  node: Point;
  size: Size;
}

const OUTWARD: Record<DockingSide, Point> = { top: { x: 0, y: -1 }, right: { x: 1, y: 0 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 } };

const OPPOSING: Record<DockingSide, DockingSide> = { top: "bottom", bottom: "top", left: "right", right: "left" };

const SIDE_OF_LEAVING: Record<LeaveDirection, DockingSide> = { right: "right", left: "left", down: "bottom", up: "top" };

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const rectOf = (n: Point, z: Size): Rect => ({ x0: n.x, y0: n.y, x1: n.x + z.width, y1: n.y + z.height });

/**
 * Drops repeated points and merges runs that continue in one direction.
 * `doubled` reports two neighbouring segments on one axis running opposite
 * ways, which no route may hold.
 */
function simplify(points: Point[]): { points: Point[]; doubled: boolean } {
  const out: Point[] = [];
  let doubled = false;
  for (const p of dedupe(points)) {
    while (out.length >= 2) {
      const a = out[out.length - 2];
      const b = out[out.length - 1];
      const sx1 = Math.sign(b.x - a.x);
      const sy1 = Math.sign(b.y - a.y);
      const sx2 = Math.sign(p.x - b.x);
      const sy2 = Math.sign(p.y - b.y);
      if (sx1 * sy2 - sy1 * sx2 !== 0) break;
      if (sx1 * sx2 + sy1 * sy2 < 0) {
        doubled = true;
        break;
      }
      out.pop();
    }
    out.push(p);
  }
  return { points: out, doubled };
}

/** Whether a route revisits a point or lays one segment over another. */
function retraces(points: Point[]): boolean {
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) if (points[i].x === points[j].x && points[i].y === points[j].y) return true;
  }
  for (let i = 1; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const [a, b, c, e] = [points[i - 1], points[i], points[j - 1], points[j]];
      const level = a.y === b.y && c.y === e.y && a.y === c.y;
      const upright = a.x === b.x && c.x === e.x && a.x === c.x;
      if (level && Math.min(a.x, b.x) < Math.max(c.x, e.x) && Math.min(c.x, e.x) < Math.max(a.x, b.x)) return true;
      if (upright && Math.min(a.y, b.y) < Math.max(c.y, e.y) && Math.min(c.y, e.y) < Math.max(a.y, b.y)) return true;
    }
  }
  return false;
}

/** The segments of a route that cross the inside of a box or run along its border. */
function segmentsMeeting(points: Point[], boxes: Rect[]): number {
  let count = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    for (const r of boxes) {
      const meets =
        a.y === b.y
          ? a.y >= r.y0 && a.y <= r.y1 && Math.min(a.x, b.x) < r.x1 && Math.max(a.x, b.x) > r.x0
          : a.x >= r.x0 && a.x <= r.x1 && Math.min(a.y, b.y) < r.y1 && Math.max(a.y, b.y) > r.y0;
      if (meets) count++;
    }
  }
  return count;
}

const lengthOf = (points: Point[]): number => points.slice(1).reduce((sum, p, i) => sum + Math.abs(p.x - points[i].x) + Math.abs(p.y - points[i].y), 0);

/** The lattice line nearest halfway between two boxes along one axis. */
function channelBetween(a0: number, a1: number, b0: number, b1: number): number {
  const mid = a1 <= b0 ? (a1 + b0) / 2 : b1 <= a0 ? (b1 + a0) / 2 : (a0 + a1 + b0 + b1) / 4;
  return Math.round(mid / GRID_STEP) * GRID_STEP;
}

/**
 * The orthogonal route between two anchors on any pair of sides.
 *
 * Opposing sides that face each other (the target anchor two grid steps or more
 * beyond the source anchor along the leaving axis) take `routeEdge`, so that
 * pair draws as it always did. Every other pair, and every pair on one box,
 * takes a search: each anchor gets a stub one grid step outward, and candidate
 * middles join the two stub ends with up to three segments. A candidate's
 * coordinates come from the stub ends, the channel between the boxes and a
 * line one grid step outside each box and outside both together. The search
 * drops a candidate that doubles back, then takes the fewest segments, then the
 * shorter route, then the earlier candidate.
 *
 * A candidate that revisits a point or retraces a segment never wins, at any
 * distance. One that crosses a box or runs along a border loses to any that does
 * not. Where none is clean (boxes closer than two grid steps) the one with the
 * fewest such segments wins, so a route always draws.
 */
export function routeBetweenEnds(source: RouteEnd, target: RouteEnd): Point[] {
  const d = OUTWARD[source.side];
  const beyond = (target.anchor.x - source.anchor.x) * d.x + (target.anchor.y - source.anchor.y) * d.y;
  if (OPPOSING[source.side] === target.side && beyond >= 2 * GRID_STEP) {
    return routeEdge(source.anchor, target.anchor, DOCKING_LEAVING[source.side]);
  }

  const boxes = [rectOf(source.node, source.size), rectOf(target.node, target.size)];
  const [a, b] = boxes;
  const dt = OUTWARD[target.side];
  const from = { x: source.anchor.x + d.x * GRID_STEP, y: source.anchor.y + d.y * GRID_STEP };
  const to = { x: target.anchor.x + dt.x * GRID_STEP, y: target.anchor.y + dt.y * GRID_STEP };

  const xs = new Set<number>([from.x, to.x, channelBetween(a.x0, a.x1, b.x0, b.x1)]);
  const ys = new Set<number>([from.y, to.y, channelBetween(a.y0, a.y1, b.y0, b.y1)]);
  for (const r of [a, b]) {
    xs.add(r.x0 - GRID_STEP).add(r.x1 + GRID_STEP);
    ys.add(r.y0 - GRID_STEP).add(r.y1 + GRID_STEP);
  }
  xs.add(Math.min(a.x0, b.x0) - GRID_STEP).add(Math.max(a.x1, b.x1) + GRID_STEP);
  ys.add(Math.min(a.y0, b.y0) - GRID_STEP).add(Math.max(a.y1, b.y1) + GRID_STEP);

  // The empty middle joins the stub ends directly, so it needs them on one axis.
  const middles: Point[][] = from.x === to.x || from.y === to.y ? [[]] : [];
  middles.push([{ x: to.x, y: from.y }], [{ x: from.x, y: to.y }]);
  for (const x of xs) middles.push([{ x, y: from.y }, { x, y: to.y }]);
  for (const y of ys) middles.push([{ x: from.x, y }, { x: to.x, y }]);

  const candidates = middles.map((middle) => [source.anchor, from, ...middle, to, target.anchor]);
  // Opposing sides facing each other at any positive distance, anchors level on
  // the other axis, also offer the straight one-segment route.
  const level = d.x !== 0 ? source.anchor.y === target.anchor.y : source.anchor.x === target.anchor.x;
  if (OPPOSING[source.side] === target.side && beyond > 0 && level) candidates.unshift([source.anchor, target.anchor]);

  let best: Point[] | undefined;
  let bestScore: number[] = [];
  for (const candidate of candidates) {
    const { points, doubled } = simplify(candidate);
    if (doubled || retraces(points)) continue;
    const score = [segmentsMeeting(points, boxes), points.length - 1, lengthOf(points)];
    if (!best || score[0] < bestScore[0] || (score[0] === bestScore[0] && (score[1] < bestScore[1] || (score[1] === bestScore[1] && score[2] < bestScore[2])))) {
      best = points;
      bestScore = score;
    }
  }
  // The final L runs only when no candidate survives, which needs overlapping boxes; it may leave a box sideways, and the route still draws.
  // Two coincident anchors (touching boxes on facing midpoints) admit no route
  // that revisits no point, so they return the two-point route of zero length.
  const same = source.anchor.x === target.anchor.x && source.anchor.y === target.anchor.y;
  return best ?? (same ? [source.anchor, target.anchor] : dedupe([source.anchor, { x: target.anchor.x, y: source.anchor.y }, target.anchor]));
}
