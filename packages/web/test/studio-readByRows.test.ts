import { describe, expect, it } from "bun:test";
import type { Draft } from "../src/areas/studio/draft/types.js";
import { readByRows } from "../src/areas/studio/panels/readByRows.js";

const cel = (src: string) => ({ lang: "cel" as const, src });

const GUARD = "data.amount > 1000.0";

/**
 * One draft holding a reader of `data.amount` at every place kind of
 * design.md Decision 4's classification table, in draft order: the catalog
 * first, then the steps, then a data source.
 */
function everyPlace(): Draft {
  return {
    baseLocale: "en",
    fields: [
      { id: "field_amount", key: "amount", label: { en: "Amount" }, type: "number", validation: { rule: cel("data.amount > 0.0") } },
      { id: "field_note", key: "note", label: { en: "Note" }, type: "string" },
      {
        id: "field_g",
        key: "g",
        label: { en: "Group" },
        type: "group",
        fields: [
          {
            id: "field_nested",
            key: "nested",
            label: { en: "Nested" },
            type: "number",
            default: cel("data.amount"),
            validation: { rule: cel("data.nested < data.amount") },
          },
        ],
      },
    ],
    workflow: {
      initialStep: "step_review",
      steps: [
        {
          id: "step_review",
          key: "review",
          label: { en: "Review" },
          type: "task",
          view: {
            fields: [
              {
                ref: "field_note",
                visible: cel("data.amount > 0.0"),
                required: cel("data.amount > 10.0"),
                readonly: cel("data.amount > 20.0"),
                validation: { rule: cel("data.amount > 30.0") },
              },
              { kind: "note", text: { en: "Large amount" }, visible: cel("data.amount > 40.0") },
            ],
          },
          onEntry: [{ id: "act_start", type: "process.start", config: { inputMapping: { field_x: cel("data.amount") } } }],
          timers: [{ id: "timer_a", deadline: cel("string(data.amount)"), targetPath: "path_approve" }],
          paths: [{ id: "path_approve", key: "approve", label: "Approve", to: "step_book", trigger: "manual", guard: cel(GUARD) }],
        },
        {
          id: "step_call",
          key: "call",
          label: { en: "Check credit" },
          type: "subprocess",
          subprocess: {
            processId: "proc_child",
            versionBinding: "pinned",
            pinnedVersion: 1,
            inputMapping: { field_in: cel("data.amount") },
            outputMapping: { field_amount: cel("data.amount + child.data.extra") },
          },
          paths: [],
        },
        { id: "step_book", key: "book", label: { en: "Book" }, type: "task" },
      ],
    },
    dataSources: [{ id: "ds_a", key: "a", type: "test.source", config: { filter: cel("data.amount") } }],
  } as unknown as Draft;
}

