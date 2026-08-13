import { describe, expect, it } from "bun:test";
import { hitTestNode, dragDelta, exceedsClickThreshold, snapToGrid, CLICK_THRESHOLD, GRID_STEP, NODE_WIDTH, NODE_HEIGHT } from "../src/areas/studio/canvas/geometry.js";
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
