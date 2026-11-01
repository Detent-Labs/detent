import { describe, expect, it } from "bun:test";
import type { Draft } from "../src/areas/studio/draft/types.js";
import { askedOnRows } from "../src/areas/studio/panels/askedOnRows.js";

const cel = (src: string) => ({ lang: "cel" as const, src });

function draft(steps: unknown[]): Draft {
  return {
    baseLocale: "en",
    fields: [
      { id: "field_amount", key: "amount", label: { en: "Amount" }, type: "number" },
      { id: "field_note", key: "note", label: { en: "Note" }, type: "string" },
    ],
    workflow: { initialStep: "step_review", steps },
  } as unknown as Draft;
}

const step = (id: string, label: string | undefined, fields: unknown[]) => ({
  id,
  key: id,
  ...(label === undefined ? {} : { label: { en: label } }),
  type: "task",
  view: { fields },
});

describe("askedOnRows", () => {
  it("prints the three literal marks, one per step, in draft order", () => {
    const rows = askedOnRows(
      draft([
        step("step_review", "Review", [{ ref: "field_note", required: true }]),
        step("step_approve", "Approve", [{ ref: "field_note", readonly: true }]),
        step("step_book", "Book", [{ ref: "field_note", visible: false }]),
      ]),
      "field_note",
      "en",
    );
    expect(rows).toEqual([
      { stepId: "step_review", stepLabel: "Review", marks: ["required"] },
      { stepId: "step_approve", stepLabel: "Approve", marks: ["readonly"] },
      { stepId: "step_book", stepLabel: "Book", marks: ["hidden"] },
    ]);
  });

  it("holds every mark one entry carries", () => {
    const [row] = askedOnRows(draft([step("step_a", "A", [{ ref: "field_note", required: true, readonly: true, visible: false }])]), "field_note", "en");
    expect(row!.marks).toEqual(["required", "readonly", "hidden"]);
  });

  it("marks nothing for a literal false or an absent flag", () => {
    const [row] = askedOnRows(draft([step("step_a", "A", [{ ref: "field_note", required: false, visible: true }])]), "field_note", "en");
    expect(row).toEqual({ stepId: "step_a", stepLabel: "A", marks: [] });
  });

  it("reads a visible expression as a sentence", () => {
    const [row] = askedOnRows(draft([step("step_review", "Review", [{ ref: "field_note", visible: cel("data.amount > 0.0") }])]), "field_note", "en");
    expect(row).toEqual({ stepId: "step_review", stepLabel: "Review", marks: [], sentence: "Amount is greater than 0." });
  });

  it("gives a conditional requiredness or read-only no mark and no sentence", () => {
    const [row] = askedOnRows(
      draft([step("step_review", "Review", [{ ref: "field_note", required: cel("data.amount > 0.0"), readonly: cel("data.amount > 1.0") }])]),
      "field_note",
      "en",
    );
    expect(row).toEqual({ stepId: "step_review", stepLabel: "Review", marks: [] });
    expect("sentence" in row!).toBe(false);
  });

  it("reads each step's own condition", () => {
    const rows = askedOnRows(
      draft([
        step("step_review", "Review", [{ ref: "field_note", visible: cel("data.amount > 0.0") }]),
        step("step_approve", "Approve", [{ ref: "field_note", visible: cel("data.amount > 5.0") }]),
      ]),
      "field_note",
      "en",
    );
    expect(rows.map((r) => r.sentence)).toEqual(["Amount is greater than 0.", "Amount is greater than 5."]);
  });

  it("names an unlabelled step as the unnamed step", () => {
    const [row] = askedOnRows(draft([step("step_a", undefined, [{ ref: "field_note" }])]), "field_note", "en");
    expect(row!.stepLabel).toBe("(unnamed step)");
  });

  it("skips a step that does not hold the field, one with no form, and a note entry", () => {
    const rows = askedOnRows(
      draft([
        step("step_a", "A", [{ ref: "field_amount" }, { kind: "note", text: { en: "x" } }]),
        { id: "step_b", key: "b", label: { en: "B" }, type: "task" },
        step("step_c", "C", [{ ref: "field_note" }]),
      ]),
      "field_note",
      "en",
    );
    expect(rows.map((r) => r.stepId)).toEqual(["step_c"]);
  });

  it("answers no row for a field no form holds", () => {
    expect(askedOnRows(draft([step("step_a", "A", [{ ref: "field_amount" }])]), "field_note", "en")).toEqual([]);
  });

  it("reads a step label at the content locale, else the base locale", () => {
    const d = draft([{ ...step("step_a", "Review", [{ ref: "field_note" }]), label: { en: "Review", de: "Prüfen" } }]);
    expect(askedOnRows(d, "field_note", "de")[0]!.stepLabel).toBe("Prüfen");
    expect(askedOnRows(d, "field_note", "fr")[0]!.stepLabel).toBe("Review");
  });
});
