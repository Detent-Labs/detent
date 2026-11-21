import { describe, expect, it } from "bun:test";
import {
  autoPlaceSteps,
  drawnPositions,
  COLUMN_WIDTH,
  layoutAfterArrange,
  layoutAfterConnect,
  layoutAfterInsert,
  layoutAfterMove,
  readDockingPoints,
  withDockingPoints,
} from "../src/areas/studio/canvas/layout.js";

function step(id: string, paths: Array<{ to: string }> = []) {
  return { id, paths };
}

describe("canvas auto-place", () => {
  it("returns nothing when every step already has a layout entry", () => {
    const steps = [step("step_a"), step("step_b")];
    const existing = { step_a: { x: 1, y: 1 }, step_b: { x: 2, y: 2 } };
    expect(autoPlaceSteps(steps, "step_a", existing)).toEqual({});
  });

  it("places every step absent from layout at a distinct position", () => {
    const steps = [step("step_a", [{ to: "step_b" }]), step("step_b", [{ to: "step_c" }]), step("step_c")];
    const result = autoPlaceSteps(steps, "step_a", {});
    expect(Object.keys(result).sort()).toEqual(["step_a", "step_b", "step_c"]);
    const positions = Object.values(result).map((p) => `${p.x},${p.y}`);
    expect(new Set(positions).size).toBe(3);
  });

  it("only returns positions for missing steps, not ones already in layout", () => {
    const steps = [step("step_a", [{ to: "step_b" }]), step("step_b")];
    const result = autoPlaceSteps(steps, "step_a", { step_a: { x: 9, y: 9 } });
    expect(Object.keys(result)).toEqual(["step_b"]);
  });

  it("places a step reachable at a greater depth further along the column axis", () => {
    const steps = [step("step_a", [{ to: "step_b" }]), step("step_b", [{ to: "step_c" }]), step("step_c")];
    const result = autoPlaceSteps(steps, "step_a", {});
    expect(result.step_a.x).toBeLessThan(result.step_b.x);
    expect(result.step_b.x).toBeLessThan(result.step_c.x);
  });

  it("still places a step unreachable from initialStep, distinctly from it", () => {
    const steps = [step("step_a"), step("step_orphan")];
    const result = autoPlaceSteps(steps, "step_a", {});
    expect(result.step_orphan).toBeDefined();
    expect(result.step_orphan).not.toEqual(result.step_a);
  });

  it("places every step when initialStepId doesn't resolve to a known step", () => {
    const steps = [step("step_a"), step("step_b")];
    const result = autoPlaceSteps(steps, "step_missing", {});
    expect(Object.keys(result).sort()).toEqual(["step_a", "step_b"]);
    expect(result.step_a).not.toEqual(result.step_b);
  });

  it("is deterministic across repeated calls with the same input", () => {
    const steps = [step("step_a", [{ to: "step_b" }]), step("step_b")];
    expect(autoPlaceSteps(steps, "step_a", {})).toEqual(autoPlaceSteps(steps, "step_a", {}));
  });
});

/**
 * The one home of the rule `CanvasView.positionOf` renders by and the canvas
 * bar's press places against. Both call this function, so the nodes an author
 * sees and the nodes a new step is placed clear of cannot disagree.
 */
describe("canvas drawn positions", () => {
  const steps = [step("step_a", [{ to: "step_b" }]), step("step_b")];

  it("prefers a stored entry over the auto-placed one", () => {
    const drawn = drawnPositions(steps, "step_a", { step_a: { x: 400, y: 200 } });
    expect(drawn.step_a).toEqual({ x: 400, y: 200 });
  });

  it("takes the auto-placed position for a step absent from the blob", () => {
    // step_b sits one path from the initial step, so it lands one column over.
    const drawn = drawnPositions(steps, "step_a", { step_a: { x: 400, y: 200 } });
    expect(drawn.step_b).toEqual({ x: COLUMN_WIDTH, y: 0 });
  });

  // A malformed entry drives both assertions below, and no other input can.
  // `autoPlaceSteps` places every step whose blob entry is `undefined`, so a
  // step reaches the last resort only by carrying an entry the guard rejects.
  it("falls through the guard for a malformed stored entry", () => {
    const drawn = drawnPositions(steps, "step_a", { step_a: "nowhere" });
    expect(drawn.step_a).not.toEqual("nowhere");
  });

  it("takes the origin for a step no source places", () => {
    const drawn = drawnPositions(steps, "step_a", { step_a: "nowhere" });
    expect(drawn.step_a).toEqual({ x: 0, y: 0 });
  });

  it("keys the record by step id alone, so a reserved blob key stays out", () => {
    const drawn = drawnPositions(steps, "step_a", { waypoints: {}, groups: [], canvasEdgeStyle: "step" });
    expect(Object.keys(drawn).sort()).toEqual(["step_a", "step_b"]);
  });
});

