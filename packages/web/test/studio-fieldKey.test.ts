import { describe, expect, it } from "bun:test";
import { writeFieldKey } from "../src/areas/studio/draft/fieldKey.js";
import { writeFieldLabel } from "../src/areas/studio/draft/fieldLabel.js";
import { draftFields, type DraftField } from "../src/areas/studio/draft/fields.js";
import { countKeyRewrites } from "../src/areas/studio/draft/key-readers.js";
import { commitKeyInput } from "../src/areas/studio/panels/FieldCatalogPanel.js";
import type { Draft } from "../src/areas/studio/draft/types.js";
import {
  isFieldKeyLocked,
  keyCommitProblem,
  keyFollowsLabel,
  labelChangePatch,
  takenFieldKeys,
} from "../src/areas/studio/panels/fieldCatalogLogic.js";

/**
 * The key rules of `studio-app` (change `studio-field-key-follows-name`): a
 * key follows its label until the first publish, and every key change takes
 * the expressions reading the old key along. Each case drives the draft
 * writes the Fields tab and the form editor share.
 */

const cel = (src: string) => ({ lang: "cel" as const, src });

type Guard = { lang: "cel"; src: string };

/** A draft holding `fields`, and one step whose one way out carries `guard`
 * and whose view holds `view`. */
const draftOf = (fields: unknown[], guard?: string, view: unknown[] = []): Draft =>
  ({
    baseLocale: "en",
    fields,
    workflow: {
      initialStep: "step_a",
      steps: [
        {
          id: "step_a",
          key: "a",
          label: { en: "A" },
          type: "task",
          view: { fields: view },
          paths: [{ id: "path_a", key: "p", label: "P", to: "step_a", trigger: "manual", ...(guard ? { guard: cel(guard) } : {}) }],
        },
      ],
    },
  }) as unknown as Draft;

const amountField = (extra: Record<string, unknown> = {}) => ({
  id: "field_amount",
  key: "amount",
  type: "number",
  label: { en: "Amount" },
  ...extra,
});

const fieldIn = (d: Draft, id: string): DraftField => draftFields(d).find((f) => f.id === id)!;
const guardOf = (d: Draft): string =>
  ((d.workflow as unknown as { steps: { paths: { guard?: Guard }[] }[] }).steps[0]!.paths[0]!.guard as Guard).src;

/** Types `text` into `fieldId`'s base label one character at a time. */
const typeLabel = (d: Draft, fieldId: string, text: string, published: ReadonlySet<string> | undefined = new Set()) => {
  for (let n = 1; n <= text.length; n++) writeFieldLabel(d, fieldId, { en: text.slice(0, n) }, "en", published);
};

describe("A field's key follows its label", () => {
  it("lets a new top-level field's key follow its label as the author types", () => {
    const d = draftOf([{ id: "field_new", key: "", type: "string", label: { en: "" } }]);
    typeLabel(d, "field_new", "Requested amount");

    expect(fieldIn(d, "field_new").key).toBe("requested_amount");
  });

  it("keeps a new field's key empty while the author types in a non-base content locale", () => {
    const d = draftOf([{ id: "field_new", key: "", type: "string", label: { de: "" } }]);
    for (const text of ["B", "Be", "Betrag"]) writeFieldLabel(d, "field_new", { de: text }, "en", new Set());

    expect(fieldIn(d, "field_new").key).toBe("");
  });

  it("lets a nested field's key follow its own label", () => {
    const d = draftOf([
      { id: "field_group", key: "items", type: "group", label: { en: "Items" }, fields: [{ id: "field_qty", key: "", type: "number", label: { en: "" } }] },
    ]);
    typeLabel(d, "field_qty", "Quantity");

    expect(fieldIn(d, "field_qty").key).toBe("quantity");
  });

  it("stops following once the author commits a key of their own", () => {
    const d = draftOf([amountField()]);
    writeFieldKey(d, "field_amount", "sum");
    typeLabel(d, "field_amount", "Amount due");

    expect(fieldIn(d, "field_amount").key).toBe("sum");
  });

  it("leaves a derived key untouched when the author types a translation", () => {
    const d = draftOf([{ id: "field_new", key: "", type: "string", label: { en: "" } }]);
    typeLabel(d, "field_new", "Amount");
    writeFieldLabel(d, "field_new", { en: "Amount", de: "Betrag" }, "en", new Set());

    expect(fieldIn(d, "field_new").key).toBe("amount");
  });
});

