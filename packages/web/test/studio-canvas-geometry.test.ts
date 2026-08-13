import { describe, expect, it } from "bun:test";
import {
  hitTestNode,
  dragDelta,
  exceedsClickThreshold,
  snapToGrid,
  routeEdge,
  midpointOfRoute,
  routePath,
  CLICK_THRESHOLD,
  GRID_STEP,
  NODE_WIDTH,
  NODE_HEIGHT,
} from "../src/areas/studio/canvas/geometry.js";
import { COLUMN_WIDTH, ROW_HEIGHT } from "../src/areas/studio/canvas/layout.js";

describe("canvas geometry: hit-testing", () => {
  const nodes = [
    { id: "a", x: 0, y: 0 },
    { id: "b", x: 300, y: 0 },
  ];

  it("finds the node containing the point", () => {
    expect(hitTestNode({ x: 10, y: 10 }, nodes)).toBe("a");
    expect(hitTestNode({ x: 310, y: 10 }, nodes)).toBe("b");
  });

  it("returns undefined for a point outside every node", () => {
    expect(hitTestNode({ x: 1000, y: 1000 }, nodes)).toBeUndefined();
  });

  it("hits the exact edges of a node's bounds", () => {
    expect(hitTestNode({ x: NODE_WIDTH, y: NODE_HEIGHT }, nodes)).toBe("a");
    expect(hitTestNode({ x: NODE_WIDTH + 1, y: 0 }, nodes)).toBeUndefined();
  });

  it("resolves an overlap to the last (topmost) node", () => {
    const overlapping = [
      { id: "under", x: 0, y: 0 },
      { id: "over", x: 0, y: 0 },
    ];
    expect(hitTestNode({ x: 5, y: 5 }, overlapping)).toBe("over");
  });
});

describe("canvas geometry: drag delta", () => {
  it("computes the offset between start and current position", () => {
    expect(dragDelta({ x: 10, y: 10 }, { x: 25, y: 5 })).toEqual({ x: 15, y: -5 });
  });

  it("is zero when the pointer hasn't moved", () => {
    expect(dragDelta({ x: 3, y: 4 }, { x: 3, y: 4 })).toEqual({ x: 0, y: 0 });
  });
});

