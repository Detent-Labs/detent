import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { FIELD_KINDS } from "workflow-engine/schema";
import {
  droppedByKindChange,
  groupTargetsFor,
  moveFieldToGroup,
  nextFieldKey,
} from "../src/areas/studio/panels/fieldCatalogLogic.js";
import { mergeLocalizedTextEntry } from "../src/areas/studio/draft/localized-text.js";
import { mintCatalogField } from "../src/areas/studio/draft/mintField.js";
import { draftFields, type DraftField } from "../src/areas/studio/draft/fields.js";
import { runValidation } from "../src/areas/studio/draft/validation.js";
import type { Draft } from "../src/areas/studio/draft/types.js";

describe("nextFieldKey", () => {
  it("derives a newly-minted top-level field's key (key '') from its label", () => {
    const field = mintCatalogField("text", undefined);
    expect(field.key).toBe("");

    const label = mergeLocalizedTextEntry(undefined, "en", "Requested amount");

    expect(nextFieldKey(field.key ?? "", field.label, label, "en", new Set())).toBe("requested_amount");
  });

  it("derives a nested group-child field's key the same way a top-level field's does", () => {
    const label = mergeLocalizedTextEntry(undefined, "en", "Requested amount");

    expect(nextFieldKey("", undefined, label, "en", new Set())).toBe("requested_amount");
  });

  it("dedupes across the whole catalog, top-level against a group-nested collision", () => {
    const draft: Draft = {
      baseLocale: "en",
      fields: [
        {
          id: "field_group",
          key: "group",
          type: "group",
          label: { en: "Group" },
          fields: [{ id: "field_nested", key: "requested_amount", type: "string", label: { en: "Requested amount" } }],
        },
      ],
    } as unknown as Draft;
    const taken = new Set(draftFields(draft).map((f) => f.key ?? ""));
    const label = mergeLocalizedTextEntry(undefined, "en", "Requested amount");

    expect(nextFieldKey("", undefined, label, "en", taken)).toBe("requested_amount_2");
  });

  it("leaves a hand-edited field key (top-level or nested) unchanged on a later label edit", () => {
    const priorLabel = mergeLocalizedTextEntry(undefined, "en", "Requested amount");
    const newLabel = mergeLocalizedTextEntry(priorLabel, "en", "Requested amount (USD)");

    expect(nextFieldKey("amount", priorLabel, newLabel, "en", new Set())).toBeUndefined();
  });

  it("stays empty while minting a field with the content locale differing from the base locale", () => {
    const priorLabel = mergeLocalizedTextEntry(undefined, "de", "");
    const newLabel = mergeLocalizedTextEntry(priorLabel, "de", "Angeforderter Betrag");

    expect(nextFieldKey("", priorLabel, newLabel, "en", new Set())).toBe("");
  });
});

describe("droppedByKindChange", () => {
  it("drops a format the new kind does not name", () => {
    expect(droppedByKindChange({ format: "date" }, FIELD_KINDS.number)).toEqual(["format"]);
  });

  it("drops a control the new kind does not name", () => {
    expect(droppedByKindChange({ control: "multiline" }, FIELD_KINDS.yesNo)).toEqual(["control"]);
  });

  it("drops both when the new kind names neither", () => {
    expect(droppedByKindChange({ format: "date", control: "multiline" }, FIELD_KINDS.file)).toEqual([
      "format",
      "control",
    ]);
  });

  it("keeps a member the new kind names too", () => {
    expect(droppedByKindChange({ control: "radio" }, FIELD_KINDS.yesNoRadio)).toEqual([]);
  });

  it("drops nothing from a field carrying neither key", () => {
    expect(droppedByKindChange({}, FIELD_KINDS.file)).toEqual([]);
  });

  it("drops both on a switch to the plugin envelope, which names neither key", () => {
    expect(droppedByKindChange({ format: "email", control: "radio" }, undefined)).toEqual(["format", "control"]);
  });

  it("drops a format the new kind's own type still allows but the kind does not name", () => {
    expect(droppedByKindChange({ format: "date" }, FIELD_KINDS.text)).toEqual(["format"]);
  });
});

// ============================================================
// moveFieldToGroup — the one write both rail gestures reach.
// ============================================================

const fld = (id: string, key: string, extra: object = {}): DraftField =>
  ({ id, key, label: { en: key }, type: "string", ...extra }) as unknown as DraftField;

