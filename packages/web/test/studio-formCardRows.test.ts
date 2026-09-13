import { describe, expect, it } from "bun:test";
import type { Draft } from "../src/areas/studio/draft/types.js";
import type { EditorIssue } from "../src/areas/studio/draft/issues.js";
import { formCardRows, miniatureBarHeight, viewIssues } from "../src/areas/studio/panels/formCardRows.js";
import * as cardRows from "../src/areas/studio/panels/formCardRows.js";

/**
 * The Forms tab's own row set (`studio-forms-overview`: "The Forms tab
 * carries one card per step that asks for something", "A card names its step
 * and counts the fields it draws", "A card draws a miniature of its form for
 * the eye alone", "A card reports its step's form issues", "The Forms tab
 * explains the miniature's marks").
 *
 * `development-toolchain`'s split rule sends these to assertions: the row
 * set, the order, the counts, the miniature's order, its bar heights, the
 * issue tally and the legend's items are all values a pure module returns.
 */

const AMOUNT = "field_00000000-0000-4000-8000-0000000000a1";
const PURPOSE = "field_00000000-0000-4000-8000-0000000000a2";
const NOTES = "field_00000000-0000-4000-8000-0000000000a3";
const AGREED = "field_00000000-0000-4000-8000-0000000000a4";
const SECTION = "field_00000000-0000-4000-8000-0000000000a5";

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

  it("counts a view holding only a note as empty", () => {
    const notesOnly = {
      ...DRAFT,
      workflow: {
        ...DRAFT.workflow,
        steps: [
          { ...DRAFT.workflow!.steps![0], view: { fields: [{ kind: "note", text: { en: "Read this first" } }] } },
          ...DRAFT.workflow!.steps!.slice(1),
        ],
      },
    } as unknown as Draft;

    expect(formCardRows(notesOnly, [], "en")[0]?.fieldCount).toBe(0);
  });

  it("counts a view holding only a group entry as empty", () => {
    const groupOnly = {
      ...DRAFT,
      fields: [...DRAFT.fields!, { id: SECTION, key: "section", type: "group", label: { en: "Section" } }],
      workflow: {
        ...DRAFT.workflow,
        steps: [
          { ...DRAFT.workflow!.steps![0], view: { fields: [{ ref: SECTION }] } },
          ...DRAFT.workflow!.steps!.slice(1),
        ],
      },
    } as unknown as Draft;

    expect(formCardRows(groupOnly, [], "en")[0]?.fieldCount).toBe(0);
  });
});