describe("canvas geometry: the lattice", () => {
  it("rounds to the nearer point on each axis, independently", () => {
    expect(snapToGrid({ x: 9, y: 11 })).toEqual({ x: 0, y: 20 });
    expect(snapToGrid({ x: 31, y: 29 })).toEqual({ x: 40, y: 20 });
  });

  it("leaves a point already on the lattice alone", () => {
    expect(snapToGrid({ x: 40, y: 120 })).toEqual({ x: 40, y: 120 });
    expect(snapToGrid({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  it("handles a negative coordinate, which a panned canvas produces", () => {
    expect(snapToGrid({ x: -9, y: -11 })).toEqual({ x: -0, y: -20 });
    expect(snapToGrid({ x: -31, y: -240 })).toEqual({ x: -40, y: -240 });
  });

  it("puts every layout constant on the lattice, so no auto-placed step shifts", () => {
    // A constant off the lattice would move every auto-laid-out step the first
    // time an author drags it, which reads as the canvas losing the position.
    for (const constant of [COLUMN_WIDTH, ROW_HEIGHT, NODE_WIDTH, NODE_HEIGHT]) {
      expect(constant % GRID_STEP).toBe(0);
    }
  });
});

describe("canvas geometry: a click is not a drag", () => {
  it("reads a movement at or under the threshold as a click", () => {
    // The snap runs only past this line, so a click can never round its own
    // step onto the lattice. That is the ordering the drag release depends on.
    expect(exceedsClickThreshold({ x: 0, y: 0 })).toBe(false);
    expect(exceedsClickThreshold({ x: CLICK_THRESHOLD, y: CLICK_THRESHOLD })).toBe(false);
    expect(exceedsClickThreshold({ x: -CLICK_THRESHOLD, y: 0 })).toBe(false);
  });

  it("reads a movement past the threshold on either axis as a drag", () => {
    expect(exceedsClickThreshold({ x: CLICK_THRESHOLD + 1, y: 0 })).toBe(true);
    expect(exceedsClickThreshold({ x: 0, y: -(CLICK_THRESHOLD + 1) })).toBe(true);
  });
});

describe("canvas geometry: edge routing", () => {
  const axisAligned = (points: ReturnType<typeof routeEdge>) =>
    points.slice(1).every((p, i) => p.x === points[i].x || p.y === points[i].y);

  it("draws one segment along a shared row", () => {
    const route = routeEdge({ x: 180, y: 30 }, { x: 240, y: 30 });
    expect(route).toEqual([
      { x: 180, y: 30 },
      { x: 240, y: 30 },
    ]);
  });

  it("turns two corners for a target ahead on another row", () => {
    const route = routeEdge({ x: 180, y: 30 }, { x: 240, y: 150 });
    expect(route).toHaveLength(4);
    expect(axisAligned(route)).toBe(true);
    expect(route[0]).toEqual({ x: 180, y: 30 });
    expect(route[3]).toEqual({ x: 240, y: 150 });
  });

  it("leaves and enters horizontally on a three-segment route", () => {
    const route = routeEdge({ x: 180, y: 30 }, { x: 240, y: 150 });
    expect(route[1].y).toBe(route[0].y);
    expect(route[2].y).toBe(route[3].y);
  });

  it("takes five segments for a target behind, on another row", () => {
    const route = routeEdge({ x: 420, y: 30 }, { x: 0, y: 150 });
    expect(route).toHaveLength(6);
    expect(axisAligned(route)).toBe(true);
  });

  it("dips below rather than collapsing for a target behind on the same row", () => {
    const route = routeEdge({ x: 420, y: 30 }, { x: 0, y: 30 });
    expect(route).toHaveLength(6);
    expect(axisAligned(route)).toBe(true);
    // No duplicate point, which a midpoint on the shared row would produce.
    const seen = new Set(route.map((p) => `${p.x},${p.y}`));
    expect(seen.size).toBe(route.length);
  });

  it("takes five segments when the entry anchor sits level with the exit anchor", () => {
    const route = routeEdge({ x: 240, y: 30 }, { x: 240, y: 150 });
    expect(route).toHaveLength(6);
    expect(axisAligned(route)).toBe(true);
  });

  it("puts every turn's x on the lattice, against real anchors", () => {
    // A real anchor is `node.y + NODE_HEIGHT / 2`, so its y is a lattice
    // multiple plus 30 and never lands on the lattice itself. The gutter is
    // an x-axis property here; asserting both axes would only pass against
    // anchors the canvas never produces.
    for (const route of [
      routeEdge({ x: 180, y: 30 }, { x: 240, y: 150 }),
      routeEdge({ x: 420, y: 30 }, { x: 0, y: 150 }),
      routeEdge({ x: 420, y: 30 }, { x: 0, y: 30 }),
    ]) {
      for (const p of route) {
        // Math.abs, because a negative coordinate yields -0 and Object.is
        // separates that from 0. A route left of the origin is ordinary: the
        // gutter puts a turn at target.x - GRID_STEP.
        expect(Math.abs(p.x % GRID_STEP)).toBe(0);
      }
    }
  });

  it("clears the source node by a whole grid step on every turning route", () => {
    const route = routeEdge({ x: 180, y: 30 }, { x: 240, y: 150 });
    expect(route[1].x - route[0].x).toBe(GRID_STEP);
  });
});

describe("canvas geometry: the route midpoint", () => {
  it("halves a straight route", () => {
    expect(midpointOfRoute([{ x: 0, y: 0 }, { x: 100, y: 0 }])).toEqual({ point: { x: 50, y: 0 }, segment: 0 });
  });

  it("reports the segment its point falls on", () => {
    // Three segments of 20, 100 and 20: the half-way point at 70 sits inside
    // the second one.
    const route = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 100 },
      { x: 40, y: 100 },
    ];
    const mid = midpointOfRoute(route);
    expect(mid.segment).toBe(1);
    expect(mid.point).toEqual({ x: 20, y: 50 });
  });

  it("survives a zero-length route", () => {
    expect(midpointOfRoute([{ x: 5, y: 5 }, { x: 5, y: 5 }]).point).toEqual({ x: 5, y: 5 });
  });
});

describe("canvas geometry: the route path", () => {
  const square = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ];

  it("joins the corner points directly under step", () => {
    expect(routePath(square, "step")).toBe("M0,0 L100,0 L100,100");
  });

  it("returns the same corner points for both styles", () => {
    const route = routeEdge({ x: 180, y: 30 }, { x: 240, y: 150 });
    expect(routeEdge({ x: 180, y: 30 }, { x: 240, y: 150 })).toEqual(route);
    expect(routePath(route, "step")).not.toBe(routePath(route, "smoothstep"));
  });

  it("rounds each corner under smoothstep", () => {
    expect(routePath(square, "smoothstep", 10)).toBe("M0,0 L90,0 Q100,0 100,10 L100,100");
  });

  it("carries no arc on a route with no corner", () => {
    const straight = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    expect(routePath(straight, "smoothstep")).toBe("M0,0 L100,0");
  });

  it("clamps the arc to half the shorter segment it joins", () => {
    // The first segment is 10 long, so a radius of 40 clamps to 5.
    const tight = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 100 },
    ];
    expect(routePath(tight, "smoothstep", 40)).toBe("M0,0 L5,0 Q10,0 10,5 L10,100");
  });

  it("returns an empty string for fewer than two points", () => {
    expect(routePath([{ x: 0, y: 0 }], "step")).toBe("");
  });
});
