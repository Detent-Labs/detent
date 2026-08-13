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
