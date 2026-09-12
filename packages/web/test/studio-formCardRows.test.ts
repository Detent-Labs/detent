import { describe, expect, it } from "bun:test";
import type { Draft } from "../src/areas/studio/draft/types.js";
import type { EditorIssue } from "../src/areas/studio/draft/issues.js";
import { formCardRows, miniatureBarHeight, viewIssues } from "../src/areas/studio/panels/formCardRows.js";

/**
 * The Forms tab's own row set (`studio-forms-overview`: "The Forms tab
 * carries one card per step that asks for something", "A card names its step
 * and counts its fields", "A card carries a miniature of its form", "A card
 * reports its step's form issues").
 *
 * `development-toolchain`'s split rule sends these to assertions: the row
 * set, the order, the counts, the miniature's order, its bar heights and the
 * issue tally are all values a pure function returns.
 */

const AMOUNT = "field_00000000-0000-4000-8000-0000000000a1";
const PURPOSE = "field_00000000-0000-4000-8000-0000000000a2";
const NOTES = "field_00000000-0000-4000-8000-0000000000a3";
const AGREED = "field_00000000-0000-4000-8000-0000000000a4";

/** Three steps: one with a four-entry view, one with an empty view, one with
 * no view at all. `step_a` reaches `step_b`, which reaches `step_end`. */
const DRAFT = {
  baseLocale: "en",
  fields: [
    { id: AMOUNT, key: "amount", type: "number", label: { en: "Amount" } },
    { id: PURPOSE, key: "purpose", type: "string", label: { en: "Purpose" } },
    { id: NOTES, key: "notes", type: "string", control: "multiline", label: { en: "Notes" } },
    { id: AGREED, key: "agreed", type: "boolean", label: { en: "Agreed" } },
  ],
  workflow: {
    initialStep: "step_a",
    steps: [
      {
        id: "step_a",
        key: "intake",
        label: { en: "Intake" },
        type: "task",
        view: {
          fields: [
            { ref: AMOUNT, required: true },
            { ref: PURPOSE },
            { ref: NOTES },
            { ref: AGREED },
          ],
        },
        paths: [{ id: "path_1", to: "step_b" }],
      },
      {
        id: "step_b",
        key: "review",
        label: { en: "Review" },
        type: "task",
        view: { fields: [] },
        paths: [{ id: "path_2", to: "step_end" }],
      },
      { id: "step_end", key: "done", label: { en: "Done" }, type: "task", terminal: true },
    ],
  },
} as unknown as Draft;

/** A second draft: `workflow.steps` runs review, intake, done, while the
 * paths run intake to review to done. Proves the card order follows that
 * array order, not the path order — the path order would put intake ahead of
 * review, the array puts review first. */
const ORDER_DRAFT = {
  baseLocale: "en",
  workflow: {
    initialStep: "step_a",
    steps: [
      {
        id: "step_b",
        key: "review",
        label: { en: "Review" },
        type: "task",
        view: { fields: [{ ref: PURPOSE }] },
        paths: [{ id: "path_2", to: "step_end" }],
      },
      {
        id: "step_a",
        key: "intake",
        label: { en: "Intake" },
        type: "task",
        view: { fields: [{ ref: AMOUNT }] },
        paths: [{ id: "path_1", to: "step_b" }],
      },
      { id: "step_end", key: "done", label: { en: "Done" }, type: "task", terminal: true },
    ],
  },
} as unknown as Draft;

function viewIssue(stepId: string, index: number): EditorIssue {
  return {
    entityType: "step",
    entityId: stepId,
    message: "view ref does not resolve",
    source: "zod",
    loc: `workflow.steps[0].view.fields[${index}].ref`,
  };
}