describe("readDockingPoints", () => {
  it("reads nothing when the key is absent", () => {
    expect(readDockingPoints({})).toEqual({});
  });

  it("reads nothing when the key is not an object", () => {
    expect(readDockingPoints({ dockingPoints: "x" })).toEqual({});
    expect(readDockingPoints({ dockingPoints: null })).toEqual({});
    expect(readDockingPoints({ dockingPoints: [] })).toEqual({});
  });

  it("reads a well-formed source and target", () => {
    const entry = { source: { side: "bottom" as const, at: 3 }, target: { side: "left" as const, at: -1 } };
    expect(readDockingPoints({ dockingPoints: { path_a: entry } })).toEqual({ path_a: entry });
  });

  it("drops a malformed end and keeps the valid one", () => {
    const read = readDockingPoints({
      dockingPoints: { path_a: { source: { side: "middle", at: 0 }, target: { side: "top", at: 1 } } },
    });
    expect(read).toEqual({ path_a: { target: { side: "top", at: 1 } } });
  });

  it("drops an end that is not an object, a non-integer or a non-number position", () => {
    const read = readDockingPoints({
      dockingPoints: {
        path_a: { source: "right", target: null },
        path_b: { source: { side: "right", at: 0.5 }, target: { side: "right", at: "0" } },
      },
    });
    expect(read).toEqual({});
  });

  it("drops a position the side lacks", () => {
    const read = readDockingPoints({
      dockingPoints: {
        path_a: { source: { side: "left", at: 2 }, target: { side: "right", at: -2 } },
        path_b: { source: { side: "top", at: 4 }, target: { side: "bottom", at: -3 } },
      },
    });
    expect(read).toEqual({ path_b: { target: { side: "bottom", at: -3 } } });
  });

  it("drops an entry that is not an object", () => {
    expect(readDockingPoints({ dockingPoints: { path_a: 5, path_b: null } })).toEqual({});
  });
});

describe("withDockingPoints", () => {
  it("returns the ends a write stored, and leaves the input layout alone", () => {
    const layout = { step_a: { x: 1, y: 2 } };
    const ends = { source: { side: "right" as const, at: 0 }, target: { side: "top" as const, at: -2 } };
    const next = withDockingPoints(layout, "path_a", ends);
    expect(readDockingPoints(next)).toEqual({ path_a: ends });
    expect(next.step_a).toEqual({ x: 1, y: 2 });
    expect(layout).toEqual({ step_a: { x: 1, y: 2 } });
  });

  it("keeps the other paths' entries", () => {
    const first = withDockingPoints({}, "path_a", { source: { side: "left", at: 1 } });
    const second = withDockingPoints(first, "path_b", { target: { side: "left", at: -1 } });
    expect(Object.keys(readDockingPoints(second)).sort()).toEqual(["path_a", "path_b"]);
  });

  it("leaves no key for an empty entry", () => {
    const first = withDockingPoints({}, "path_a", { source: { side: "left", at: 0 } });
    const cleared = withDockingPoints(first, "path_a", {});
    expect((cleared.dockingPoints as Record<string, unknown>).path_a).toBeUndefined();
    expect("path_a" in (cleared.dockingPoints as Record<string, unknown>)).toBe(false);
    expect(readDockingPoints(first)).toEqual({ path_a: { source: { side: "left", at: 0 } } });
  });

  it("starts from an empty record when the stored value is a string or an array", () => {
    const end = { source: { side: "left" as const, at: 0 } };
    for (const stored of ["not a record", ["path_x"]]) {
      const next = withDockingPoints({ dockingPoints: stored }, "path_a", end);
      expect(next.dockingPoints).toEqual({ path_a: end });
    }
  });

  it("drops an end that is undefined", () => {
    const next = withDockingPoints({}, "path_a", { source: { side: "left", at: 0 }, target: undefined });
    expect(Object.keys((next.dockingPoints as Record<string, Record<string, unknown>>).path_a)).toEqual(["source"]);
  });
});

describe("layoutAfterArrange", () => {
  it("empties waypoints and dockingPoints and writes every position snapped to the grid", () => {
    const layout = {
      step_a: { x: 1, y: 1 },
      canvasEdgeStyle: "step",
      waypoints: { path_a: [{ x: 5, y: 5 }] },
      dockingPoints: { path_a: { source: { side: "right", at: 0 } } },
    };
    const next = layoutAfterArrange(layout, { step_a: { x: 31, y: 49 }, step_b: { x: 100, y: 0 } });
    expect(next.waypoints).toEqual({});
    expect(next.dockingPoints).toEqual({});
    expect(next.step_a).toEqual({ x: 40, y: 40 });
    expect(next.step_b).toEqual({ x: 100, y: 0 });
    expect(next.canvasEdgeStyle).toBe("step");
    expect(layout.waypoints.path_a).toHaveLength(1);
  });
});

