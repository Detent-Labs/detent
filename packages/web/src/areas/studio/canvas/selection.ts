import { NODE_WIDTH, NODE_HEIGHT, type Point, type NodePosition } from "./geometry";

/**
 * The canvas selection is a list of step ids, not one id (design.md: it is the
 * interaction state stages 30 to 34 build on). These two rules live here rather
 * than inside `CanvasView` for the reason `geometry.ts` and `dropGesture.ts`
 * already do: the capability requires the canvas's computations to be pure and
 * testable without a DOM.
 */

/** A marquee rectangle in the SVG's own user space. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Adds `id` to the set, or drops it when the set already holds it. Order is
 * append order; nothing reads it, and keeping it makes a test's expectation
 * legible.
 */
export function toggleSelection(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((existing) => existing !== id) : [...ids, id];
}

/**
 * The rectangle between two corners, in either direction. A marquee dragged up
 * and left has to select what the same marquee dragged down and right selects,
 * so the two corners sort before anything measures them.
 */
export function normalizeRect(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

/**
 * Every node whose `NODE_WIDTH`x`NODE_HEIGHT` rect overlaps the marquee, by any
 * part (design.md: overlap, not containment — containment would ask an author to
 * draw around a node that fills most of the visible canvas at the fit scale).
 * A shared edge counts as an overlap, the same inclusive bound `hitTestNode`
 * uses.
 */
export function nodesInRect(rect: Rect, nodes: NodePosition[]): string[] {
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  return nodes
    .filter((n) => n.x <= right && n.x + NODE_WIDTH >= rect.x && n.y <= bottom && n.y + NODE_HEIGHT >= rect.y)
    .map((n) => n.id);
}
