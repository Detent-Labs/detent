import { describe, expect, it } from "bun:test";
import {
  hitTestNode,
  dragDelta,
  exceedsClickThreshold,
  snapToGrid,
  routeEdge,
  anchorsForEdge,
  anchorSideToward,
  routeThroughWaypoints,
  legOfSegment,
  midpointOfRoute,
  routePath,
  freeLatticePoint,
  CLICK_THRESHOLD,
  GRID_STEP,
  NODE_WIDTH,
  NODE_HEIGHT,
  dockingPointsOf,
  nearestDockingPoint,
  dockingAnchor,
  dockingEndOfAnchor,
  inPressTarget,
  routeBetweenEnds,
  type DockingSide,
  type RouteEnd,
  type Point,
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

describe("canvas geometry: the anchor rule", () => {
  // Node positions, not anchors: every node is NODE_WIDTHxNODE_HEIGHT, so the
  // offset between two top-left corners is the offset between two centres.
  const at = (x: number, y: number) => ({ x, y });

  it("faces right when the horizontal gap is the larger one", () => {
    const a = anchorsForEdge(at(0, 0), at(400, 60));
    expect(a.leaving).toBe("right");
    expect(a.source).toEqual({ x: NODE_WIDTH, y: NODE_HEIGHT / 2 });
    expect(a.target).toEqual({ x: 400, y: 60 + NODE_HEIGHT / 2 });
  });

  it("faces left for a target behind it", () => {
    const a = anchorsForEdge(at(400, 0), at(0, 60));
    expect(a.leaving).toBe("left");
    expect(a.source).toEqual({ x: 400, y: NODE_HEIGHT / 2 });
    expect(a.target).toEqual({ x: 0 + NODE_WIDTH, y: 60 + NODE_HEIGHT / 2 });
  });

  it("faces down when the vertical gap is the larger one", () => {
    const a = anchorsForEdge(at(0, 0), at(60, 400));
    expect(a.leaving).toBe("down");
    expect(a.source).toEqual({ x: NODE_WIDTH / 2, y: NODE_HEIGHT });
    expect(a.target).toEqual({ x: 60 + NODE_WIDTH / 2, y: 400 });
  });

  it("faces up for a target above it", () => {
    const a = anchorsForEdge(at(0, 400), at(60, 0));
    expect(a.leaving).toBe("up");
    expect(a.source).toEqual({ x: NODE_WIDTH / 2, y: 400 });
    expect(a.target).toEqual({ x: 60 + NODE_WIDTH / 2, y: 0 + NODE_HEIGHT });
  });

  it("takes the horizontal on an equal-offset diagonal", () => {
    expect(anchorsForEdge(at(0, 0), at(200, 200)).leaving).toBe("right");
    expect(anchorsForEdge(at(0, 0), at(-200, -200)).leaving).toBe("left");
  });

  it("takes the right side for two steps stacked on one position", () => {
    const a = anchorsForEdge(at(100, 100), at(100, 100));
    expect(a.leaving).toBe("right");
    expect(a.source).toEqual({ x: 100 + NODE_WIDTH, y: 100 + NODE_HEIGHT / 2 });
  });
});

describe("canvas geometry: routing off the horizontal", () => {
  const axisAligned = (points: ReturnType<typeof routeEdge>) =>
    points.slice(1).every((p, i) => p.x === points[i].x || p.y === points[i].y);

  const routeBetween = (source: { x: number; y: number }, target: { x: number; y: number }) => {
    const a = anchorsForEdge(source, target);
    return routeEdge(a.source, a.target, a.leaving);
  };

  it("draws one segment down a shared column", () => {
    const route = routeBetween({ x: 0, y: 0 }, { x: 0, y: 400 });
    expect(route).toEqual([
      { x: NODE_WIDTH / 2, y: NODE_HEIGHT },
      { x: NODE_WIDTH / 2, y: 400 },
    ]);
  });

  it("turns two corners for a target below and across", () => {
    const route = routeBetween({ x: 0, y: 0 }, { x: 240, y: 400 });
    expect(route).toHaveLength(4);
    expect(axisAligned(route)).toBe(true);
    // Leaves vertically, one grid step clear of the side it leaves.
    expect(route[1].x).toBe(route[0].x);
    expect(route[1].y - route[0].y).toBe(GRID_STEP);
  });

  it("draws one segment back along a shared row", () => {
    // The win floating anchors buy: a backward path is short, not a detour
    // around the outside of both nodes.
    const route = routeBetween({ x: 400, y: 0 }, { x: 0, y: 0 });
    expect(route).toEqual([
      { x: 400, y: NODE_HEIGHT / 2 },
      { x: NODE_WIDTH, y: NODE_HEIGHT / 2 },
    ]);
  });

  it("takes five segments for a backward target that overlaps on the horizontal", () => {
    // dx is -100 against dy 60, so the pair is horizontal. The target's right
    // edge lands at 180, right of the source's left edge at 100, so the entry
    // anchor is not ahead of the exit anchor and the route reaches it from
    // outside.
    const route = routeBetween({ x: 100, y: 0 }, { x: 0, y: 60 });
    expect(route).toHaveLength(6);
    expect(axisAligned(route)).toBe(true);
  });

  it("returns a route that leaves up above the node it leaves", () => {
    // The regression the transform table exists to prevent: a self-inverse
    // transform maps back to the source's own side, and a rotation would put
    // the whole route on the far side of the origin.
    const route = routeBetween({ x: 0, y: 400 }, { x: 60, y: 0 });
    expect(route[0]).toEqual({ x: NODE_WIDTH / 2, y: 400 });
    expect(route[route.length - 1]).toEqual({ x: 60 + NODE_WIDTH / 2, y: NODE_HEIGHT });
    expect(route[1].y).toBeLessThan(route[0].y);
    expect(axisAligned(route)).toBe(true);
  });

  it("keeps every leaving direction axis-aligned and anchored at both ends", () => {
    const targets = [
      { x: 400, y: 0 },
      { x: -400, y: 0 },
      { x: 0, y: 400 },
      { x: 0, y: -400 },
      { x: 300, y: 260 },
      { x: -300, y: -260 },
    ];
    for (const target of targets) {
      const a = anchorsForEdge({ x: 0, y: 0 }, target);
      const route = routeEdge(a.source, a.target, a.leaving);
      expect(route[0]).toEqual(a.source);
      expect(route[route.length - 1]).toEqual(a.target);
      expect(axisAligned(route)).toBe(true);
    }
  });
});

describe("canvas geometry: the route through waypoints", () => {
  const axisAligned = (points: { x: number; y: number }[]) =>
    points.slice(1).every((p, i) => p.x === points[i].x || p.y === points[i].y);
  const holds = (points: { x: number; y: number }[], p: { x: number; y: number }) =>
    points.some((q) => q.x === p.x && q.y === p.y);

  it("routes a path with no waypoints exactly as the pair rule does", () => {
    const source = { x: 0, y: 0 };
    const target = { x: 240, y: 0 };
    const a = anchorsForEdge(source, target);
    expect(routeThroughWaypoints(source, target, []).points).toEqual(routeEdge(a.source, a.target, a.leaving));
  });

  it("defaults to no waypoints when the list is omitted", () => {
    expect(routeThroughWaypoints({ x: 0, y: 0 }, { x: 240, y: 0 }).points).toHaveLength(2);
  });

  it("passes through its one waypoint", () => {
    const route = routeThroughWaypoints({ x: 0, y: 0 }, { x: 480, y: 0 }, [{ x: 240, y: -120 }]);
    expect(holds(route.points, { x: 240, y: -120 })).toBe(true);
    expect(axisAligned(route.points)).toBe(true);
  });

  it("passes through every waypoint in order", () => {
    const ws = [
      { x: 200, y: -140 },
      { x: 400, y: -140 },
    ];
    const route = routeThroughWaypoints({ x: 0, y: 0 }, { x: 600, y: 0 }, ws);
    for (const w of ws) expect(holds(route.points, w)).toBe(true);
    const first = route.points.findIndex((p) => p.x === ws[0].x && p.y === ws[0].y);
    const second = route.points.findIndex((p) => p.x === ws[1].x && p.y === ws[1].y);
    expect(first).toBeLessThan(second);
  });

  it("leaves the side that faces the first waypoint, not the target", () => {
    // The target sits to the right, so the pair rule would leave rightward.
    // The waypoint sits above, so this edge leaves the top instead.
    const source = { x: 0, y: 0 };
    const route = routeThroughWaypoints(source, { x: 480, y: 0 }, [{ x: 90, y: -200 }]);
    expect(route.points[0]).toEqual({ x: NODE_WIDTH / 2, y: 0 });
    expect(anchorSideToward(source, { x: 90, y: -200 }).leaving).toBe("up");
  });

  it("reports one leg start per leg, each on the route", () => {
    const route = routeThroughWaypoints({ x: 0, y: 0 }, { x: 480, y: 0 }, [{ x: 240, y: -120 }]);
    expect(route.legStarts).toHaveLength(2);
    expect(route.legStarts[0]).toBe(0);
    expect(route.points[route.legStarts[1]]).toEqual({ x: 240, y: -120 });
  });

  it("maps a route segment back to the leg it belongs to", () => {
    const route = routeThroughWaypoints({ x: 0, y: 0 }, { x: 480, y: 0 }, [{ x: 240, y: -120 }]);
    const boundary = route.legStarts[1];
    expect(legOfSegment(route.legStarts, 0)).toBe(0);
    expect(legOfSegment(route.legStarts, boundary - 1)).toBe(0);
    expect(legOfSegment(route.legStarts, boundary)).toBe(1);
    // Past the end still names the last leg rather than running off it.
    expect(legOfSegment(route.legStarts, 99)).toBe(1);
  });

  it("never doubles back on itself at a waypoint", () => {
    // The defect the browser found: routing a leg with `routeEdge`'s gutter
    // put a 20-unit spike out of the apex, because the gutter clears a node
    // and a waypoint has no box. Two consecutive segments on one axis must
    // therefore never travel in opposite directions.
    const route = routeThroughWaypoints({ x: 240, y: 0 }, { x: 480, y: 120 }, [{ x: 360, y: -140 }]);
    const dirs = route.points.slice(1).map((p, i) => ({
      dx: Math.sign(p.x - route.points[i].x),
      dy: Math.sign(p.y - route.points[i].y),
    }));
    for (const [i, d] of dirs.slice(1).entries()) {
      const prev = dirs[i];
      expect(d.dx === -prev.dx && d.dx !== 0).toBe(false);
      expect(d.dy === -prev.dy && d.dy !== 0).toBe(false);
    }
  });

  it("keeps every segment on one axis with several waypoints", () => {
    const route = routeThroughWaypoints({ x: 0, y: 0 }, { x: 600, y: 300 }, [
      { x: 120, y: -160 },
      { x: 400, y: -160 },
      { x: 520, y: 40 },
    ]);
    expect(axisAligned(route.points)).toBe(true);
    expect(route.legStarts).toHaveLength(4);
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

describe("canvas geometry: a free lattice point", () => {
  const wanted = { x: 400, y: 200 };

  it("answers wanted unchanged when nothing is placed", () => {
    expect(freeLatticePoint(wanted, [])).toEqual(wanted);
  });

  it("walks one step right of a node exactly at wanted", () => {
    const placed = [{ id: "a", x: 400, y: 200 }];
    expect(freeLatticePoint(wanted, placed)).toEqual({ x: 600, y: 200 });
  });

  it("walks past two nodes placed one step apart", () => {
    const placed = [
      { id: "a", x: 400, y: 200 },
      { id: "b", x: 600, y: 200 },
    ];
    expect(freeLatticePoint(wanted, placed)).toEqual({ x: 800, y: 200 });
  });

  it("counts a shared-edge touch as an overlap", () => {
    // Right edge of this node is exactly wanted.x, the same inclusive bound
    // hitTestNode and nodesInRect use.
    const placed = [{ id: "a", x: 400 - NODE_WIDTH, y: 200 }];
    expect(freeLatticePoint(wanted, placed)).toEqual({ x: 600, y: 200 });
  });

  it("leaves wanted unchanged for a node far away on the same row", () => {
    const placed = [{ id: "a", x: 2000, y: 200 }];
    expect(freeLatticePoint(wanted, placed)).toEqual(wanted);
  });

  it("leaves wanted unchanged for a node at the same x, clear of it vertically", () => {
    // Gap of 100 sits strictly between NODE_HEIGHT (60) and NODE_WIDTH (180):
    // the real check (against NODE_HEIGHT) finds no overlap here, but a
    // vertical comparison written against NODE_WIDTH by mistake would find
    // one and move wanted, so this gap catches that swap where 2000 would not.
    const placed = [{ id: "a", x: 400, y: 300 }];
    expect(freeLatticePoint(wanted, placed)).toEqual(wanted);
  });

  it("keeps every answer on the lattice", () => {
    const configs = [
      [],
      [{ id: "a", x: 400, y: 200 }],
      [
        { id: "a", x: 400, y: 200 },
        { id: "b", x: 600, y: 200 },
        { id: "c", x: 800, y: 200 },
      ],
    ];
    for (const placed of configs) {
      const answer = freeLatticePoint(wanted, placed);
      expect(answer.x % GRID_STEP).toBe(0);
      expect(answer.y % GRID_STEP).toBe(0);
    }
  });
});

describe("docking points", () => {
  const box = { x: 100, y: 200 };
  const sideOf = (s: DockingSide) => dockingPointsOf(box).filter((p) => p.side === s);

  it("lists three points on each upright side and seven on each level side", () => {
    expect(sideOf("left").map((p) => p.at)).toEqual([-1, 0, 1]);
    expect(sideOf("right").map((p) => p.at)).toEqual([-1, 0, 1]);
    expect(sideOf("top").map((p) => p.at)).toEqual([-3, -2, -1, 0, 1, 2, 3]);
    expect(sideOf("bottom").map((p) => p.at)).toEqual([-3, -2, -1, 0, 1, 2, 3]);
    expect(dockingPointsOf(box)).toHaveLength(20);
  });

  it("puts position 0 at each side's midpoint and steps one grid step along the side", () => {
    const at = (s: DockingSide, n: number) => sideOf(s).find((p) => p.at === n)!.point;
    expect(at("right", 0)).toEqual({ x: 280, y: 230 });
    expect(at("left", 0)).toEqual({ x: 100, y: 230 });
    expect(at("top", 0)).toEqual({ x: 190, y: 200 });
    expect(at("bottom", 0)).toEqual({ x: 190, y: 260 });
    expect(at("top", 1)).toEqual({ x: 190 + GRID_STEP, y: 200 });
    expect(at("right", 1)).toEqual({ x: 280, y: 230 + GRID_STEP });
    expect(at("left", -1)).toEqual({ x: 100, y: 230 - GRID_STEP });
  });

  it("takes a size other than the node's and keeps the counts", () => {
    const pts = dockingPointsOf({ x: 0, y: 0 }, { width: 100, height: 40 });
    expect(pts).toHaveLength(20);
    expect(pts.find((p) => p.side === "right" && p.at === 0)!.point).toEqual({ x: 100, y: 20 });
  });

  it("answers the point a position sits on", () => {
    const p = nearestDockingPoint(box, { x: 190, y: 200 });
    expect(p.side).toBe("top");
    expect(p.at).toBe(0);
  });

  it("answers the nearer of two points when between them", () => {
    const p = nearestDockingPoint(box, { x: 190 + 14, y: 190 });
    expect(p).toMatchObject({ side: "top", at: 1 });
  });

  it("answers a corner's nearest point", () => {
    const p = nearestDockingPoint(box, { x: 100, y: 200 });
    expect(p).toMatchObject({ side: "left", at: -1 });
  });

  it("skips an excluded point", () => {
    const p = nearestDockingPoint(box, { x: 190, y: 200 }, { exclude: { side: "top", at: 0 } });
    expect({ side: p.side, at: p.at }).toEqual({ side: "top", at: -1 });
  });

  it("turns a stored end into an anchor", () => {
    expect(dockingAnchor(box, { side: "bottom", at: 2 })).toEqual({ x: 190 + 2 * GRID_STEP, y: 260 });
  });

  it("rejects an unknown side", () => {
    expect(dockingAnchor(box, { side: "middle" as never, at: 0 })).toBeUndefined();
  });

  it("rejects a position the side lacks", () => {
    expect(dockingAnchor(box, { side: "right", at: 2 })).toBeUndefined();
    expect(dockingAnchor(box, { side: "top", at: 4 })).toBeUndefined();
    expect(dockingAnchor(box, { side: "top", at: 0.5 })).toBeUndefined();
  });

  it("reads each automatic midpoint back as position 0", () => {
    for (const leaving of ["right", "left", "down", "up"] as const) {
      const a = anchorSideToward(box, leaving === "right" ? { x: 1000, y: 230 } : leaving === "left" ? { x: -1000, y: 230 } : leaving === "down" ? { x: 190, y: 1000 } : { x: 190, y: -1000 });
      const end = dockingEndOfAnchor(box, a.anchor)!;
      expect(end.at).toBe(0);
      const expected: Record<typeof leaving, DockingSide> = { right: "right", left: "left", down: "bottom", up: "top" };
      expect(end.side).toBe(expected[leaving]);
    }
    expect(dockingEndOfAnchor(box, { x: 5, y: 5 })).toBeUndefined();
  });

  it("holds a press 10 units outside the border and not one 10 units inside", () => {
    const top0 = dockingPointsOf(box).find((p) => p.side === "top" && p.at === 0)!;
    expect(inPressTarget(top0, { x: 190, y: 190 })).toBe(true);
    expect(inPressTarget(top0, { x: 190, y: 210 })).toBe(false);
    expect(inPressTarget(top0, { x: 190, y: 205 })).toBe(true);
    expect(inPressTarget(top0, { x: 190, y: 187 })).toBe(false);
    expect(inPressTarget(top0, { x: 190 + 11, y: 200 })).toBe(false);
    const right0 = dockingPointsOf(box).find((p) => p.side === "right" && p.at === 0)!;
    expect(inPressTarget(right0, { x: 290, y: 230 })).toBe(true);
    expect(inPressTarget(right0, { x: 270, y: 230 })).toBe(false);
  });

  it("holds the press target bounds inclusively", () => {
    const top0 = dockingPointsOf(box).find((p) => p.side === "top" && p.at === 0)!;
    expect(inPressTarget(top0, { x: 190, y: 200 - 12 })).toBe(true);
    expect(inPressTarget(top0, { x: 190, y: 200 + 6 })).toBe(true);
    expect(inPressTarget(top0, { x: 190 + 10, y: 200 })).toBe(true);
    expect(inPressTarget(top0, { x: 190 - 10, y: 200 })).toBe(true);
  });
});

describe("canvas geometry: routes between any two sides", () => {
  const SIZE = { width: NODE_WIDTH, height: NODE_HEIGHT };
  const OUT: Record<DockingSide, Point> = { top: { x: 0, y: -1 }, right: { x: 1, y: 0 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 } };
  const SIDES: DockingSide[] = ["top", "right", "bottom", "left"];

  const endOf = (node: Point, side: DockingSide, at: number): RouteEnd => ({
    anchor: dockingAnchor(node, { side, at })!,
    side,
    node,
    size: SIZE,
  });
  const segments = (pts: Point[]) => pts.slice(1).map((p, i) => ({ a: pts[i], b: p, dx: p.x - pts[i].x, dy: p.y - pts[i].y }));
  // A segment meets a box when it touches the open interior or lies along a border.
  const meetsBox = (a: Point, b: Point, n: Point) => {
    const x0 = n.x;
    const x1 = n.x + NODE_WIDTH;
    const y0 = n.y;
    const y1 = n.y + NODE_HEIGHT;
    if (a.y === b.y) return a.y >= y0 && a.y <= y1 && Math.min(a.x, b.x) < x1 && Math.max(a.x, b.x) > x0;
    return a.x >= x0 && a.x <= x1 && Math.min(a.y, b.y) < y1 && Math.max(a.y, b.y) > y0;
  };

  function expectSound(route: Point[], s: RouteEnd, t: RouteEnd, clear: boolean) {
    const segs = segments(route);
    expect(route[0]).toEqual(s.anchor);
    expect(route[route.length - 1]).toEqual(t.anchor);
    expect(segs.length).toBeLessThanOrEqual(5);
    for (const g of segs) expect(g.dx === 0 || g.dy === 0).toBe(true);
    for (const g of segs) expect(g.dx !== 0 || g.dy !== 0).toBe(true);
    // The first segment leaves outward and the last arrives inward, a grid step or more.
    const first = segs[0];
    expect(Math.sign(first.dx)).toBe(OUT[s.side].x);
    expect(Math.sign(first.dy)).toBe(OUT[s.side].y);
    expect(Math.abs(first.dx) + Math.abs(first.dy)).toBeGreaterThanOrEqual(GRID_STEP);
    const last = segs[segs.length - 1];
    expect(Math.sign(last.dx)).toBe(0 - OUT[t.side].x + 0);
    expect(Math.sign(last.dy)).toBe(0 - OUT[t.side].y + 0);
    expect(Math.abs(last.dx) + Math.abs(last.dy)).toBeGreaterThanOrEqual(GRID_STEP);
    // No doubling back: neighbours on one axis never run opposite ways.
    for (let i = 1; i < segs.length; i++) {
      const p = segs[i - 1];
      const q = segs[i];
      expect(p.dx * q.dx < 0 || p.dy * q.dy < 0).toBe(false);
    }
    if (clear) for (const g of segs) for (const n of [s.node, t.node]) expect(meetsBox(g.a, g.b, n)).toBe(false);
  }

  it("draws stored opposing midpoints as the automatic route", () => {
    const src = { x: 0, y: 0 };
    const tgt = { x: 300, y: 80 };
    const s = endOf(src, "right", 0);
    const t = endOf(tgt, "left", 0);
    expect(routeBetweenEnds(s, t)).toEqual(routeEdge(s.anchor, t.anchor, "right"));
  });

  it("takes the automatic route for each facing opposing pair", () => {
    const cases: [DockingSide, DockingSide, Point][] = [
      ["right", "left", { x: 300, y: 40 }],
      ["left", "right", { x: -300, y: 40 }],
      ["bottom", "top", { x: 40, y: 200 }],
      ["top", "bottom", { x: 40, y: -200 }],
    ];
    const leaving = { right: "right", left: "left", bottom: "down", top: "up" } as const;
    for (const [a, b, tgt] of cases) {
      const s = endOf({ x: 0, y: 0 }, a, 0);
      const t = endOf(tgt, b, 0);
      expect(routeBetweenEnds(s, t)).toEqual(routeEdge(s.anchor, t.anchor, leaving[a]));
    }
  });

  it("sends an opposing pair that faces away through the new router", () => {
    const s = endOf({ x: 0, y: 0 }, "left", 0);
    const t = endOf({ x: 300, y: 0 }, "right", 0);
    const route = routeBetweenEnds(s, t);
    expect(route).toHaveLength(6);
    expectSound(route, s, t, true);
  });

  it("takes the new router for an opposing pair two steps apart only just short", () => {
    // 20 beyond the source anchor is under two grid steps: not facing.
    const s = endOf({ x: 0, y: 0 }, "right", 0);
    const t = endOf({ x: 200, y: 0 }, "left", 0);
    expect(routeBetweenEnds(s, t)).not.toEqual(routeEdge(s.anchor, t.anchor, "right"));
    expect(routeBetweenEnds(s, t).length).toBeGreaterThan(1);
  });

  it("turns onto a neighbouring side in two segments", () => {
    const s = endOf({ x: 0, y: 0 }, "right", 0);
    const t = endOf({ x: 260, y: 100 }, "top", 0);
    const route = routeBetweenEnds(s, t);
    expect(segments(route)).toHaveLength(2);
    expectSound(route, s, t, true);
  });

  it("draws two anchors on one side around, in three segments", () => {
    const s = endOf({ x: 0, y: 0 }, "top", 0);
    const t = endOf({ x: 300, y: 0 }, "top", 0);
    const route = routeBetweenEnds(s, t);
    expect(segments(route)).toHaveLength(3);
    expect(Math.min(...route.map((p) => p.y))).toBeLessThanOrEqual(-GRID_STEP);
    expectSound(route, s, t, true);
  });

  it("reaches a target from outside when the source anchor faces away", () => {
    const s = endOf({ x: 0, y: 0 }, "left", 0);
    const t = endOf({ x: 300, y: 0 }, "right", 0);
    expect(segments(routeBetweenEnds(s, t))).toHaveLength(5);
  });

  it("holds every rule across sixteen side pairs and eight placements", () => {
    const placements: Point[] = [
      { x: 220, y: 0 },
      { x: 220, y: 20 },
      { x: 220, y: -40 },
      { x: -220, y: 0 },
      { x: -220, y: 40 },
      { x: 0, y: 100 },
      { x: 20, y: 100 },
      { x: 40, y: -100 },
    ];
    let walked = 0;
    for (const placement of placements) {
      for (const sa of SIDES) {
        for (const sb of SIDES) {
          // The middle point, then one off-middle point on each side.
          for (const [atS, atT] of [[0, 0], [1, -1], [-1, 1]]) {
            const s = endOf({ x: 0, y: 0 }, sa, atS);
            const t = endOf(placement, sb, atT);
            expectSound(routeBetweenEnds(s, t), s, t, true);
            walked++;
          }
        }
      }
    }
    expect(walked).toBe(8 * 16 * 3);
  });

  it("holds the rules across wider gaps and both off-lattice offsets", () => {
    for (const gap of [60, 100, 200]) {
      for (const cross of [-40, -20, 0, 20, 40]) {
        for (const placement of [
          { x: 180 + gap, y: cross },
          { x: -180 - gap, y: cross },
          { x: cross, y: 60 + gap },
          { x: cross, y: -60 - gap },
        ]) {
          for (const sa of SIDES) {
            for (const sb of SIDES) {
              const s = endOf({ x: 0, y: 0 }, sa, 0);
              const t = endOf(placement, sb, 0);
              expectSound(routeBetweenEnds(s, t), s, t, true);
            }
          }
        }
      }
    }
  });

  it("still returns a route for two nodes closer than two grid steps", () => {
    for (const placement of [
      { x: 180, y: 0 },
      { x: 200, y: 0 },
      { x: 180, y: 20 },
      { x: 0, y: 60 },
      { x: 0, y: 80 },
      { x: 20, y: 40 },
    ]) {
      for (const sa of SIDES) {
        for (const sb of SIDES) {
          const route = routeBetweenEnds(endOf({ x: 0, y: 0 }, sa, 0), endOf(placement, sb, 0));
          expect(route.length).toBeGreaterThanOrEqual(2);
          for (const g of segments(route)) expect(g.dx === 0 || g.dy === 0).toBe(true);
        }
      }
    }
  });

  it("draws a self path on one side around its node", () => {
    for (const side of SIDES) {
      const s = endOf({ x: 0, y: 0 }, side, -1);
      const t = endOf({ x: 0, y: 0 }, side, 1);
      expectSound(routeBetweenEnds(s, t), s, t, true);
    }
  });

  it("draws a self path on two neighbouring sides around its node", () => {
    for (const [sa, sb] of [["top", "right"], ["right", "bottom"], ["bottom", "left"], ["left", "top"], ["right", "top"], ["top", "left"]] as const) {
      const s = endOf({ x: 0, y: 0 }, sa, 0);
      const t = endOf({ x: 0, y: 0 }, sb, 0);
      expectSound(routeBetweenEnds(s, t), s, t, true);
    }
  });
});

describe("canvas geometry: a waypointed route keeps its stored points", () => {
  const src = { x: 200, y: 0 };
  const tgt = { x: 700, y: 0 };
  const inside = (p: Point, n: Point) => p.x > n.x && p.x < n.x + NODE_WIDTH && p.y > n.y && p.y < n.y + NODE_HEIGHT;
  const crossesNode = (pts: Point[], n: Point) =>
    pts.slice(1).some((q, i) => {
      const p = pts[i];
      const x0 = n.x;
      const x1 = n.x + NODE_WIDTH;
      const y0 = n.y;
      const y1 = n.y + NODE_HEIGHT;
      if (p.y === q.y) return p.y >= y0 && p.y <= y1 && Math.min(p.x, q.x) < x1 && Math.max(p.x, q.x) > x0;
      return p.x >= x0 && p.x <= x1 && Math.min(p.y, q.y) < y1 && Math.max(p.y, q.y) > y0;
    });

  it("returns what it returns today when no end is stored", () => {
    const ws = [{ x: 400, y: -140 }];
    expect(routeThroughWaypoints(src, tgt, ws, {}, {})).toEqual(routeThroughWaypoints(src, tgt, ws));
    expect(routeThroughWaypoints(src, tgt, [], {}, {})).toEqual(routeThroughWaypoints(src, tgt));
  });

  it("starts at the stored source point and draws the plain leg to a waypoint ahead", () => {
    const route = routeThroughWaypoints(src, tgt, [{ x: 480, y: -100 }], {}, { source: { side: "right", at: 0 } });
    expect(route.points[0]).toEqual({ x: 380, y: 30 });
    // One segment or two before the waypoint.
    const w = route.points.findIndex((p) => p.x === 480 && p.y === -100);
    expect(route.legStarts[1]).toBe(w);
    expect(w).toBeLessThanOrEqual(2);
    expect(route.points[1]).toEqual({ x: 480, y: 30 });
  });

  it("ends at the stored target point", () => {
    const route = routeThroughWaypoints(src, tgt, [{ x: 520, y: 200 }], {}, { target: { side: "bottom", at: 1 } });
    expect(route.points[route.points.length - 1]).toEqual({ x: 700 + 90 + GRID_STEP, y: 60 });
  });

  it("goes around the node when the waypoint lies behind a stored point on the node's row", () => {
    const route = routeThroughWaypoints(src, tgt, [{ x: 100, y: 30 }], {}, { source: { side: "right", at: 0 } });
    const pts = route.points;
    expect(pts[0]).toEqual({ x: 380, y: 30 });
    expect(pts[1]).toEqual({ x: 400, y: 30 });
    expect(pts.some((p) => p.x === 100 && p.y === 30)).toBe(true);
    expect(pts.some((p) => p.y === -GRID_STEP || p.y === NODE_HEIGHT + GRID_STEP)).toBe(true);
    expect(crossesNode(pts.slice(0, route.legStarts[1] + 1), src)).toBe(false);
    expect(route.legStarts[1] - route.legStarts[0]).toBeLessThanOrEqual(4);
    for (const p of pts) expect(inside(p, src)).toBe(false);
    for (let i = 1; i < pts.length; i++) expect(pts[i].x === pts[i - 1].x || pts[i].y === pts[i - 1].y).toBe(true);
  });

  it("goes around for a waypoint behind a stored top point, and for a target end", () => {
    const top = routeThroughWaypoints(src, tgt, [{ x: 290, y: 200 }], {}, { source: { side: "top", at: 0 } });
    expect(top.points[1]).toEqual({ x: 290, y: -GRID_STEP });
    expect(crossesNode(top.points.slice(0, top.legStarts[1] + 1), src)).toBe(false);
    const end = routeThroughWaypoints(src, tgt, [{ x: 900, y: 30 }], {}, { target: { side: "left", at: 0 } });
    const last = end.points;
    expect(last[last.length - 1]).toEqual({ x: 700, y: 30 });
    expect(last[last.length - 2]).toEqual({ x: 680, y: 30 });
    expect(crossesNode(last.slice(end.legStarts[1]), tgt)).toBe(false);
  });

  it("reports one leg start per leg when a leg holds four segments", () => {
    const route = routeThroughWaypoints(src, tgt, [{ x: 100, y: 30 }, { x: 100, y: 300 }], {}, { source: { side: "right", at: 0 } });
    expect(route.legStarts).toHaveLength(3);
    expect(route.legStarts[0]).toBe(0);
    expect(route.points[route.legStarts[1]]).toEqual({ x: 100, y: 30 });
    expect(route.points[route.legStarts[2]]).toEqual({ x: 100, y: 300 });
  });

  it("routes a path with stored ends and no waypoints through the router", () => {
    const route = routeThroughWaypoints({ x: 0, y: 0 }, { x: 300, y: 0 }, [], {}, { source: { side: "top", at: 0 }, target: { side: "top", at: 0 } });
    expect(route.points).toHaveLength(4);
    expect(route.legStarts).toEqual([0]);
  });

  it("turns the unstored end toward the far box", () => {
    const route = routeThroughWaypoints({ x: 0, y: 0 }, { x: 300, y: 0 }, [], {}, { source: { side: "right", at: 1 } });
    expect(route.points[0]).toEqual({ x: 180, y: 50 });
    expect(route.points[route.points.length - 1]).toEqual({ x: 300, y: 30 });
  });
});