const grp = (id: string, key: string, children: DraftField[]): DraftField =>
  ({ id, key, label: { en: key }, type: "group", fields: children }) as unknown as DraftField;

const ids = (fields: DraftField[] | undefined): string[] => (fields ?? []).map((f) => f.id!);

describe("moveFieldToGroup", () => {
  it("moves a top-level field into a group, leaving the group's own keys alone", () => {
    const fields = [fld("field_a", "a"), grp("field_g", "g", [fld("field_b", "b")])];

    const next = moveFieldToGroup(fields, "field_a", "field_g");

    expect(ids(next)).toEqual(["field_g"]);
    expect(ids(next[0].fields)).toEqual(["field_b", "field_a"]);
    expect(next[0].id as string).toBe("field_g");
    expect(next[0].key).toBe("g");
  });

  it("moves a group child back out to the top level, keeping the group", () => {
    const fields = [fld("field_a", "a"), grp("field_g", "g", [fld("field_b", "b"), fld("field_c", "c")])];

    const next = moveFieldToGroup(fields, "field_b", undefined);

    expect(ids(next)).toEqual(["field_a", "field_g", "field_b"]);
    expect(ids(next[1].fields)).toEqual(["field_c"]);
  });

  it("moves a field from one group into another", () => {
    const fields = [grp("field_g", "g", [fld("field_a", "a")]), grp("field_h", "h", [])];

    const next = moveFieldToGroup(fields, "field_a", "field_h");

    expect(ids(next[0].fields)).toEqual([]);
    expect(ids(next[1].fields)).toEqual(["field_a"]);
  });

  it("answers the same array where the move is not one to make", () => {
    const fields = [fld("field_a", "a"), grp("field_g", "g", [fld("field_b", "b")])];

    // No such field, a target that is no group, the field itself, and a field
    // already hanging where it would land.
    expect(moveFieldToGroup(fields, "field_z", "field_g")).toBe(fields);
    expect(moveFieldToGroup(fields, "field_a", "field_b")).toBe(fields);
    expect(moveFieldToGroup(fields, "field_g", "field_g")).toBe(fields);
    expect(moveFieldToGroup(fields, "field_b", "field_g")).toBe(fields);
    expect(moveFieldToGroup(fields, "field_a", undefined)).toBe(fields);
  });

  it("refuses to hang a group inside its own descendant, which would drop the subtree", () => {
    const fields = [grp("field_g", "g", [grp("field_h", "h", [fld("field_a", "a")])])];

    expect(moveFieldToGroup(fields, "field_g", "field_h")).toBe(fields);
  });

  it("leaves the array it was given untouched", () => {
    const fields = [fld("field_a", "a"), grp("field_g", "g", [])];
    const before = JSON.stringify(fields);

    moveFieldToGroup(fields, "field_a", "field_g");

    expect(JSON.stringify(fields)).toBe(before);
  });
});

describe("moveFieldToGroup writes the field's place and nothing else", () => {
  const movingDraft = (): Draft =>
    ({
      key: "p",
      label: { en: "P" },
      baseLocale: "en",
      fields: [
        fld("field_a", "amount", {
          type: "number",
          description: { en: "How much" },
          default: 3,
          validation: { min: 1 },
          columnMapping: { total: "field_a" },
          technical: false,
        }),
        grp("field_g", "line_item", []),
      ],
      workflow: {
        initialStep: "step_a",
        steps: [
          {
            id: "step_a",
            key: "a",
            label: { en: "A" },
            type: "task",
            view: { fields: [{ ref: "field_a", required: true }] },
          },
          {
            id: "step_b",
            key: "b",
            label: { en: "B" },
            type: "task",
            terminal: true,
            view: { fields: [{ ref: "field_a", readonly: true }] },
          },
        ],
      },
    }) as unknown as Draft;

  it("keeps the moved field's id, key and every other key it carries", () => {
    const before = movingDraft();
    const moved = before.fields!.find((f) => f.id === "field_a")!;

    const next = moveFieldToGroup(before.fields as DraftField[], "field_a", "field_g");
    const after = next[0].fields![0];

    expect(after).toEqual(moved);
    expect(after.id as string).toBe("field_a");
    expect(after.key).toBe("amount");
    expect(after.columnMapping?.total as string).toBe("field_a");
  });

  it("changes no view entry and no column mapping", () => {
    const before = movingDraft();
    const workflowBefore = JSON.stringify(before.workflow);

    const next = moveFieldToGroup(before.fields as DraftField[], "field_a", "field_g");

    // The move touches the field array alone, so every view entry naming the
    // moved field still reads the same id it read before.
    expect(JSON.stringify(before.workflow)).toBe(workflowBefore);
    expect(next[0].fields![0].columnMapping?.total as string).toBe("field_a");
  });
});

