import { describe, expect, it } from "bun:test";
import { toggleSelection, normalizeRect, nodesInRect } from "../src/areas/studio/canvas/selection.js";
import { NODE_WIDTH, NODE_HEIGHT } from "../src/areas/studio/canvas/geometry.js";

describe("canvas selection: the toggle", () => {
  it("adds an id the set does not hold", () => {
    expect(toggleSelection(["a"], "b")).toEqual(["a", "b"]);
  });

  it("drops an id the set already holds", () => {
    expect(toggleSelection(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });

  it("adds to an empty set", () => {
    expect(toggleSelection([], "a")).toEqual(["a"]);
  });

  it("empties a set of one", () => {
    expect(toggleSelection(["a"], "a")).toEqual([]);
  });

  it("returns a new array rather than mutating the input", () => {
    const ids = ["a"];
    expect(toggleSelection(ids, "b")).not.toBe(ids);
    expect(ids).toEqual(["a"]);
  });
});

describe("canvas selection: the marquee rectangle", () => {
  it("sorts two corners dragged down and right", () => {
    expect(normalizeRect({ x: 10, y: 20 }, { x: 40, y: 60 })).toEqual({ x: 10, y: 20, width: 30, height: 40 });
  });

  it("sorts two corners dragged up and left", () => {
    expect(normalizeRect({ x: 40, y: 60 }, { x: 10, y: 20 })).toEqual({ x: 10, y: 20, width: 30, height: 40 });
  });

  it("sorts two corners dragged up and right", () => {
    expect(normalizeRect({ x: 10, y: 60 }, { x: 40, y: 20 })).toEqual({ x: 10, y: 20, width: 30, height: 40 });
  });

  it("sorts two corners dragged down and left", () => {
    expect(normalizeRect({ x: 40, y: 20 }, { x: 10, y: 60 })).toEqual({ x: 10, y: 20, width: 30, height: 40 });
  });

  it("gives a press with no movement a zero-sized rectangle", () => {
    expect(normalizeRect({ x: 10, y: 20 }, { x: 10, y: 20 })).toEqual({ x: 10, y: 20, width: 0, height: 0 });
  });
});

describe("canvas selection: the marquee overlap test", () => {
  // Three nodes in a row, at the column pitch the auto-layout uses.
  const nodes = [
    { id: "a", x: 0, y: 0 },
    { id: "b", x: 240, y: 0 },
    { id: "c", x: 480, y: 0 },
  ];

  it("selects a node the marquee covers whole", () => {
    expect(nodesInRect({ x: -10, y: -10, width: 220, height: 100 }, nodes)).toEqual(["a"]);
  });

  it("selects a node the marquee only clips", () => {
    expect(nodesInRect({ x: 230, y: 50, width: 20, height: 20 }, nodes)).toEqual(["b"]);
  });

  it("selects every node a wide marquee touches", () => {
    expect(nodesInRect({ x: -10, y: -10, width: 700, height: 100 }, nodes)).toEqual(["a", "b", "c"]);
  });

  it("selects nothing when the marquee touches no node", () => {
    expect(nodesInRect({ x: 0, y: 400, width: 700, height: 100 }, nodes)).toEqual([]);
  });

  it("selects nothing in the gap between two nodes", () => {
    expect(nodesInRect({ x: NODE_WIDTH + 10, y: 0, width: 20, height: 20 }, nodes)).toEqual([]);
  });

  it("counts a shared edge as an overlap", () => {
    expect(nodesInRect({ x: NODE_WIDTH, y: NODE_HEIGHT, width: 0, height: 0 }, nodes)).toEqual(["a"]);
  });

  it("selects a node a marquee dragged up and left touches", () => {
    const rect = normalizeRect({ x: 300, y: 100 }, { x: 250, y: 40 });
    expect(nodesInRect(rect, nodes)).toEqual(["b"]);
  });
});