describe("A prior label that derives no key leaves the key following", () => {
  it("follows again after a label that derives no key, and takes the guard along", () => {
    const d = draftOf([amountField()], "data.amount > 1000.0");
    writeFieldLabel(d, "field_amount", { en: "€" }, "en", new Set());
    expect(fieldIn(d, "field_amount").key).toBe("amount");

    writeFieldLabel(d, "field_amount", { en: "€ Total" }, "en", new Set());

    expect(fieldIn(d, "field_amount").key).toBe("total");
    expect(guardOf(d)).toBe("data.total > 1000.0");
  });

  it("moves nothing on a translation write after the empty label", () => {
    const d = draftOf([amountField({ label: { en: "€" } })], "data.amount > 1000.0");
    writeFieldLabel(d, "field_amount", { en: "€", de: "Gesamt" }, "en", new Set());

    expect(fieldIn(d, "field_amount").key).toBe("amount");
    expect(guardOf(d)).toBe("data.amount > 1000.0");
  });

  it("does not follow from an empty prior label when nothing reads the key", () => {
    const d = draftOf([amountField({ label: { en: "€" } })]);
    writeFieldLabel(d, "field_amount", { en: "€ Total" }, "en", new Set());

    expect(fieldIn(d, "field_amount").key).toBe("amount");
  });
});

describe("A derived field key takes the identifier shape", () => {
  it("derives groesse from Größe", () => {
    const d = draftOf([{ id: "field_new", key: "", type: "string", label: { en: "" } }]);
    writeFieldLabel(d, "field_new", { en: "Größe" }, "en", new Set());

    expect(fieldIn(d, "field_new").key).toBe("groesse");
  });
});

describe("A derived field key steps past a taken key", () => {
  it("gives a colliding key a _2 suffix, against a field nested in a group", () => {
    const d = draftOf([
      { id: "field_group", key: "items", type: "group", label: { en: "Items" }, fields: [amountField()] },
      { id: "field_new", key: "", type: "number", label: { en: "" } },
    ]);
    writeFieldLabel(d, "field_new", { en: "Amount" }, "en", new Set());

    expect(fieldIn(d, "field_new").key).toBe("amount_2");
  });

  it("takes the next number on a second collision", () => {
    const d = draftOf([
      amountField(),
      { id: "field_two", key: "amount_2", type: "number", label: { en: "Amount 2" } },
      { id: "field_new", key: "", type: "number", label: { en: "" } },
    ]);
    writeFieldLabel(d, "field_new", { en: "Amount" }, "en", new Set());

    expect(fieldIn(d, "field_new").key).toBe("amount_3");
  });

  it("passes over a key that only an expression reads", () => {
    const d = draftOf([{ id: "field_new", key: "", type: "number", label: { en: "" } }], "data.amount > 1000.0");
    writeFieldLabel(d, "field_new", { en: "Amount" }, "en", new Set());

    expect(fieldIn(d, "field_new").key).toBe("amount_2");
    expect(guardOf(d)).toBe("data.amount > 1000.0");
  });

  it("keeps a deduped key following its label after the other field's key changed", () => {
    const d = draftOf([
      { id: "field_date", key: "date_2", type: "string", label: { en: "Date" } },
      { id: "field_other", key: "start_date", type: "string", label: { en: "Start date" } },
    ]);
    writeFieldLabel(d, "field_date", { en: "Due date" }, "en", new Set());

    expect(fieldIn(d, "field_date").key).toBe("due_date");
  });
});

describe("A field key never reads as a CEL literal", () => {
  it("numbers a literal word: Null derives null_2", () => {
    const d = draftOf([{ id: "field_new", key: "", type: "string", label: { en: "" } }]);
    writeFieldLabel(d, "field_new", { en: "Null" }, "en", new Set());

    expect(fieldIn(d, "field_new").key).toBe("null_2");
  });

  it("refuses a commit of true, which writes nothing", () => {
    const d = draftOf([amountField()], "data.amount > 1000.0");
    const before = structuredClone(d);
    let calls = 0;
    const result = commitKeyInput(
      d,
      (recipe) => {
        calls += 1;
        recipe(d);
      },
      fieldIn(d, "field_amount"),
      "true",
    );

    expect(result.problem).toBe("literal");
    expect(result.typed).toBe("true");
    expect(calls).toBe(0);
    expect(d).toEqual(before);
  });

  it("counts every literal word as taken for a field, and none for a group", () => {
    const d = draftOf([amountField(), { id: "field_group", key: "items", type: "group", label: { en: "Items" }, fields: [] }]);

    for (const word of ["in", "true", "false", "null"]) {
      expect(takenFieldKeys(d, "field_amount").has(word)).toBe(true);
      expect(takenFieldKeys(d, "field_group", true).has(word)).toBe(false);
    }
  });
});

