export const NODE_WIDTH = 180;
export const NODE_HEIGHT = 64;

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