describe("readByRows", () => {
  it("names every place kind in the classification table, in draft order", () => {
    expect(readByRows(everyPlace(), "amount", "en").map((r) => r.place)).toEqual([
      "The rule for Amount",
      "The default value of Nested",
      "The rule for Nested",
      "When Review asks for Note",
      "When Review requires Note",
      "When Note is read-only on Review",
      "The rule for Note on Review",
      "When Review shows a note",
      "Another rule on Review",
      "The time limit on Review",
      "On Review: way out Approve → Book",
      "Values passed to the called process on Check credit",
      "Values copied back from the called process on Check credit",
      "Another rule in this process",
    ]);
  });

  it("adds a sentence to the seven condition places and to no value place", () => {
    const withSentence = readByRows(everyPlace(), "amount", "en")
      .filter((r) => r.sentence !== undefined)
      .map((r) => r.place);
    expect(withSentence).toEqual([
      "The rule for Amount",
      "The rule for Nested",
      "When Review asks for Note",
      "When Review requires Note",
      "When Note is read-only on Review",
      "The rule for Note on Review",
      "When Review shows a note",
      "On Review: way out Approve → Book",
    ]);
  });

  it("reads a guard as its way out and its sentence", () => {
    const row = readByRows(everyPlace(), "amount", "en").find((r) => r.place.startsWith("On Review: way out"));
    expect(row).toEqual({
      place: "On Review: way out Approve → Book",
      sentence: "Amount is greater than 1,000.",
      target: { kind: "wayOut", stepId: "step_review", pathId: "path_approve" },
    });
  });

  it("names the step a way out leaves, so two steps' like-named way outs read apart", () => {
    const leave = (id: string, label: string) => ({
      id,
      key: id,
      label: { en: label },
      type: "task",
      paths: [{ id: `path_${id}`, key: "p", label: "Approve", to: "step_done", trigger: "automatic", priority: 0, guard: cel("data.amount > 1.0") }],
    });
    const draft = {
      baseLocale: "en",
      fields: [{ id: "field_amount", key: "amount", label: { en: "Amount" }, type: "number" }],
      workflow: {
        initialStep: "step_a",
        steps: [leave("step_a", "Review"), leave("step_b", "Audit"), { id: "step_done", key: "done", label: { en: "Done" }, type: "task" }],
      },
    } as unknown as Draft;

    expect(readByRows(draft, "amount", "en").map((r) => r.place)).toEqual([
      "On Review: way out Approve → Done",
      "On Audit: way out Approve → Done",
    ]);
  });

  it("gives each place kind its target and the fallbacks none", () => {
    const targets = Object.fromEntries(readByRows(everyPlace(), "amount", "en").map((r) => [r.place, r.target]));
    expect(targets).toEqual({
      "The rule for Amount": { kind: "field", fieldId: "field_amount" },
      "The default value of Nested": { kind: "field", fieldId: "field_nested" },
      "The rule for Nested": { kind: "field", fieldId: "field_nested" },
      "When Review asks for Note": { kind: "form", stepId: "step_review" },
      "When Review requires Note": { kind: "form", stepId: "step_review" },
      "When Note is read-only on Review": { kind: "form", stepId: "step_review" },
      "The rule for Note on Review": { kind: "form", stepId: "step_review" },
      "When Review shows a note": { kind: "form", stepId: "step_review" },
      "Another rule on Review": undefined,
      "The time limit on Review": { kind: "step", stepId: "step_review" },
      "On Review: way out Approve → Book": { kind: "wayOut", stepId: "step_review", pathId: "path_approve" },
      "Values passed to the called process on Check credit": { kind: "step", stepId: "step_call" },
      "Values copied back from the called process on Check credit": { kind: "step", stepId: "step_call" },
      "Another rule in this process": undefined,
    });
  });

  it("draws no target key on a fallback row", () => {
    const rows = readByRows(everyPlace(), "amount", "en");
    for (const place of ["Another rule on Review", "Another rule in this process"]) {
      expect("target" in rows.find((r) => r.place === place)!).toBe(false);
    }
  });

  it("reaches the way out by the path's id, not its position", () => {
    const draft = everyPlace();
    draft.workflow!.steps![0]!.paths!.unshift({ id: "path_first", key: "first", label: "First", to: "step_book", trigger: "manual" } as never);
    const row = readByRows(draft, "amount", "en").find((r) => r.place.startsWith("On Review: way out"));
    expect(row?.target).toEqual({ kind: "wayOut", stepId: "step_review", pathId: "path_approve" });
  });

  it("names the step and the field of a form condition", () => {
    const draft = everyPlace();
    expect(readByRows(draft, "amount", "en").map((r) => r.place)).toContain("When Review asks for Note");
  });

  it("names a time limit's step", () => {
    const draft = {
      baseLocale: "en",
      fields: [{ id: "field_due", key: "due", label: { en: "Due" }, type: "string" }],
      workflow: {
        initialStep: "step_review",
        steps: [{ id: "step_review", key: "review", label: { en: "Review" }, type: "task", timers: [{ id: "timer_a", deadline: cel("data.due") }] }],
      },
    } as unknown as Draft;
    expect(readByRows(draft, "due", "en")).toEqual([
      { place: "The time limit on Review", target: { kind: "step", stepId: "step_review" } },
    ]);
  });

  it("reads source that does not parse as a hand-written rule", () => {
    const draft = everyPlace();
    (draft.workflow!.steps![0]!.paths![0]!.guard as { src: string }).src = "data.amount >";
    const row = readByRows(draft, "amount", "en").find((r) => r.place.startsWith("On Review: way out"));
    expect(row?.sentence).toBe("A hand-written rule.");
  });

  it("answers no row for a key nothing reads, and none for the empty key", () => {
    expect(readByRows(everyPlace(), "note", "en")).toEqual([]);
    expect(readByRows(everyPlace(), "", "en")).toEqual([]);
  });

  it("reads a label at the content locale, else the base locale, else the unnamed placeholder", () => {
    const draft = everyPlace();
    const fields = draft.fields as unknown as { label: Record<string, string> }[];
    fields[0]!.label = { en: "Amount", de: "Betrag" };
    fields[1]!.label = { en: "" };
    const places = readByRows(draft, "amount", "de").map((r) => r.place);
    expect(places).toContain("The rule for Betrag");
    expect(places).toContain("When Review asks for (unnamed field)");
    expect(places).toContain("The default value of Nested");
  });

  it("reads a step's own rule as a step rule, never as a field rule", () => {
    const places = readByRows(everyPlace(), "amount", "en").map((r) => r.place);
    expect(places.filter((p) => p.startsWith("The rule for Note"))).toEqual(["The rule for Note on Review"]);
  });

  it("prints no CEL, no key and no id", () => {
    const text = JSON.stringify(readByRows(everyPlace(), "amount", "en").map(({ target: _target, ...row }) => row));
    expect(text).not.toContain("data.");
    expect(text).not.toContain("amount");
    expect(text).not.toContain("field_");
    expect(text).not.toContain("step_");
  });
});
