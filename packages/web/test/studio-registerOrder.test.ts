/**
 * `reachableStepIds` (`draft/registerOrder.ts`), tested as a pure function —
 * no DOM, no rendering.
 */
import { describe, expect, it } from "bun:test";
import type { Step } from "workflow-engine/schema";
import type { DraftOf } from "../src/areas/studio/draft/types.js";
import { reachableStepIds } from "../src/areas/studio/draft/registerOrder.js";

type DraftStep = DraftOf<Step>;

/** Branded ids (`StepId`, `PathId`) are `string & $brand<...>`, so a literal
 * fixture cannot satisfy them directly. `studio-pathRows.test.ts` sets the
 * convention: build the literal loosely, then cast once. */
function ds(entry: Record<string, unknown>): DraftStep {
  return entry as DraftStep;
}

function step(id: string, key: string, targets: string[] = [], extra: Record<string, unknown> = {}): DraftStep {
  return ds({
    id,
    key,
    paths: targets.map((to, i) => ({ id: `path_${id}_${i}`, to, trigger: "manual" })),
    ...extra,
  });
}

describe("reachableStepIds", () => {
  it("holds a reached terminal step", () => {
    const steps = [
      step("step_a", "start", ["step_b"]),
      step("step_b", "reached_end", [], { terminal: true }),
      step("step_c", "orphan_end", [], { terminal: true }),
    ];
    expect(reachableStepIds(steps, "step_a")).toEqual(new Set(["step_a", "step_b"]));
  });

  it("excludes a terminal step no path reaches", () => {
    const steps = [step("step_a", "start"), step("step_b", "orphan_end", [], { terminal: true })];
    expect(reachableStepIds(steps, "step_a").has("step_b")).toBe(false);
  });

  it("never visits a step carrying no id", () => {
    const steps = [step("step_a", "start"), ds({ key: "mid_edit" })];
    expect(reachableStepIds(steps, "step_a")).toEqual(new Set(["step_a"]));
  });

  it("skips a path naming a step the draft no longer holds", () => {
    const steps = [step("step_a", "start", ["step_gone", "step_b"]), step("step_b", "kept")];
    expect(reachableStepIds(steps, "step_a")).toEqual(new Set(["step_a", "step_b"]));
  });

  it("returns an empty set when the draft names no initial step", () => {
    const steps = [step("step_a", "first", ["step_b"]), step("step_b", "second")];
    expect(reachableStepIds(steps, "step_gone")).toEqual(new Set());
    expect(reachableStepIds(steps, undefined)).toEqual(new Set());
  });
});