describe("moveFieldToGroup over examples/purchase-requisition.json", () => {
  const exampleDraft = (): Draft => {
    const raw = JSON.parse(readFileSync(new URL("../../../examples/purchase-requisition.json", import.meta.url), "utf-8"));
    return (raw.definition ?? raw) as Draft;
  };

  const groupIdOf = (body: Draft) => draftFields(body).find((f) => f.key === "line_item")!.id!;

  it("keeps the body publishable when a top-level field moves into the group", () => {
    const body = exampleDraft();
    const vendor = draftFields(body).find((f) => f.key === "vendor")!;
    const before = runValidation(body, undefined, {}, {});
    expect(before.zodValid).toBe(true);

    const moved: Draft = { ...body, fields: moveFieldToGroup(body.fields as DraftField[], vendor.id!, groupIdOf(body)) };

    const after = runValidation(moved, undefined, {}, {});
    expect(after.zodValid).toBe(true);
    expect(after.issues).toEqual(before.issues);
  });

  it("keeps the body publishable when a group child moves out to the top level", () => {
    const body = exampleDraft();
    const quantity = draftFields(body).find((f) => f.key === "quantity")!;
    const before = runValidation(body, undefined, {}, {});

    const moved: Draft = { ...body, fields: moveFieldToGroup(body.fields as DraftField[], quantity.id!, undefined) };

    expect(draftFields(moved).find((f) => f.key === "quantity")!.id).toBe(quantity.id);
    const after = runValidation(moved, undefined, {}, {});
    expect(after.zodValid).toBe(true);
    expect(after.issues).toEqual(before.issues);
  });
});

/**
 * The picker's set and the write's set are one claim, stated in two places.
 * `studio-app` requires the keyboard to reach every destination a drop
 * reaches, so a target this helper offers must survive `moveFieldToGroup`,
 * and a target the write accepts must not go missing here.
 */
describe("groupTargetsFor", () => {
  it("offers every group and nothing else", () => {
    const fields = [fld("field_a", "a"), grp("field_g", "g", []), grp("field_h", "h", [])];

    expect(groupTargetsFor(fields, "field_a")).toEqual(["field_g", "field_h"]);
  });

  it("keeps the group the field sits in, so the picker can state where it is", () => {
    const fields = [grp("field_g", "g", [fld("field_a", "a")]), grp("field_h", "h", [])];

    expect(groupTargetsFor(fields, "field_a")).toEqual(["field_g", "field_h"]);
  });

  it("drops the field itself and every group inside it", () => {
    const fields = [grp("field_g", "g", [grp("field_inner", "inner", [])]), grp("field_h", "h", [])];

    expect(groupTargetsFor(fields, "field_g")).toEqual(["field_h"]);
  });

  it("offers nothing for a field the catalog does not carry", () => {
    expect(groupTargetsFor([grp("field_g", "g", [])], "field_missing")).toEqual([]);
  });

  // Every target this helper names has to survive the write, or the picker
  // offers a move that silently does nothing.
  it("names only targets the write accepts", () => {
    const fields = [fld("field_a", "a"), grp("field_g", "g", []), grp("field_h", "h", [fld("field_b", "b")])];

    for (const target of groupTargetsFor(fields, "field_a")) {
      expect(moveFieldToGroup(fields, "field_a", target)).not.toBe(fields);
    }
  });

  // A field can sit inside a parent that is no group: `changeKind` rewrites a
  // field's type and leaves its `fields` alone. The helper drops that parent,
  // since it is nobody's destination, and the write still moves the child out.
  it("drops a parent that is no longer a group, and the move out still works", () => {
    const orphaning = { ...grp("field_g", "g", [fld("field_a", "a")]), type: "string" as const };
    const fields = [orphaning];

    expect(groupTargetsFor(fields, "field_a")).toEqual([]);
    expect(ids(moveFieldToGroup(fields, "field_a", undefined))).toEqual(["field_g", "field_a"]);
  });
});
