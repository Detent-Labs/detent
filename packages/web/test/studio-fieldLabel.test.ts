import { describe, expect, it } from "bun:test";
import { writeFieldLabel } from "../src/areas/studio/draft/fieldLabel.js";
import { draftFields } from "../src/areas/studio/draft/fields.js";
import type { Draft } from "../src/areas/studio/draft/types.js";

/**
 * The form editor's one label write (design.md D4). The card's input and the
 * strip's Name control both call it inside `mutate`, so the cases here are the
 * key rule the two share with the Fields tab.
 */

const fieldIn = (d: Draft, id: string) => draftFields(d).find((f) => f.id === id)!;

const draftWith = (fields: unknown[], viewFields: unknown[] = []): Draft =>
  ({
    baseLocale: "en",
    fields,
    workflow: {
      initialStep: "step_a",
      steps: [{ id: "step_a", key: "a", label: { en: "A" }, type: "task", view: { fields: viewFields } }],
    },
  }) as unknown as Draft;

type Step = { paths?: unknown[] };
const stepOf = (d: Draft) => d.workflow!.steps![0] as unknown as Step;

/** Puts one way out on the draft's step, guarded by `src`. */
const guardOn = (d: Draft, src: string) => {
  stepOf(d).paths = [{ id: "path_a", key: "p", label: "P", to: "step_a", trigger: "manual", guard: { lang: "cel", src } }];
};
const guardSrc = (d: Draft) => (stepOf(d).paths![0] as { guard: { src: string } }).guard.src;

describe("writeFieldLabel", () => {
  it("writes the label and lets a key-less field's key follow it", () => {
    const d = draftWith([{ id: "field_a", key: "", type: "number", label: { en: "" } }]);
    writeFieldLabel(d, "field_a", { en: "Amount" }, "en", new Set());

    expect(fieldIn(d, "field_a").label).toEqual({ en: "Amount" });
    expect(fieldIn(d, "field_a").key).toBe("amount");
  });

  it("dedupes the key against the catalog, and ignores another key-less field", () => {
    const d = draftWith([
      { id: "field_a", key: "amount", type: "number", label: { en: "Amount" } },
      { id: "field_b", key: "", type: "number", label: { en: "" } },
      { id: "field_c", key: "", type: "number", label: { en: "" } },
    ]);
    writeFieldLabel(d, "field_b", { en: "Amount" }, "en", new Set());
    expect(fieldIn(d, "field_b").key).toBe("amount_2");

    writeFieldLabel(d, "field_c", { en: "Total" }, "en", new Set());
    expect(fieldIn(d, "field_c").key).toBe("total");
  });

  it("keeps the key of a field a published version holds, and writes the label", () => {
    const d = draftWith([{ id: "field_a", key: "amount", type: "number", label: { en: "Amount" } }]);
    writeFieldLabel(d, "field_a", { en: "Total" }, "en", new Set(["field_a"]));

    expect(fieldIn(d, "field_a").label).toEqual({ en: "Total" });
    expect(fieldIn(d, "field_a").key).toBe("amount");
  });

  it("keeps every key while the base version has not loaded", () => {
    const d = draftWith([{ id: "field_a", key: "amount", type: "number", label: { en: "Amount" } }]);
    writeFieldLabel(d, "field_a", { en: "Total" }, "en", undefined);

    expect(fieldIn(d, "field_a").key).toBe("amount");
  });

  it("finds a field nested in a group and dedupes against the whole tree", () => {
    const d = draftWith([
      { id: "field_top", key: "amount", type: "number", label: { en: "Amount" } },
      {
        id: "field_group",
        key: "items",
        type: "group",
        label: { en: "Items" },
        fields: [{ id: "field_nested", key: "", type: "number", label: { en: "" } }],
      },
    ]);
    writeFieldLabel(d, "field_nested", { en: "Amount" }, "en", new Set());

    expect(fieldIn(d, "field_nested").label).toEqual({ en: "Amount" });
    expect(fieldIn(d, "field_nested").key).toBe("amount_2");
  });

  it("sends a group through the group writer, which rewrites the view entries naming its key", () => {
    const d = draftWith(
      [
        {
          id: "field_group",
          key: "items",
          type: "group",
          label: { en: "Items" },
          fields: [{ id: "field_nested", key: "qty", type: "number", label: { en: "Qty" } }],
        },
      ],
      [{ ref: "field_group" }, { ref: "field_nested", group: "items" }],
    );
    writeFieldLabel(d, "field_group", { en: "Line items" }, "en", new Set());

    expect(fieldIn(d, "field_group").label).toEqual({ en: "Line items" });
    expect(fieldIn(d, "field_group").key).toBe("line_items");
    expect(d.workflow!.steps![0]!.view!.fields as unknown).toEqual([{ ref: "field_group" }, { ref: "field_nested", group: "line_items" }]);
  });

  it("rewrites a guard that reads the key the label moves", () => {
    const d = draftWith([{ id: "field_a", key: "amount", type: "number", label: { en: "Amount" } }]);
    guardOn(d, "data.amount > 1000.0");
    writeFieldLabel(d, "field_a", { en: "Total amount" }, "en", new Set());

    expect(fieldIn(d, "field_a").key).toBe("total_amount");
    expect(guardSrc(d)).toBe("data.total_amount > 1000.0");
  });

  it("leaves the guard on a published field, whose key stays", () => {
    const d = draftWith([{ id: "field_a", key: "amount", type: "number", label: { en: "Amount" } }]);
    guardOn(d, "data.amount > 1000.0");
    writeFieldLabel(d, "field_a", { en: "Total amount" }, "en", new Set(["field_a"]));

    expect(fieldIn(d, "field_a").key).toBe("amount");
    expect(guardSrc(d)).toBe("data.amount > 1000.0");
  });

  it("writes nothing for an id the catalog does not hold", () => {
    const d = draftWith([{ id: "field_a", key: "amount", type: "number", label: { en: "Amount" } }]);
    writeFieldLabel(d, "field_missing", { en: "Total" }, "en", new Set());

    expect(fieldIn(d, "field_a").label).toEqual({ en: "Amount" });
  });
});