describe("A published field's key stays when its label changes", () => {
  it("lets a key that a guard reads follow the label and takes the guard along", () => {
    const d = draftOf([amountField()], "data.amount > 1000.0");
    writeFieldLabel(d, "field_amount", { en: "Total amount" }, "en", new Set());

    expect(fieldIn(d, "field_amount").key).toBe("total_amount");
    expect(guardOf(d)).toBe("data.total_amount > 1000.0");
  });

  it("keeps a published field's key when the label changes", () => {
    const d = draftOf([amountField()]);
    writeFieldLabel(d, "field_amount", { en: "Total amount" }, "en", new Set(["field_amount"]));

    expect(fieldIn(d, "field_amount").key).toBe("amount");
  });

  it("lets a key nothing reads follow the label in a draft with no base version", () => {
    const d = draftOf([amountField()]);
    writeFieldLabel(d, "field_amount", { en: "Total amount" }, "en", new Set());

    expect(fieldIn(d, "field_amount").key).toBe("total_amount");
  });

  it("holds the lock until the base version has loaded", () => {
    const d = draftOf([amountField()], "data.amount > 1000.0");
    writeFieldLabel(d, "field_amount", { en: "Total amount" }, "en", undefined);

    expect(fieldIn(d, "field_amount").key).toBe("amount");
    expect(guardOf(d)).toBe("data.amount > 1000.0");
  });

  it("lets a group field's key follow its label though the base version holds it, with its view entries", () => {
    const d = draftOf(
      [{ id: "field_request", key: "request", type: "group", label: { en: "Request" }, fields: [{ id: "field_child", key: "child", type: "string", label: { en: "Child" } }] }],
      undefined,
      [{ ref: "field_request" }, { ref: "field_child", group: "request" }],
    );
    writeFieldLabel(d, "field_request", { en: "Order request" }, "en", new Set(["field_request"]));

    expect(fieldIn(d, "field_request").key).toBe("order_request");
    const entries = (d.workflow as unknown as { steps: { view: { fields: { group?: string }[] } }[] }).steps[0]!.view.fields;
    expect(entries[1]!.group).toBe("order_request");
  });

  it("locks by publication alone: a reader does not lock, a group never locks", () => {
    const d = draftOf([amountField()], "data.amount > 1000.0");
    const group = { id: "field_g", key: "g", type: "group", label: { en: "G" } } as unknown as DraftField;

    expect(isFieldKeyLocked(fieldIn(d, "field_amount"), new Set())).toBe(false);
    expect(isFieldKeyLocked(fieldIn(d, "field_amount"), new Set(["field_amount"]))).toBe(true);
    expect(isFieldKeyLocked(fieldIn(d, "field_amount"), undefined)).toBe(true);
    expect(isFieldKeyLocked(group, undefined)).toBe(false);
  });
});

describe("A label that derives no key keeps a key that is read", () => {
  it("keeps a key a condition reads when the label clears", () => {
    const d = draftOf([amountField()], "data.amount > 1000.0");
    writeFieldLabel(d, "field_amount", { en: "" }, "en", new Set());

    expect(fieldIn(d, "field_amount").key).toBe("amount");
    expect(guardOf(d)).toBe("data.amount > 1000.0");
  });

  it("lets a key nothing reads follow the label to empty", () => {
    const d = draftOf([amountField()]);

    expect(labelChangePatch(d, fieldIn(d, "field_amount"), { en: "" }, "en", new Set())).toEqual({ label: { en: "" }, key: "" });
  });
});

