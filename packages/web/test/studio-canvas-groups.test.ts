import { describe, expect, it } from "bun:test";
import {
  groupBox,
  drawnBox,
  hiddenStepIds,
  anchorBoxFor,
  groupOf,
  canGroup,
  groupMatching,
  GROUP_MARGIN,
  type StepGroup,
} from "../src/areas/studio/canvas/groups.js";
import {
  anchorSideToward,
  routeThroughWaypoints,
  NODE_SIZE,
  NODE_WIDTH,
  NODE_HEIGHT,
} from "../src/areas/studio/canvas/geometry.js";

const positions = {
  a: { x: 0, y: 0 },
  b: { x: 240, y: 0 },
  c: { x: 240, y: 120 },
  far: { x: 900, y: 0 },
};
const group = (over: Partial<StepGroup> = {}): StepGroup => ({ id: "g1", stepIds: ["a", "b"], name: "Checks", ...over });

describe("canvas groups: the box", () => {
  it("encloses every member with a margin", () => {
    const box = groupBox(group(), positions)!;
    expect(box).toEqual({
      x: -GROUP_MARGIN,
      y: -GROUP_MARGIN,
      width: 240 + NODE_WIDTH + GROUP_MARGIN * 2,
      height: NODE_HEIGHT + GROUP_MARGIN * 2,
    });
  });

  it("grows down the page for a member on another row", () => {
    const box = groupBox(group({ stepIds: ["a", "c"] }), positions)!;
    expect(box.height).toBe(120 + NODE_HEIGHT + GROUP_MARGIN * 2);
  });

  it("draws nothing for a group of one", () => {
    expect(groupBox(group({ stepIds: ["a"] }), positions)).toBeUndefined();
  });

  it("drops a member the draft no longer holds, and draws the rest", () => {
    const box = groupBox(group({ stepIds: ["a", "b", "gone"] }), positions);
    expect(box).toEqual(groupBox(group(), positions));
  });

  it("draws nothing once a delete leaves one member", () => {
    expect(groupBox(group({ stepIds: ["a", "gone"] }), positions)).toBeUndefined();
  });

  it("collapses to the node size at its own corner", () => {
    const expanded = groupBox(group(), positions)!;
    expect(drawnBox(group({ collapsed: true }), positions)).toEqual({
      x: expanded.x,
      y: expanded.y,
      ...NODE_SIZE,
    });
  });
});

describe("canvas groups: what a collapse hides", () => {
  it("hides every member of a collapsed group", () => {
    expect([...hiddenStepIds([group({ collapsed: true })], positions)].sort()).toEqual(["a", "b"]);
  });

  it("hides nothing while the group is expanded", () => {
    expect(hiddenStepIds([group()], positions).size).toBe(0);
  });

  it("hides nothing for a collapsed group that draws nothing", () => {
    expect(hiddenStepIds([group({ stepIds: ["a"], collapsed: true })], positions).size).toBe(0);
  });
});

describe("canvas groups: the box a path anchors on", () => {
  it("anchors a hidden member on its group's box", () => {
    const collapsed = group({ collapsed: true });
    expect(anchorBoxFor("a", [collapsed], positions)).toEqual(drawnBox(collapsed, positions)!);
  });

  it("anchors an expanded member on its own node", () => {
    expect(anchorBoxFor("a", [group()], positions)).toEqual({ x: 0, y: 0, ...NODE_SIZE });
  });

  it("anchors a step in no group on its own node", () => {
    expect(anchorBoxFor("far", [group({ collapsed: true })], positions)).toEqual({ x: 900, y: 0, ...NODE_SIZE });
  });

  it("returns nothing for a step with no position", () => {
    expect(anchorBoxFor("gone", [], positions)).toBeUndefined();
  });
});

describe("canvas groups: membership", () => {
  it("finds the group holding a step", () => {
    expect(groupOf("b", [group()])?.id).toBe("g1");
    expect(groupOf("far", [group()])).toBeUndefined();
  });

  it("refuses a set any group already holds", () => {
    expect(canGroup(["a", "far"], [group()])).toBe(false);
    expect(canGroup(["far", "c"], [group()])).toBe(true);
  });

  it("refuses a set of fewer than two", () => {
    expect(canGroup(["far"], [])).toBe(false);
  });

  it("matches a selection to its group whatever the order", () => {
    expect(groupMatching(["b", "a"], [group()])?.id).toBe("g1");
    expect(groupMatching(["a"], [group()])).toBeUndefined();
  });
});

describe("canvas geometry: a box that is not a node", () => {
  it("puts an anchor on the side of a box its own size", () => {
    const big = { width: 400, height: 200 };
    expect(anchorSideToward({ x: 0, y: 0 }, { x: 900, y: 100 }, big)).toEqual({
      anchor: { x: 400, y: 100 },
      leaving: "right",
    });
  });

  it("defaults to the node size", () => {
    expect(anchorSideToward({ x: 0, y: 0 }, { x: 900, y: 30 })).toEqual(
      anchorSideToward({ x: 0, y: 0 }, { x: 900, y: 30 }, NODE_SIZE),
    );
  });

  it("routes from a sized box rather than from a node-sized one", () => {
    // The collapsed group's own box stands in for a hidden member. Without the
    // size the route would leave a node-sized rectangle at the box's corner.
    const big = { width: 400, height: 200 };
    const route = routeThroughWaypoints({ x: 0, y: 0 }, { x: 900, y: 70 }, [], { source: big });
    expect(route.points[0]).toEqual({ x: 400, y: 100 });
  });
});
