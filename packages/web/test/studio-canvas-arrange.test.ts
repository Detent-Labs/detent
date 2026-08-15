import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { arrangeSteps, hasHandPlacedStep } from "../src/areas/studio/canvas/arrange.js";
import { GRID_STEP } from "../src/areas/studio/canvas/geometry.js";
import type { StepGroup } from "../src/areas/studio/canvas/groups.js";

function step(id: string, paths: Array<{ to: string }> = []) {
  return { id, paths };
}

function group(id: string, stepIds: string[], collapsed = false): StepGroup {
  return { id, stepIds, name: id, collapsed };
}

const example = (name: string) => {
  const raw = JSON.parse(readFileSync(new URL(`../../../examples/${name}`, import.meta.url), "utf-8"));
  const body = raw.definition ?? raw;
  const steps = (body.workflow?.steps ?? []).map((s: { id: string; paths?: Array<{ to?: string }> }) => ({
    id: s.id,
    paths: (s.paths ?? []).filter((p): p is { to: string } => !!p.to),
  }));
  return { steps, initialStepId: body.workflow?.initialStep as string | undefined };
};

describe("arrangeSteps", () => {
  it("returns an explicit position for every step, including one already placed", () => {
    const steps = [step("step_a", [{ to: "step_b" }]), step("step_b")];
    const result = arrangeSteps(steps, [], "step_a", { step_a: { x: 9, y: 9 } });
    expect(Object.keys(result).sort()).toEqual(["step_a", "step_b"]);
  });

  it("arranges a group whose members carry no entry in existingLayout", () => {
    const steps = [step("step_a", [{ to: "step_b" }]), step("step_b")];
    const groups = [group("group_1", ["step_a", "step_b"])];
    const result = arrangeSteps(steps, groups, "step_a", {});
    expect(result.step_a).toBeDefined();
    expect(result.step_b).toBeDefined();
  });

  it("arranges a chain in flow order", () => {
    const steps = [step("step_a", [{ to: "step_b" }]), step("step_b", [{ to: "step_c" }]), step("step_c")];
    const result = arrangeSteps(steps, [], "step_a", {});
    expect(result.step_a.x).toBeLessThan(result.step_b.x);
    expect(result.step_b.x).toBeLessThan(result.step_c.x);
  });

  it("arranges a two-step cycle with no thrown error, giving both a position", () => {
    const steps = [step("step_a", [{ to: "step_b" }]), step("step_b", [{ to: "step_a" }])];
    let result: Record<string, { x: number; y: number }> = {};
    expect(() => {
      result = arrangeSteps(steps, [], "step_a", {});
    }).not.toThrow();
    expect(result.step_a).toBeDefined();
    expect(result.step_b).toBeDefined();
  });

  it("moves a collapsed group's members together, keeping their relative offset", () => {
    const steps = [step("step_a"), step("step_b"), step("step_far", [{ to: "step_a" }])];
    const groups = [group("group_1", ["step_a", "step_b"], true)];
    const existing = { step_a: { x: 0, y: 0 }, step_b: { x: 40, y: 0 }, step_far: { x: 800, y: 800 } };
    const result = arrangeSteps(steps, groups, "step_far", existing);
    const before = { x: existing.step_b.x - existing.step_a.x, y: existing.step_b.y - existing.step_a.y };
    const after = { x: result.step_b.x - result.step_a.x, y: result.step_b.y - result.step_a.y };
    expect(after).toEqual(before);
  });

  it("moves an expanded group's members together, keeping their relative offset", () => {
    const steps = [step("step_a"), step("step_b"), step("step_far", [{ to: "step_a" }])];
    const groups = [group("group_1", ["step_a", "step_b"], false)];
    const existing = { step_a: { x: 0, y: 0 }, step_b: { x: 40, y: 60 }, step_far: { x: 800, y: 800 } };
    const result = arrangeSteps(steps, groups, "step_far", existing);
    const before = { x: existing.step_b.x - existing.step_a.x, y: existing.step_b.y - existing.step_a.y };
    const after = { x: result.step_b.x - result.step_a.x, y: result.step_b.y - result.step_a.y };
    expect(after).toEqual(before);
  });

  it("still positions a disconnected step, with no path in or out", () => {
    const steps = [step("step_a", [{ to: "step_b" }]), step("step_b"), step("step_orphan")];
    const result = arrangeSteps(steps, [], "step_a", {});
    expect(result.step_orphan).toBeDefined();
  });

  it("returns every position on the lattice", () => {
    const steps = [step("step_a", [{ to: "step_b" }]), step("step_b", [{ to: "step_c" }]), step("step_c")];
    const result = arrangeSteps(steps, [], "step_a", {});
    for (const p of Object.values(result)) {
      expect(p.x % GRID_STEP).toBe(0);
      expect(p.y % GRID_STEP).toBe(0);
    }
  });

  it("arranges expense-approval.json's real cyclic graph with no thrown error", () => {
    const { steps, initialStepId } = example("expense-approval.json");
    let result: Record<string, unknown> = {};
    expect(() => {
      result = arrangeSteps(steps, [], initialStepId, {});
    }).not.toThrow();
    expect(Object.keys(result).sort()).toEqual(steps.map((s: { id: string }) => s.id).sort());
  });

  it("arranges purchase-requisition.json's real cyclic graph with no thrown error", () => {
    const { steps, initialStepId } = example("purchase-requisition.json");
    let result: Record<string, unknown> = {};
    expect(() => {
      result = arrangeSteps(steps, [], initialStepId, {});
    }).not.toThrow();
    expect(Object.keys(result).sort()).toEqual(steps.map((s: { id: string }) => s.id).sort());
  });
});

describe("hasHandPlacedStep", () => {
  it("reports true on a draft with one stored step position", () => {
    const steps = [step("step_a"), step("step_b")];
    expect(hasHandPlacedStep(steps, { step_a: { x: 1, y: 1 } })).toBe(true);
  });

  it("reports true on a draft with only a waypoint, no stored step position", () => {
    const steps = [step("step_a"), step("step_b")];
    expect(hasHandPlacedStep(steps, { waypoints: { path_1: [{ x: 1, y: 1 }] } })).toBe(true);
  });

  it("reports false on a draft with neither a stored step position nor a waypoint", () => {
    const steps = [step("step_a"), step("step_b")];
    expect(hasHandPlacedStep(steps, {})).toBe(false);
  });
});
