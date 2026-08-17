import { describe, expect, it } from "bun:test";
import type { Step } from "workflow-engine/schema";
import type { DraftOf } from "../src/areas/studio/draft/types.js";
import { insertOnPath } from "../src/areas/studio/draft/insertOnPath.js";
import { newStep } from "../src/areas/studio/draft/createStep.js";

type DraftStep = DraftOf<Step>;

// Plain object literals cast past the branded StepId/PathId types, the same
// pattern studio-draftValidationLogic.test.ts uses for a hand-built Draft.
const submit = {
  id: "step_submit",
  key: "submit",
  label: { en: "Submit" },
  type: "task" as const,
  paths: [{ id: "path_1", key: "", to: "step_approve", trigger: "manual" as const }],
} as unknown as DraftStep;
const approve = { id: "step_approve", key: "approve", label: { en: "Approve" }, type: "task" as const } as unknown as DraftStep;

describe("insertOnPath", () => {
  it("retargets the source step's path to the new step, and gives the new step one path to the old target", () => {
    const inserted = newStep("task", { en: "Review" });
    const next = insertOnPath([submit, approve], "step_submit", "path_1", inserted);

    const source = next.find((s) => s.id === "step_submit")!;
    expect(source.paths).toHaveLength(1);
    expect(String(source.paths![0].id)).toBe("path_1");
    expect(source.paths![0].to).toBe(inserted.id);

    const newStepEntry = next.find((s) => s.id === inserted.id)!;
    expect(newStepEntry.paths).toHaveLength(1);
    expect(String(newStepEntry.paths![0].to)).toBe("step_approve");
  });

  it("keeps the retargeted path's id, key, guard and priority", () => {
    const guarded = {
      ...submit,
      paths: [
        {
          id: "path_1",
          key: "fast-track",
          to: "step_approve",
          trigger: "automatic" as const,
          guard: { lang: "cel" as const, src: "data.amount < 100" },
          priority: 10,
        },
      ],
    } as unknown as DraftStep;
    const inserted = newStep("task", { en: "Review" });
    const next = insertOnPath([guarded, approve], "step_submit", "path_1", inserted);

    const source = next.find((s) => s.id === "step_submit")!;
    expect(String(source.paths![0].id)).toBe("path_1");
    expect(source.paths![0].key).toBe("fast-track");
    expect(source.paths![0].guard).toEqual({ lang: "cel", src: "data.amount < 100" });
    expect(source.paths![0].priority).toBe(10);
  });

  it("the new path inherits the trigger alone: manual source path yields a manual new path with no guard/priority", () => {
    const inserted = newStep("task", { en: "Review" });
    const next = insertOnPath([submit, approve], "step_submit", "path_1", inserted);

    const newStepEntry = next.find((s) => s.id === inserted.id)!;
    expect(newStepEntry.paths![0].trigger).toBe("manual");
    expect(newStepEntry.paths![0].guard).toBeUndefined();
    expect(newStepEntry.paths![0].priority).toBeUndefined();
  });

  it("an automatic source path carrying a priority yields an automatic new path with no guard/priority of its own", () => {
    const automatic = {
      ...submit,
      paths: [{ id: "path_1", key: "", to: "step_approve", trigger: "automatic" as const, priority: 5 }],
    } as unknown as DraftStep;
    const inserted = newStep("task", { en: "Review" });
    const next = insertOnPath([automatic, approve], "step_submit", "path_1", inserted);

    const source = next.find((s) => s.id === "step_submit")!;
    expect(source.paths![0].priority).toBe(5);

    const newStepEntry = next.find((s) => s.id === inserted.id)!;
    expect(newStepEntry.paths![0].trigger).toBe("automatic");
    expect(newStepEntry.paths![0].guard).toBeUndefined();
    expect(newStepEntry.paths![0].priority).toBeUndefined();
  });

  it("mutates no input", () => {
    const before = JSON.stringify(submit);
    insertOnPath([submit, approve], "step_submit", "path_1", newStep("task", { en: "Review" }));
    expect(JSON.stringify(submit)).toBe(before);
  });

  it("is a no-op when the source step or path is not found", () => {
    const inserted = newStep("task", { en: "Review" });
    const next = insertOnPath([submit, approve], "step_missing", "path_1", inserted);
    expect(next).toEqual([submit, approve]);
  });
});