describe("The Forms tab's card set", () => {
  it("draws a card for every step that declares a view, and none for a step that declares none", () => {
    const rows = formCardRows(DRAFT, [], "en");

    expect(rows.map((r) => r.stepId)).toEqual(["step_a", "step_b"]);
  });

  it("draws a card for a step whose view holds no entry, so an empty form stays visible", () => {
    const empty = formCardRows(DRAFT, [], "en").find((r) => r.stepId === "step_b");

    expect(empty?.fieldCount).toBe(0);
  });

  it("follows the draft's own `workflow.steps` order, not the path order", () => {
    const rows = formCardRows(ORDER_DRAFT, [], "en");

    expect(rows.map((r) => r.label)).toEqual(["Review", "Intake"]);
  });

  it("names each step and reads its role for the kicker", () => {
    const [first, second] = formCardRows(DRAFT, [], "en");

    expect(first?.label).toBe("Intake");
    expect(first?.role).toBe("initial");
    expect(second?.label).toBe("Review");
    expect(second?.role).toBe("task");
  });

  it("counts the field entries a view holds", () => {
    expect(formCardRows(DRAFT, [], "en")[0]?.fieldCount).toBe(4);
  });

  it("counts field entries alone, so a note raises the count by none", () => {
    const withNote = {
      ...DRAFT,
      workflow: {
        ...DRAFT.workflow,
        steps: [
          {
            ...DRAFT.workflow!.steps![0],
            view: { fields: [{ ref: AMOUNT }, { kind: "note", text: { en: "Read this first" } }] },
          },
          ...DRAFT.workflow!.steps!.slice(1),
        ],
      },
    } as unknown as Draft;

    expect(formCardRows(withNote, [], "en")[0]?.fieldCount).toBe(1);
  });
});

describe("A card's miniature", () => {
  it("follows the view's own order", () => {
    const entries = formCardRows(DRAFT, [], "en")[0]?.entries ?? [];

    expect(entries.map((e) => e.label)).toEqual(["Amount", "Purpose", "Notes", "Agreed"]);
  });

  it("marks the entry that declares itself required", () => {
    const entries = formCardRows(DRAFT, [], "en")[0]?.entries ?? [];

    expect(entries[0]?.required).toBe(true);
    expect(entries[1]?.required).toBe(false);
  });

  it("draws a long-text field taller than a one-line field", () => {
    const entries = formCardRows(DRAFT, [], "en")[0]?.entries ?? [];
    const oneLine = entries[1]!.height;
    const longText = entries[2]!.height;

    expect(longText).toBeGreaterThan(oneLine);
  });

  it("takes the bar height from the field's kind alone", () => {
    expect(miniatureBarHeight({ type: "string", control: "multiline" })).toBe(32);
    expect(miniatureBarHeight({ type: "string" })).toBe(16);
    expect(miniatureBarHeight({ type: "boolean" })).toBeLessThan(miniatureBarHeight({ type: "string" }));
    expect(miniatureBarHeight({ type: "list" })).toBeGreaterThan(miniatureBarHeight({ type: "string" }));
  });

  it("still names a view entry the catalog no longer declares", () => {
    const stale = {
      ...DRAFT,
      workflow: {
        ...DRAFT.workflow,
        steps: [
          { ...DRAFT.workflow!.steps![0], view: { fields: [{ ref: "field_gone" }] } },
          ...DRAFT.workflow!.steps!.slice(1),
        ],
      },
    } as unknown as Draft;

    expect(formCardRows(stale, [], "en")[0]?.entries[0]?.label).toBe("field_gone");
  });
});

describe("A card's issue badge", () => {
  it("counts the open issues naming that step's view", () => {
    const rows = formCardRows(DRAFT, [viewIssue("step_a", 0)], "en");

    expect(rows[0]?.issues.count).toBe(1);
    expect(rows[1]?.issues.count).toBe(0);
  });

  it("leaves an issue elsewhere on the step out of the form's own count", () => {
    const elsewhere: EditorIssue = {
      entityType: "step",
      entityId: "step_a",
      message: "assignment does not resolve",
      source: "registry",
      loc: "workflow.steps[0].assignment.strategy.type",
    };

    expect(viewIssues([elsewhere], "step_a").count).toBe(0);
  });

  it("reads a blocker where an engine validator raised the issue", () => {
    expect(viewIssues([viewIssue("step_a", 0)], "step_a").blocker).toBe(true);
  });

  it("reads no blocker where the studio's own view check raised it", () => {
    const advisory: EditorIssue = { ...viewIssue("step_a", 0), source: "view" };

    expect(viewIssues([advisory], "step_a").blocker).toBe(false);
  });
});
