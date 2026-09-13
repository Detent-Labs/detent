import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { FIELD_KINDS } from "workflow-engine/schema";
import {
  ADD_FIRST_FIELD_ID,
  appendToGroup,
  droppedByKindChange,
  fieldLabelInputId,
  focusAfterRemove,
  groupTargetsFor,
  moveFieldToGroup,
  moveTargetsFor,
  neighbourAfterRemove,
  nextFieldKey,
  railEntryId,
  removalAnnouncement,
  removeFieldIn,
} from "../src/areas/studio/panels/fieldCatalogLogic.js";
import { mergeLocalizedTextEntry } from "../src/areas/studio/draft/localized-text.js";
import { mintCatalogField } from "../src/areas/studio/draft/mintField.js";
import { draftFields, type DraftField } from "../src/areas/studio/draft/fields.js";
import { runValidation } from "../src/areas/studio/draft/validation.js";
import { moveFieldAndSyncViews, writeGroupLabel } from "../src/areas/studio/draft/view-group-sync.js";
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

describe("appendToGroup", () => {
  it("appends a field into a group nested inside another group", () => {
    const fields = [grp("field_outer", "outer", [grp("field_inner", "inner", [fld("field_a", "a")])])];
    const field = fld("field_new", "new");

    const next = appendToGroup(fields, "field_inner", field);

    expect(ids(next[0].fields![0].fields)).toEqual(["field_a", "field_new"]);
  });

  it("leaves the array it was given untouched", () => {
    const fields = [grp("field_outer", "outer", [grp("field_inner", "inner", [fld("field_a", "a")])])];
    const before = JSON.stringify(fields);

    appendToGroup(fields, "field_inner", fld("field_new", "new"));

    expect(JSON.stringify(fields)).toBe(before);
  });
});