describe("A key change rewrites every expression that reads the old key", () => {
  it("rewrites a guard and a form condition on a commit", () => {
    const d = draftOf([amountField()], "data.amount > 1000.0", [{ ref: "field_amount", visible: cel("data.amount > 0.0") }]);
    writeFieldKey(d, "field_amount", "total");

    expect(guardOf(d)).toBe("data.total > 1000.0");
    const entry = (d.workflow as unknown as { steps: { view: { fields: { visible: Guard }[] } }[] }).steps[0]!.view.fields[0]!;
    expect(entry.visible.src).toBe("data.total > 0.0");
  });

  it("rewrites the readers of a published field's key commit", () => {
    const d = draftOf([amountField()], "data.amount > 1000.0");
    expect(keyCommitProblem(d, fieldIn(d, "field_amount"), "total")).toBeUndefined();
    writeFieldKey(d, "field_amount", "total");

    expect(fieldIn(d, "field_amount").key).toBe("total");
    expect(guardOf(d)).toBe("data.total > 1000.0");
  });

  it("leaves the readers of a key two fields share", () => {
    const d = draftOf([amountField(), { id: "field_twin", key: "amount", type: "number", label: { en: "Twin" } }], "data.amount > 1000.0");
    writeFieldKey(d, "field_amount", "total");

    expect(fieldIn(d, "field_amount").key).toBe("total");
    expect(guardOf(d)).toBe("data.amount > 1000.0");
  });

  it("rewrites nothing when the old key was empty", () => {
    const d = draftOf([{ id: "field_new", key: "", type: "number", label: { en: "" } }], "data.amount > 1000.0");
    writeFieldKey(d, "field_new", "total");

    expect(fieldIn(d, "field_new").key).toBe("total");
    expect(guardOf(d)).toBe("data.amount > 1000.0");
  });

  it("counts the rewrites before the write, as the write then makes them", () => {
    const d = draftOf([amountField()], "data.amount > 1000.0", [{ ref: "field_amount", visible: cel("data.amount > 0.0") }]);

    expect(countKeyRewrites(d, "field_amount", "amount", "total")).toBe(2);
    expect(countKeyRewrites(d, "field_amount", "amount", "")).toBe(0);
    writeFieldKey(d, "field_amount", "total");
    expect(countKeyRewrites(d, "field_amount", "amount", "total")).toBe(0);
  });
});

describe("keyCommitProblem", () => {
  const d = draftOf([amountField(), { id: "field_status", key: "status", type: "string", label: { en: "Status" } }]);
  const amount = () => fieldIn(d, "field_amount");

  it("answers empty for no text", () => {
    expect(keyCommitProblem(d, amount(), "")).toBe("empty");
  });

  it("answers grammar for text outside the identifier grammar", () => {
    expect(keyCommitProblem(d, amount(), "Total Amount")).toBe("grammar");
    expect(keyCommitProblem(d, amount(), "1total")).toBe("grammar");
  });

  it("answers literal for each literal word", () => {
    for (const word of ["in", "true", "false", "null"]) expect(keyCommitProblem(d, amount(), word)).toBe("literal");
  });

  it("answers taken for a key another field carries", () => {
    expect(keyCommitProblem(d, amount(), "status")).toBe("taken");
  });

  it("answers undefined for a free key, and for the field's own key", () => {
    expect(keyCommitProblem(d, amount(), "total_due")).toBeUndefined();
    expect(keyCommitProblem(d, amount(), "amount")).toBeUndefined();
  });
});

describe("A commit onto a key only an expression reads takes its readers", () => {
  it("binds the dangling guard and moves the field's own readers", () => {
    const d = draftOf([{ id: "field_sum", key: "sum", type: "number", label: { en: "Sum" } }], "data.amount > 1000.0", [
      { ref: "field_sum", visible: cel("data.sum > 0.0") },
    ]);
    expect(keyCommitProblem(d, fieldIn(d, "field_sum"), "amount")).toBeUndefined();
    expect(countKeyRewrites(d, "field_sum", "sum", "amount")).toBe(1);
    writeFieldKey(d, "field_sum", "amount");

    expect(fieldIn(d, "field_sum").key).toBe("amount");
    expect(guardOf(d)).toBe("data.amount > 1000.0");
    const entry = (d.workflow as unknown as { steps: { view: { fields: { visible: Guard }[] } }[] }).steps[0]!.view.fields[0]!;
    expect(entry.visible.src).toBe("data.amount > 0.0");
  });
});

