/**
 * The role a step's stamp reads (`draft/roleStamp.ts`), tested as a pure
 * function — no DOM, no rendering.
 *
 * The precedence cases matter more than the four plain ones. A draft is
 * mid-edit, so the initial step can carry `terminal: true` and a subprocess
 * step can be the initial step. Each such step wears exactly one stamp, and
 * these pin which.
 */
import { describe, expect, it } from "bun:test";
import type { Step } from "workflow-engine/schema";
import type { DraftOf } from "../src/areas/studio/draft/types.js";
import { roleStampFor } from "../src/areas/studio/draft/roleStamp.js";

type DraftStep = DraftOf<Step>;

function ds(entry: Record<string, unknown>): DraftStep {
  return entry as DraftStep;
}

describe("roleStampFor", () => {
  it("reads Initial, in the open tone, for the draft's initialStep", () => {
    expect(roleStampFor(ds({ id: "step_a", type: "task" }), "step_a")).toEqual({ role: "initial", tone: "open" });
  });

  it("reads Task, in the settled tone, for an ordinary step", () => {
    expect(roleStampFor(ds({ id: "step_b", type: "task" }), "step_a")).toEqual({ role: "task", tone: "settled" });
  });

  it("reads Subprocess, in the settled tone, for a step of that type", () => {
    expect(roleStampFor(ds({ id: "step_b", type: "subprocess" }), "step_a")).toEqual({ role: "subprocess", tone: "settled" });
  });

  it("reads End, in the dormant tone, for a terminal step", () => {
    expect(roleStampFor(ds({ id: "step_b", type: "task", terminal: true }), "step_a")).toEqual({ role: "end", tone: "dormant" });
  });

  it("reads Task for a step carrying no type yet", () => {
    expect(roleStampFor(ds({ id: "step_b" }), "step_a")).toEqual({ role: "task", tone: "settled" });
  });

  it("prefers Initial over End on a terminal initial step", () => {
    expect(roleStampFor(ds({ id: "step_a", type: "task", terminal: true }), "step_a").role).toBe("initial");
  });

  it("prefers End over Subprocess on a terminal subprocess step", () => {
    expect(roleStampFor(ds({ id: "step_b", type: "subprocess", terminal: true }), "step_a").role).toBe("end");
  });

  it("reads Task for a step carrying no id, whatever the initial step is", () => {
    expect(roleStampFor(ds({ type: "task" }), undefined).role).toBe("task");
    expect(roleStampFor(ds({ type: "task" }), "step_a").role).toBe("task");
  });
});
