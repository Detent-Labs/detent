import { describe, expect, it } from "bun:test";
import type { StepGroup } from "../src/areas/studio/canvas/groups.js";
import { pointsAfterMove } from "../src/areas/studio/canvas/layout.js";

const POSITIONS = {
  step_review: { x: 0, y: 0 },
  step_approve: { x: 240, y: 0 },
  step_archive: { x: 480, y: 0 },
};

const REVIEW_TO_APPROVE = { id: "path_a", from: "step_review", to: "step_approve" };
const APPROVE_TO_ARCHIVE = { id: "path_b", from: "step_approve", to: "step_archive" };

function run(over: Partial<Parameters<typeof pointsAfterMove>[0]>) {
  return pointsAfterMove({
    paths: [REVIEW_TO_APPROVE],
    moved: ["step_approve"],
    positions: POSITIONS,
    stored: {},
    waypoints: {},
    groups: [],
    ...over,
  });
}

describe("pointsAfterMove", () => {
  it("stores both ends of a path on one moved step, as the canvas drew them", () => {
    expect(run({})).toEqual({
      path_a: { source: { side: "right", at: 0 }, target: { side: "left", at: 0 } },
    });
  });

  it("stores each path on either of two moved steps", () => {
    const points = run({
      paths: [REVIEW_TO_APPROVE, APPROVE_TO_ARCHIVE],
      moved: ["step_review", "step_archive"],
    });
    expect(Object.keys(points).sort()).toEqual(["path_a", "path_b"]);
    expect(points.path_b).toEqual({ source: { side: "right", at: 0 }, target: { side: "left", at: 0 } });
  });

  it("stores nothing for a path on no moved step", () => {
    expect(run({ moved: ["step_archive"] })).toEqual({});
  });

  it("stores nothing when no step moved", () => {
    expect(run({ moved: [] })).toEqual({});
  });

  it("leaves an end that already stores a point and stores the other", () => {
    const points = run({ stored: { path_a: { source: { side: "top", at: -1 } } } });
    expect(points).toEqual({ path_a: { source: { side: "top", at: -1 }, target: { side: "left", at: 0 } } });
  });

  it("stores nothing for a path whose two ends already store a point", () => {
    const stored = { path_a: { source: { side: "top" as const, at: 0 }, target: { side: "top" as const, at: 0 } } };
    expect(run({ stored })).toEqual({});
  });

  it("reads the anchors a waypoint turned", () => {
    const points = run({ waypoints: { path_a: [{ x: 120, y: -200 }] } });
    expect(points.path_a?.source?.side).toBe("top");
    expect(points.path_a?.target?.side).toBe("top");
  });

  describe("a collapsed group's box", () => {
    const groups: StepGroup[] = [{ id: "group_x", stepIds: ["step_approve", "step_archive"], name: "X", collapsed: true }];

    it("stores the visible end and no end for the hidden one", () => {
      const points = run({ moved: ["step_review"], groups });
      expect(points).toEqual({ path_a: { source: { side: "right", at: 0 } } });
    });

    it("keeps the point a hidden member already stores", () => {
      const hidden = { side: "top" as const, at: 1 };
      const points = run({ moved: ["step_review"], groups, stored: { path_a: { target: hidden } } });
      expect(points).toEqual({ path_a: { source: { side: "right", at: 0 }, target: hidden } });
    });

    it("stores no end for the hidden side whatever the hidden member stores", () => {
      // The stored top point would turn the visible end otherwise.
      const hidden = { side: "bottom" as const, at: 0 };
      const points = run({ moved: ["step_review"], groups, stored: { path_a: { target: hidden } } });
      expect(points.path_a?.source).toEqual({ side: "right", at: 0 });
    });

    it("stores nothing for a path between two members of one collapsed group", () => {
      expect(run({ paths: [APPROVE_TO_ARCHIVE], moved: ["step_approve", "step_archive"], groups })).toEqual({});
    });

    it("stores both ends for a path between members of an expanded group", () => {
      const open = [{ ...groups[0], collapsed: false }];
      const points = run({ paths: [APPROVE_TO_ARCHIVE], moved: ["step_approve", "step_archive"], groups: open });
      expect(points.path_b?.source).toBeDefined();
      expect(points.path_b?.target).toBeDefined();
    });
  });

  it("skips a path with no id or no resolvable step", () => {
    expect(run({ paths: [{ from: "step_review", to: "step_approve" }, { id: "p", from: "step_review", to: "step_gone" }] })).toEqual({});
  });
});