describe("layoutAfterInsert", () => {
  const source = { side: "bottom" as const, at: 0 };
  const layout = {
    step_a: { x: 0, y: 0 },
    waypoints: { path_a: [{ x: 5, y: 5 }], path_b: [{ x: 7, y: 7 }] },
    dockingPoints: {
      path_a: { source, target: { side: "left", at: 1 } },
      path_b: { source: { side: "top", at: 0 } },
    },
  };

  it("keeps the source end, drops the target end and the waypoints of the split path", () => {
    const next = layoutAfterInsert(layout, "step_new", { x: 60, y: 80 }, "path_a");
    expect(next.step_new).toEqual({ x: 60, y: 80 });
    expect((next.waypoints as Record<string, unknown>).path_a).toBeUndefined();
    expect((next.waypoints as Record<string, unknown>).path_b).toEqual([{ x: 7, y: 7 }]);
    expect(readDockingPoints(next).path_a).toEqual({ source });
    expect(readDockingPoints(next).path_b).toEqual({ source: { side: "top", at: 0 } });
  });

  it("leaves no entry when the split path stored only a target end", () => {
    const only = { dockingPoints: { path_a: { target: { side: "left", at: 0 } } } };
    const next = layoutAfterInsert(only, "step_new", { x: 0, y: 0 }, "path_a");
    expect(readDockingPoints(next)).toEqual({});
    expect("path_a" in (next.dockingPoints as Record<string, unknown>)).toBe(false);
  });

  it("works on a layout with neither key", () => {
    const next = layoutAfterInsert({}, "step_new", { x: 1, y: 2 }, "path_a");
    expect(next.step_new).toEqual({ x: 1, y: 2 });
    expect(next.waypoints).toEqual({});
    expect(readDockingPoints(next)).toEqual({});
  });
});

describe("layoutAfterMove", () => {
  it("writes every position and every point in one result", () => {
    const layout = {
      step_a: { x: 0, y: 0 },
      dockingPoints: { path_old: { source: { side: "left", at: 0 } } },
    };
    const next = layoutAfterMove(
      layout,
      { step_a: { x: 20, y: 40 }, step_b: { x: 60, y: 80 } },
      { path_1: { source: { side: "right", at: 1 } }, path_2: { target: { side: "top", at: -3 } } },
    );
    expect(next.step_a).toEqual({ x: 20, y: 40 });
    expect(next.step_b).toEqual({ x: 60, y: 80 });
    expect(readDockingPoints(next)).toEqual({
      path_old: { source: { side: "left", at: 0 } },
      path_1: { source: { side: "right", at: 1 } },
      path_2: { target: { side: "top", at: -3 } },
    });
    expect(layout.step_a).toEqual({ x: 0, y: 0 });
  });
});

describe("layoutAfterConnect", () => {
  const ends = { source: { side: "right", at: 0 }, target: { side: "left", at: 0 } } as const;
  const steps = [
    step("step_review", [{ to: "step_other" }]),
    step("step_other"),
    step("step_approve"),
    step("step_member"),
  ];

  it("stores the drawn position of every step that stores none, with the points", () => {
    const layout = {};
    const drawn = drawnPositions(steps, "step_review", layout);
    const next = layoutAfterConnect(layout, "path_1", ends, drawn);
    for (const s of steps) expect(next[s.id]).toEqual(drawn[s.id]);
    expect(readDockingPoints(next)).toEqual({ path_1: ends });
    expect(layout).toEqual({});
  });

  it("keeps a position a step already stores", () => {
    const layout: Record<string, unknown> = { step_review: { x: 100, y: 60 } };
    const drawn: Record<string, { x: number; y: number }> = { ...drawnPositions(steps, "step_review", layout), step_new: { x: 300, y: 80 } };
    const next = layoutAfterConnect(layout, "path_1", { source: ends.source }, drawn);
    expect(next.step_review).toEqual({ x: 100, y: 60 });
    expect(next.step_new).toEqual({ x: 300, y: 80 });
    expect(next.step_approve).toEqual(drawn.step_approve);
    expect(readDockingPoints(next)).toEqual({ path_1: { source: ends.source } });
  });

  it("stores a hidden member's own position, not a group box's", () => {
    const own = { step_review: { x: 0, y: 0 }, step_member: { x: 240, y: 120 } };
    const next = layoutAfterConnect({}, "path_1", ends, own);
    expect(next.step_member).toEqual({ x: 240, y: 120 });
  });
});
