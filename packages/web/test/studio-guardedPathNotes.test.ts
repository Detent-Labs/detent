import { describe, expect, it } from "bun:test";
import type { Step } from "workflow-engine/schema";
import type { DraftOf } from "../src/areas/studio/draft/types.js";
import type { DraftField } from "../src/areas/studio/draft/fields.js";
import { guardedManualPathNotes } from "../src/areas/studio/draft/guarded-path-notes.js";
import { buildOperands } from "../src/areas/studio/panels/shared/conditionLogic.js";

/**
 * `studio-form-editor`: the preview prints one line per guarded manual path,
 * naming the path and its condition in the canvas edge's words. These are the
 * lines it prints.
 */

type DraftStep = DraftOf<Step>;

const FIELDS = [
  { id: "field_00000000-0000-4000-8000-0000000000a1", key: "amount", type: "number", label: { en: "Amount" } },
] as unknown as DraftField[];

const operands = buildOperands({ fields: FIELDS, locale: "en", baseLocale: "en" });

function step(paths: Array<Record<string, unknown>>): DraftStep {
  return { id: "step_a", key: "intake", type: "task", paths } as unknown as DraftStep;
}

const GUARD = { lang: "cel", src: "data.amount > 1000.0" };

describe("guardedManualPathNotes", () => {
  it("names a guarded manual path and its condition in words", () => {
    const notes = guardedManualPathNotes(
      step([{ id: "path_1", key: "approve", label: "Approve", to: "step_b", trigger: "manual", guard: GUARD }]),
      operands,
    );

    expect(notes).toEqual([
      { pathId: "path_1", label: "Approve", condition: "Amount is greater than 1,000", raw: false },
    ]);
  });

  it("gives an unguarded manual path no note", () => {
    const notes = guardedManualPathNotes(
      step([{ id: "path_1", key: "approve", label: "Approve", to: "step_b", trigger: "manual" }]),
      operands,
    );

    expect(notes).toEqual([]);
  });

  it("gives a guarded automatic path no note", () => {
    const notes = guardedManualPathNotes(
      step([{ id: "path_1", key: "onward", label: "Onward", to: "step_b", trigger: "automatic", priority: 1, guard: GUARD }]),
      operands,
    );

    expect(notes).toEqual([]);
  });

  it("prints the CEL text of a guard the builder cannot read", () => {
    const notes = guardedManualPathNotes(
      step([
        { id: "path_1", key: "approve", label: "Approve", to: "step_b", trigger: "manual", guard: { lang: "cel", src: "data.amount >" } },
      ]),
      operands,
    );

    expect(notes).toEqual([{ pathId: "path_1", label: "Approve", condition: "data.amount >", raw: true }]);
  });

  it("marks a guard that parses but reads as no row as CEL text", () => {
    const src = "size(data.amount) > 3";
    const notes = guardedManualPathNotes(
      step([{ id: "path_1", key: "approve", label: "Approve", to: "step_b", trigger: "manual", guard: { lang: "cel", src } }]),
      operands,
    );

    expect(notes).toEqual([{ pathId: "path_1", label: "Approve", condition: src, raw: true }]);
  });

  it("keeps the step's own path order", () => {
    const notes = guardedManualPathNotes(
      step([
        { id: "path_1", key: "approve", label: "Approve", to: "step_b", trigger: "manual", guard: GUARD },
        { id: "path_2", key: "reject", label: "Reject", to: "step_c", trigger: "manual" },
        { id: "path_3", key: "escalate", label: "Escalate", to: "step_d", trigger: "manual", guard: { lang: "cel", src: "data.amount > 5000.0" } },
      ]),
      operands,
    );

    expect(notes.map((n) => n.pathId)).toEqual(["path_1", "path_3"]);
  });

  it("gives a step with no paths no note", () => {
    expect(guardedManualPathNotes({ id: "step_a", type: "task" } as unknown as DraftStep, operands)).toEqual([]);
  });
});
