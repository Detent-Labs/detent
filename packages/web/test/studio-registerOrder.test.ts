/**
 * The steps register's row order (`draft/registerOrder.ts`), tested as a pure
 * function — no DOM, no rendering.
 *
 * The first case runs over `examples/expense-approval.json` because that
 * definition is the one graph in the repository that separates breadth-first
 * from depth-first: `escalated_review` sits two hops from `capture` and
 * `booking_error` three, while the draft's own array puts `booking_error`
 * first. A depth-first walk would swap them.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import type { Step } from "workflow-engine/schema";
import type { DraftOf } from "../src/areas/studio/draft/types.js";
import { registerOrder } from "../src/areas/studio/draft/registerOrder.js";

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

function keys(steps: DraftStep[]): (string | undefined)[] {
  return steps.map((s) => s.key);
}

describe("registerOrder over examples/expense-approval.json", () => {
  const raw = JSON.parse(readFileSync(new URL("../../../examples/expense-approval.json", import.meta.url), "utf-8"));
  const body = raw.definition as { workflow: { initialStep: string; steps: DraftStep[] } };

  it("lists the reachable steps breadth-first, then the terminal ones", () => {
    expect(keys(registerOrder(body.workflow.steps, body.workflow.initialStep))).toEqual([
      "capture",
      "review",
      "book",
      "escalated_review",
      "booking_error",
      "booked",
      "rejected",
    ]);
  });

  it("keeps every step, losing none and repeating none", () => {
    const ordered = registerOrder(body.workflow.steps, body.workflow.initialStep);
    expect(ordered).toHaveLength(body.workflow.steps.length);
    expect(new Set(ordered.map((s) => s.id)).size).toBe(body.workflow.steps.length);
  });
});

describe("registerOrder", () => {
  it("lists the initial step, then what it reaches, then a terminal step", () => {
    const steps = [
      step("step_c", "done", [], { terminal: true }),
      step("step_b", "middle", ["step_c"]),
      step("step_a", "start", ["step_b"]),
    ];
    expect(keys(registerOrder(steps, "step_a"))).toEqual(["start", "middle", "done"]);
  });

  it("puts a step no path reaches after the reachable ones and before the terminal ones", () => {
    const steps = [
      step("step_a", "start", ["step_b"]),
      step("step_b", "middle", ["step_d"]),
      step("step_c", "orphan"),
      step("step_d", "done", [], { terminal: true }),
    ];
    expect(keys(registerOrder(steps, "step_a"))).toEqual(["start", "middle", "orphan", "done"]);
  });

  it("holds the draft's own order among the terminal steps, reached or not", () => {
    const steps = [
      step("step_a", "start", ["step_z"]),
      step("step_z", "reached_end", [], { terminal: true }),
      step("step_y", "orphan_end", [], { terminal: true }),
    ];
    expect(keys(registerOrder(steps, "step_a"))).toEqual(["start", "reached_end", "orphan_end"]);
  });

  it("prefers the shorter route: a two-hop step outranks a three-hop one", () => {
    const steps = [
      step("step_a", "start", ["step_b", "step_c"]),
      step("step_b", "one_hop", ["step_d"]),
      step("step_c", "two_hop"),
      step("step_d", "three_hop"),
    ];
    expect(keys(registerOrder(steps, "step_a"))).toEqual(["start", "one_hop", "two_hop", "three_hop"]);
  });

  it("walks a cycle once", () => {
    const steps = [step("step_a", "start", ["step_b"]), step("step_b", "loop", ["step_a"])];
    expect(keys(registerOrder(steps, "step_a"))).toEqual(["start", "loop"]);
  });

  it("skips a path naming a step the draft no longer holds", () => {
    const steps = [step("step_a", "start", ["step_gone", "step_b"]), step("step_b", "kept")];
    expect(keys(registerOrder(steps, "step_a"))).toEqual(["start", "kept"]);
  });

  it("lists every step in the draft's own order when `initialStep` names none of them", () => {
    const steps = [step("step_a", "first", ["step_b"]), step("step_b", "second")];
    expect(keys(registerOrder(steps, "step_gone"))).toEqual(["first", "second"]);
    expect(keys(registerOrder(steps, undefined))).toEqual(["first", "second"]);
  });

  it("treats a step carrying no id as unreachable rather than throwing", () => {
    const steps = [step("step_a", "start"), ds({ key: "mid_edit" })];
    expect(keys(registerOrder(steps, "step_a"))).toEqual(["start", "mid_edit"]);
  });

  it("returns no row for an empty draft and none for no steps at all", () => {
    expect(registerOrder([], "step_a")).toEqual([]);
    expect(registerOrder(undefined, "step_a")).toEqual([]);
  });
});