describe("removeFieldIn", () => {
  it("removes a field at depth two, inside a group inside a group", () => {
    const fields = [
      grp("field_outer", "outer", [grp("field_inner", "inner", [fld("field_a", "a"), fld("field_b", "b")])]),
    ];

    const next = removeFieldIn(fields, "field_a");

    expect(ids(next[0].fields![0].fields)).toEqual(["field_b"]);
  });

  it("leaves the array it was given untouched", () => {
    const fields = [grp("field_outer", "outer", [grp("field_inner", "inner", [fld("field_a", "a")])])];
    const before = JSON.stringify(fields);

    removeFieldIn(fields, "field_a");

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

  const groupIdOf = (body: Draft, key = "line_item") => draftFields(body).find((f) => f.key === key)!.id!;

  /** `EntityTabs.tsx`'s `moveField` calls `moveFieldAndSyncViews` inside one
   * `mutate`, which hands it a `structuredClone` of the draft. */
  const moveOnClone = (body: Draft, fieldId: string, targetGroupId: string | undefined): Draft => {
    const moved = structuredClone(body);
    moveFieldAndSyncViews(moved, fieldId, targetGroupId);
    return moved;
  };

  it("keeps the body publishable when a top-level field moves into the group", () => {
    const body = exampleDraft();
    const vendor = draftFields(body).find((f) => f.key === "vendor")!;
    const before = runValidation(body, undefined, {}, {});
    expect(before.zodValid).toBe(true);

    const moved = moveOnClone(body, vendor.id!, groupIdOf(body));

    const after = runValidation(moved, undefined, {}, {});
    expect(after.zodValid).toBe(true);
    expect(after.issues).toEqual(before.issues);
  });

  it("keeps the body publishable when a group child moves out to the top level", () => {
    const body = exampleDraft();
    const quantity = draftFields(body).find((f) => f.key === "quantity")!;
    const before = runValidation(body, undefined, {}, {});

    const moved = moveOnClone(body, quantity.id!, undefined);

    expect(draftFields(moved).find((f) => f.key === "quantity")!.id).toBe(quantity.id);
    const after = runValidation(moved, undefined, {}, {});
    expect(after.zodValid).toBe(true);
    expect(after.issues).toEqual(before.issues);
  });

  it("keeps step po_error publishable when po_status moves into request, a group whose card that form lacks", () => {
    const body = exampleDraft();
    const poStatus = draftFields(body).find((f) => f.key === "po_status")!;
    const requestId = groupIdOf(body, "request");
    const poErrorBefore = body.workflow!.steps!.find((s) => s.key === "po_error")!.view!.fields!;
    expect(poErrorBefore.some((e) => "ref" in e && e.ref === requestId)).toBe(false);
    const before = runValidation(body, undefined, {}, {});

    const moved = moveOnClone(body, poStatus.id!, requestId);

    const after = runValidation(moved, undefined, {}, {});
    expect(after.zodValid).toBe(true);
    expect(after.issues).toEqual(before.issues);
    const poError = moved.workflow!.steps!.find((s) => s.key === "po_error")!.view!.fields!;
    const statusAt = poError.findIndex((e) => "ref" in e && e.ref === poStatus.id);
    expect(poError[statusAt - 1]).toEqual({ ref: requestId });
    expect(poError[statusAt]).toMatchObject({ ref: poStatus.id, group: "request" });
  });

  it("keeps the tabbed finance_review step publishable when line_item moves into request, then cost_center leaves for the top level", () => {
    const body = exampleDraft();
    const lineItemId = groupIdOf(body);
    const before = runValidation(body, undefined, {}, {});
    expect(before.zodValid).toBe(true);

    const nested = moveOnClone(body, lineItemId, groupIdOf(body, "request"));
    const costCenter = draftFields(nested).find((f) => f.key === "cost_center")!;
    const moved = moveOnClone(nested, costCenter.id!, undefined);

    const after = runValidation(moved, undefined, {}, {});
    expect(after.zodValid).toBe(true);
    expect(after.issues).toEqual(before.issues);
    const review = moved.workflow!.steps!.find((s) => s.key === "finance_review")!.view!.fields!;
    expect(review.find((e) => "ref" in e && e.ref === lineItemId)).toEqual({ ref: lineItemId, group: "request" });
    expect(review.find((e) => "ref" in e && e.ref === costCenter.id)).toMatchObject({ ref: costCenter.id, tab: "review" });
  });

  it("keeps the body publishable when line_item is renamed through its label", () => {
    const body = exampleDraft();
    const lineItemId = groupIdOf(body);
    const before = runValidation(body, undefined, {}, {});

    const renamed = structuredClone(body);
    writeGroupLabel(renamed, lineItemId, { en: "Line Items" }, "en");

    expect(draftFields(renamed).find((f) => f.id === lineItemId)!.key).toBe("line_items");
    const after = runValidation(renamed, undefined, {}, {});
    expect(after.zodValid).toBe(true);
    expect(after.issues).toEqual(before.issues);
  });

  it("without the view sync, a bare catalog move strands every view entry naming the moved field", () => {
    // The other half of the same fact the tests above prove: the view sync
    // is what keeps a move publishable. `moveFieldToGroup` alone leaves the
    // moved field's view entries naming their old group, which disagrees
    // with the field's real catalog parent.
    const body = exampleDraft();
    const vendor = draftFields(body).find((f) => f.key === "vendor")!;

    const moved: Draft = { ...body, fields: moveFieldToGroup(body.fields as DraftField[], vendor.id!, groupIdOf(body)) };

    const after = runValidation(moved, undefined, {}, {});
    const stranded = after.issues.filter(
      (i) => i.message === 'a view entry\'s group must name this field\'s catalog parent, "line_item"',
    );
    expect(stranded).toHaveLength(3);
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

/**
 * The move control's own set, built from the same three pieces the rail's
 * per-row target build once assembled (design.md, decision: "One write, one
 * announcement, and focus back on the control").
 */
describe("moveTargetsFor", () => {
  it("names the top level first, then every group", () => {
    const fields = [fld("field_a", "a"), grp("field_g", "g", []), grp("field_h", "h", [])];

    const { currentId, targetIds } = moveTargetsFor(fields, "field_a");

    expect(currentId).toBeUndefined();
    expect(targetIds).toEqual([undefined, "field_g", "field_h"]);
  });

  it("never names the field itself or any group inside it", () => {
    const fields = [grp("field_g", "g", [grp("field_inner", "inner", [])]), grp("field_h", "h", [])];

    const { targetIds } = moveTargetsFor(fields, "field_g");

    expect(targetIds).toEqual([undefined, "field_h"]);
  });

  it("keeps a parent that is no longer a group, and names it as the current id", () => {
    const orphaning = { ...grp("field_g", "g", [fld("field_a", "a")]), type: "string" as const };
    const fields = [orphaning];

    const { currentId, targetIds } = moveTargetsFor(fields, "field_a");

    expect(currentId).toBe("field_g");
    expect(targetIds).toEqual([undefined, "field_g"]);
  });
});

describe("neighbourAfterRemove", () => {
  it("selects the next sibling when a group's first field is removed", () => {
    const fields = [grp("field_g", "g", [fld("field_a", "a"), fld("field_b", "b"), fld("field_c", "c")])];

    expect(neighbourAfterRemove(fields, "field_a")).toBe("field_b");
  });

  it("selects the previous sibling when a group's last field is removed", () => {
    const fields = [grp("field_g", "g", [fld("field_a", "a"), fld("field_b", "b"), fld("field_c", "c")])];

    expect(neighbourAfterRemove(fields, "field_c")).toBe("field_b");
  });

  it("selects the parent group when its only field is removed", () => {
    const fields = [grp("field_g", "g", [fld("field_a", "a")])];

    expect(neighbourAfterRemove(fields, "field_a")).toBe("field_g");
  });

  it("selects the next top-level field", () => {
    const fields = [fld("field_a", "a"), fld("field_b", "b"), fld("field_c", "c")];

    expect(neighbourAfterRemove(fields, "field_a")).toBe("field_b");
  });

  it("selects the previous top-level field when the last one is removed", () => {
    const fields = [fld("field_a", "a"), fld("field_b", "b"), fld("field_c", "c")];

    expect(neighbourAfterRemove(fields, "field_c")).toBe("field_b");
  });

  it("selects nothing when the only top-level field is removed", () => {
    const fields = [fld("field_a", "a")];

    expect(neighbourAfterRemove(fields, "field_a")).toBeUndefined();
  });

  it("selects nothing for an id no field carries", () => {
    const fields = [fld("field_a", "a"), grp("field_g", "g", [fld("field_b", "b")])];

    expect(neighbourAfterRemove(fields, "field_missing")).toBeUndefined();
  });
});

/**
 * Where keyboard focus lands after a removal (`studio-app`: "A removal on the
 * Fields tab moves focus to the next rail entry and announces itself"). One
 * case per branch of design.md's order: the neighbour's rail entry, the first
 * rail entry the pruned catalog keeps, then Add the first field.
 */
describe("focusAfterRemove", () => {
  it("focuses the rail entry of the field the neighbour rule selects", () => {
    const fields = [grp("field_g", "g", [fld("field_a", "a"), fld("field_b", "b")])];

    expect(focusAfterRemove(fields, "field_a")).toBe(railEntryId("field_b"));
  });

  // The rail lists no entry for a field without an id, so the neighbour rule
  // answers nothing for `field_a`, whose parent carries none. The rail lists
  // `field_a` first today, and only the pruned catalog's first entry is right.
  it("focuses the first rail entry the pruned catalog keeps when the neighbour rule answers nothing", () => {
    const idlessGroup = { key: "unsaved", label: { en: "Unsaved" }, type: "group", fields: [fld("field_a", "a")] } as unknown as DraftField;
    const fields = [idlessGroup, fld("field_b", "b")];

    expect(neighbourAfterRemove(fields, "field_a")).toBeUndefined();
    expect(focusAfterRemove(fields, "field_a")).toBe(railEntryId("field_b"));
  });

  it("focuses Add the first field when the removal leaves the rail no entry", () => {
    expect(focusAfterRemove([fld("field_a", "a")], "field_a")).toBe(ADD_FIRST_FIELD_ID);
  });
});

describe("fieldLabelInputId and railEntryId", () => {
  it("pins the label input id", () => {
    expect(fieldLabelInputId("field_a")).toBe("studio-field-label-field_a");
  });

  it("pins the rail entry id", () => {
    expect(railEntryId("field_a")).toBe("studio-field-rail-field_a");
  });
});

describe("removalAnnouncement", () => {
  it("announces a plain field with no sentence about fields inside it", () => {
    expect(removalAnnouncement("Booking Status", 0)).toBe("Booking Status removed.");
  });

  it("uses the singular form for exactly one field inside", () => {
    expect(removalAnnouncement("Some Group", 1)).toBe("Some Group removed, with the one field inside it.");
  });

  it("uses the plural form and states the count for more than one field inside", () => {
    expect(removalAnnouncement("Processing (Fabrikam)", 18)).toBe(
      "Processing (Fabrikam) removed, with the 18 fields inside it.",
    );
  });

  it("keeps a label holding the literal text {count} as the author typed it", () => {
    expect(removalAnnouncement("{count} copies", 2)).toBe("{count} copies removed, with the 2 fields inside it.");
  });
});
