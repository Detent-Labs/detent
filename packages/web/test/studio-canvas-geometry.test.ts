import { describe, expect, it } from "bun:test";
import { hitTestNode, dragDelta, NODE_WIDTH, NODE_HEIGHT } from "../src/areas/studio/canvas/geometry.js";

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
