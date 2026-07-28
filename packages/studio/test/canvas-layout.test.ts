import { describe, expect, it } from "bun:test";
import { autoPlaceSteps } from "../src/canvas/layout.js";

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