describe("A group's key commit keeps its own rule", () => {
  const groupDraft = () =>
    draftOf(
      [
        { id: "field_request", key: "request", type: "group", label: { en: "Request" }, fields: [{ id: "field_child", key: "child", type: "string", label: { en: "Child" } }] },
        { id: "field_order", key: "order", type: "group", label: { en: "Order" }, fields: [] },
      ],
      undefined,
      [{ ref: "field_request" }, { ref: "field_child", group: "request" }],
    );
  const entries = (d: Draft) => (d.workflow as unknown as { steps: { view: { fields: { group?: string }[] } }[] }).steps[0]!.view.fields;

  it("commits an empty key, which no refusal stops, and clears its entries' group", () => {
    const d = groupDraft();
    expect(keyCommitProblem(d, fieldIn(d, "field_request"), "")).toBeUndefined();
    writeFieldKey(d, "field_request", "");

    expect(fieldIn(d, "field_request").key).toBe("");
    expect(entries(d)[1]!.group).toBeUndefined();
  });

  it("commits another group's key, which no refusal stops, and rewrites its entries", () => {
    const d = groupDraft();
    expect(keyCommitProblem(d, fieldIn(d, "field_request"), "order")).toBeUndefined();
    writeFieldKey(d, "field_request", "order");

    expect(fieldIn(d, "field_request").key).toBe("order");
    expect(entries(d)[1]!.group).toBe("order");
  });

  it("rewrites its view entries on a plain commit", () => {
    const d = groupDraft();
    writeFieldKey(d, "field_request", "order_request");

    expect(entries(d)[1]!.group).toBe("order_request");
  });
});

describe("keyFollowsLabel", () => {
  const field = (key: string, label: Record<string, string>) => ({ id: "field_x", key, type: "string", label }) as unknown as DraftField;

  it("counts an empty key, the plain derivation and a suffixed one as following", () => {
    const d = draftOf([]);
    expect(keyFollowsLabel(d, field("", { en: "Amount" }))).toBe(true);
    expect(keyFollowsLabel(d, field("amount", { en: "Amount" }))).toBe(true);
    expect(keyFollowsLabel(d, field("amount_2", { en: "Amount" }))).toBe(true);
  });

  it("says a hand-committed key no longer follows", () => {
    expect(keyFollowsLabel(draftOf([]), field("sum", { en: "Amount" }))).toBe(false);
  });

  it("counts a read key the empty-label rule holds as following, and an unread one not", () => {
    expect(keyFollowsLabel(draftOf([], "data.amount > 1.0"), field("amount", { en: "€" }))).toBe(true);
    expect(keyFollowsLabel(draftOf([]), field("amount", { en: "€" }))).toBe(false);
  });
});

describe("takenFieldKeys", () => {
  it("holds other fields' keys, keys only an expression reads, and the literal words", () => {
    const d = draftOf([amountField(), { id: "field_new", key: "", type: "string", label: { en: "" } }], "data.amount > data.limit");

    expect([...takenFieldKeys(d, "field_new")].sort()).toEqual(["amount", "false", "in", "limit", "null", "true"]);
    expect([...takenFieldKeys(d, "field_amount")].sort()).toEqual(["false", "in", "limit", "null", "true"]);
  });

  it("counts every field's key for a mint, a field with no id included", () => {
    const d = draftOf([amountField(), { key: "unsaved", type: "string", label: { en: "" } }]);

    expect(takenFieldKeys(d).has("unsaved")).toBe(true);
    expect(takenFieldKeys(d).has("amount")).toBe(true);
  });

  it("reads a field's rule unless told the field is a group, whatever type exceptId carries", () => {
    const d = draftOf([{ id: "field_group", key: "items", type: "group", label: { en: "Items" }, fields: [] }], "data.limit > 1.0");

    expect([...takenFieldKeys(d, "field_group")].sort()).toEqual(["false", "in", "limit", "null", "true"]);
    expect([...takenFieldKeys(d, "field_group", true)]).toEqual([]);
  });

  it("holds only other fields' keys for a group, minted or existing", () => {
    const d = draftOf([amountField()], "data.limit > 1.0");

    expect([...takenFieldKeys(d, undefined, true)]).toEqual(["amount"]);
  });
});
