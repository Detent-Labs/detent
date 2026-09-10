import { describe, expect, it } from "bun:test";
import { autoPlaceSteps, drawnPositions, COLUMN_WIDTH } from "../src/areas/studio/canvas/layout.js";

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