describe("A card's miniature", () => {
  it("follows the view's own order, one mark per height", () => {
    const entries = formCardRows(DRAFT, [], "en")[0]?.entries ?? [];

    // Amount (number, one-line), Purpose (string, one-line), Notes
    // (multiline, long text), Agreed (boolean, checkbox).
    expect(entries.map((e) => e.height)).toEqual([12, 12, 24, 8]);
  });

  it("marks the entry that declares itself required", () => {
    const entries = formCardRows(DRAFT, [], "en")[0]?.entries ?? [];

    // Amount declares `required: true`; Purpose declares no `required`.
    expect(entries[0]?.requirement).toBe("required");
    expect(entries[1]?.requirement).toBe("optional");
  });

  it("reads an entry whose required holds a CEL expression as conditional, and leaves it out of requiredCount", () => {
    const conditional = {
      ...DRAFT,
      workflow: {
        ...DRAFT.workflow,
        steps: [
          {
            ...DRAFT.workflow!.steps![0],
            view: {
              fields: [
                { ref: AMOUNT, required: { lang: "cel", src: "data.purpose != ''" } },
                // design.md: an expression with an empty `src` still reads as
                // conditional; the Checks tab reports it as incomplete.
                { ref: NOTES, required: { lang: "cel", src: "" } },
                { ref: PURPOSE, required: true },
              ],
            },
          },
          ...DRAFT.workflow!.steps!.slice(1),
        ],
      },
    } as unknown as Draft;
    const row = formCardRows(conditional, [], "en")[0];

    expect(row?.entries.map((e) => e.requirement)).toEqual(["conditional", "conditional", "required"]);
    expect(row?.requiredCount).toBe(1);
  });

  it("reads an entry declaring required: false as optional", () => {
    const literalFalse = {
      ...DRAFT,
      workflow: {
        ...DRAFT.workflow,
        steps: [
          { ...DRAFT.workflow!.steps![0], view: { fields: [{ ref: AMOUNT, required: false }] } },
          ...DRAFT.workflow!.steps!.slice(1),
        ],
      },
    } as unknown as Draft;
    const row = formCardRows(literalFalse, [], "en")[0];

    expect(row?.entries[0]?.requirement).toBe("optional");
    expect(row?.requiredCount).toBe(0);
  });

  it("draws a long-text field taller than a one-line field", () => {
    const entries = formCardRows(DRAFT, [], "en")[0]?.entries ?? [];
    const oneLine = entries[1]!.height;
    const longText = entries[2]!.height;

    expect(longText).toBeGreaterThan(oneLine);
  });

  it("takes the mark height from the field's kind alone", () => {
    expect(miniatureBarHeight({ type: "boolean" })).toBe(8);
    expect(miniatureBarHeight({ type: "string" })).toBe(12);
    expect(miniatureBarHeight({ type: "string", control: "radio" })).toBe(16);
    expect(miniatureBarHeight({ type: "list" })).toBe(16);
    expect(miniatureBarHeight({ type: "string", control: "multiline" })).toBe(24);
  });

  it("takes the one-line height for a view entry the catalog no longer declares", () => {
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

    expect(formCardRows(stale, [], "en")[0]?.entries[0]?.height).toBe(12);
  });

  it("draws no mark for a note", () => {
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

    expect(formCardRows(withNote, [], "en")[0]?.entries).toHaveLength(1);
  });

  it("draws a group entry as a group break, not a mark", () => {
    const withGroup = {
      ...DRAFT,
      fields: [...DRAFT.fields!, { id: SECTION, key: "section", type: "group", label: { en: "Section" } }],
      workflow: {
        ...DRAFT.workflow,
        steps: [
          { ...DRAFT.workflow!.steps![0], view: { fields: [{ ref: SECTION }, { ref: AMOUNT }, { ref: PURPOSE }] } },
          ...DRAFT.workflow!.steps!.slice(1),
        ],
      },
    } as unknown as Draft;
    const row = formCardRows(withGroup, [], "en")[0];

    // studio-forms-overview: a group entry and two field entries inside it
    // read two fields, over one group break and two marks.
    expect(row?.fieldCount).toBe(2);
    expect(row?.entries[0]?.groupBreak).toBe(true);
    expect(row?.entries.filter((e) => e.groupBreak)).toHaveLength(1);
    expect(row?.entries.filter((e) => !e.groupBreak)).toHaveLength(2);
  });

  it("counts the required entries in requiredCount, skipping a group break even when it declares required", () => {
    const withGroup = {
      ...DRAFT,
      fields: [...DRAFT.fields!, { id: SECTION, key: "section", type: "group", label: { en: "Section" } }],
      workflow: {
        ...DRAFT.workflow,
        steps: [
          {
            ...DRAFT.workflow!.steps![0],
            view: { fields: [{ ref: SECTION, required: true }, { ref: AMOUNT, required: true }, { ref: PURPOSE }] },
          },
          ...DRAFT.workflow!.steps!.slice(1),
        ],
      },
    } as unknown as Draft;

    expect(formCardRows(withGroup, [], "en")[0]?.requiredCount).toBe(1);
  });

  it("reads requiredCount off DRAFT, one required entry among four", () => {
    expect(formCardRows(DRAFT, [], "en")[0]?.requiredCount).toBe(1);
  });
});

/** The samples of the legend item naming one catalog key, or `undefined` where the module
 * exports no legend or the legend holds no such item. Read through the
 * namespace import, so a missing export fails the assertion rather than the
 * module load. */
function legendSamples(key: string) {
  return cardRows.FORMS_LEGEND?.find((item) => item.key === key)?.samples;
}

describe("The Forms tab's legend", () => {
  it("lists five items in the legend table's order, each by its catalog key", () => {
    expect(cardRows.FORMS_LEGEND?.map((item) => item.key)).toEqual([
      "formsTab.legendField",
      "formsTab.legendRequired",
      "formsTab.legendConditional",
      "formsTab.legendSection",
      "formsTab.legendHeight",
    ]);
  });

  it("samples field with one 12px outline", () => {
    expect(legendSamples("formsTab.legendField")).toEqual([
      { index: 0, groupBreak: false, height: 12, requirement: "optional" },
    ]);
  });

  it("samples required with one 12px solid fill", () => {
    expect(legendSamples("formsTab.legendRequired")).toEqual([
      { index: 0, groupBreak: false, height: 12, requirement: "required" },
    ]);
  });

  it("samples required if a condition holds with one 12px dashed outline", () => {
    expect(legendSamples("formsTab.legendConditional")).toEqual([
      { index: 0, groupBreak: false, height: 12, requirement: "conditional" },
    ]);
  });

  it("samples section with one 24px group break", () => {
    expect(legendSamples("formsTab.legendSection")).toEqual([
      { index: 0, groupBreak: true, height: 24, requirement: "optional" },
    ]);
  });

  it("samples taller asks for more with three outlines, 8px, 16px and 24px", () => {
    expect(legendSamples("formsTab.legendHeight")).toEqual([
      { index: 0, groupBreak: false, height: 8, requirement: "optional" },
      { index: 1, groupBreak: false, height: 16, requirement: "optional" },
      { index: 2, groupBreak: false, height: 24, requirement: "optional" },
    ]);
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
