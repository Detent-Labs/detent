import { describe, expect, it } from "bun:test";
import {
  booleanChoice,
  comparisonType,
  initialTextState,
  parseComparisonText,
  reasonKey,
  reconcileText,
  rightSideOptions,
  rowIncomplete,
  switchField,
  switchOperator,
  switchRightSide,
  syncRowIds,
  valueFromChoice,
  withoutRowId,
  withValue,
  type TextState,
  type WhereEntry,
} from "../src/areas/studio/panels/shared/comparisonRow.js";
import type { TargetRef } from "../src/areas/studio/panels/shared/useTargetProcessCatalog.js";

/** `studio-plugin-config-form`: the literal scenarios, one test each, plus design.md decision 2's row text rule. */

const FIELDS: TargetRef[] = [
  { id: "field_priority", key: "priority", label: "Priority", type: "number" },
  { id: "field_urgent", key: "urgent", label: "Urgent", type: "boolean" },
  { id: "field_status", key: "status", label: "Status", type: "string" },
  { id: "field_amount", key: "amount", label: "Amount", type: "number" },
  { id: "field_money", key: "money", label: "Money" },
];

/** What the form commits for one keystroke: parse the text, then write the result or drop the value. */
function typeInto(entry: WhereEntry, text: string): WhereEntry {
  const parsed = parseComparisonText(text, comparisonType(FIELDS, entry.fieldId), entry.operator);
  return withValue(entry, parsed.ok ? parsed.value : undefined);
}

describe("a literal of the compared field's declared type", () => {
  it("writes the number 1 for a number field, never the string", () => {
    const next = typeInto({ fieldId: "field_priority", operator: "eq" }, "1");
    expect(next.value).toBe(1);
    expect(next.value).not.toBe("1");
  });

  it("writes true for Yes on a boolean field", () => {
    expect(comparisonType(FIELDS, "field_urgent")).toBe("boolean");
    expect(withValue({ fieldId: "field_urgent", operator: "eq" }, valueFromChoice("true")).value).toBe(true);
    expect(withValue({ fieldId: "field_urgent", operator: "eq" }, valueFromChoice("false")).value).toBe(false);
    expect(booleanChoice(true)).toBe("true");
    expect(booleanChoice(false)).toBe("false");
    expect(booleanChoice(undefined)).toBe("");
  });

  it("keeps text for a string field", () => {
    expect(typeInto({ fieldId: "field_status", operator: "eq" }, "open").value).toBe("open");
  });

  it("leaves the entry without a value when the text does not parse, and names the reason", () => {
    const entry = { fieldId: "field_priority", operator: "eq" as const, value: 1 };
    const parsed = parseComparisonText("abc", "number", "eq");
    expect(parsed).toEqual({ ok: false, reason: "not-number" });
    expect(reasonKey("not-number")).toBe("instanceQuery.notNumber");
    expect(reasonKey("not-boolean")).toBe("instanceQuery.notBoolean");
    expect(reasonKey("empty")).toBeUndefined();

    const next = typeInto(entry, "abc");
    expect("value" in next).toBe(false);
    expect("valueFromField" in next).toBe(false);

    // The row keeps `abc`: the dropped value reaches the row as `undefined`,
    // which is what `abc` parses to, so the text stays.
    const state = { text: "abc", seen: 1 as unknown };
    expect(reconcileText(state, undefined, "number", "eq")).toEqual({ text: "abc", seen: undefined });
  });

  it("reopens a saved number as its text", () => {
    expect(initialTextState(1).text).toBe("1");
  });

  it("gives a plugin-typed field text", () => {
    expect(comparisonType(FIELDS, "field_money")).toBe("string");
  });

  it("clears the literal when the new field takes another value type", () => {
    const next = switchField({ fieldId: "field_priority", operator: "eq", value: 1 }, "field_urgent", FIELDS);
    expect(next.fieldId).toBe("field_urgent");
    expect("value" in next).toBe(false);
  });

  it("keeps the literal when the new field takes the same value type", () => {
    expect(switchField({ fieldId: "field_priority", operator: "eq", value: 1 }, "field_amount", FIELDS).value).toBe(1);
  });

  it("keeps an own-field right side across a field change", () => {
    expect(switchField({ fieldId: "field_priority", operator: "eq", valueFromField: "field_own" }, "field_urgent", FIELDS).valueFromField).toBe(
      "field_own",
    );
  });
});

describe("the literal control waits for the type", () => {
  it("knows no type while the catalog loads or fails", () => {
    expect(comparisonType(undefined, "field_priority")).toBeUndefined();
  });

  it("knows no type before a field is picked", () => {
    expect(comparisonType(FIELDS, undefined)).toBeUndefined();
    expect(comparisonType(FIELDS, "")).toBeUndefined();
  });

  it("knows no type for a field the catalog lacks", () => {
    expect(comparisonType(FIELDS, "field_gone")).toBeUndefined();
  });
});

describe("an in comparison takes a comma-separated list", () => {
  it("parses a list of numbers", () => {
    expect(typeInto({ fieldId: "field_priority", operator: "in" }, "1, 2").value).toEqual([1, 2]);
  });

  it("keeps the typed text after a comma", () => {
    const next = typeInto({ fieldId: "field_status", operator: "in" }, "a,b");
    expect(next.value).toEqual(["a", "b"]);
    const state = { text: "a,b", seen: undefined as unknown };
    expect(reconcileText(state, next.value, "string", "in")).toEqual({ text: "a,b", seen: ["a", "b"] });
  });

  it("offers the literal list alone as the right side", () => {
    expect(rightSideOptions("in")).toEqual(["literal"]);
    expect(rightSideOptions("eq")).toEqual(["literal", "field"]);
    expect(rightSideOptions(undefined)).toEqual(["literal", "field"]);
  });

  it("drops the scalar value and the own field when the operator changes from eq to in", () => {
    const fromValue = switchOperator({ fieldId: "field_priority", operator: "eq", value: 1 }, "in");
    expect(fromValue).toEqual({ fieldId: "field_priority", operator: "in" });
    const fromField = switchOperator({ fieldId: "field_priority", operator: "eq", valueFromField: "field_own" }, "in");
    expect(fromField).toEqual({ fieldId: "field_priority", operator: "in" });
  });

  it("drops the list when the operator changes from in back to eq", () => {
    expect(switchOperator({ fieldId: "field_priority", operator: "in", value: [1, 2] }, "eq")).toEqual({ fieldId: "field_priority", operator: "eq" });
  });

  it("keeps the value between eq and ne", () => {
    expect(switchOperator({ fieldId: "field_priority", operator: "eq", value: 1 }, "ne").value).toBe(1);
  });
});

describe("the right-side switch", () => {
  it("writes the first own field, and no value, for the own-field side", () => {
    const own: TargetRef[] = [{ id: "field_own", key: "own", label: "Own" }];
    expect(switchRightSide({ fieldId: "field_priority", operator: "eq", value: 1 }, "field", own)).toEqual({
      fieldId: "field_priority",
      operator: "eq",
      valueFromField: "field_own",
    });
  });

  it("writes neither key for the literal side, so the row starts incomplete", () => {
    const next = switchRightSide({ fieldId: "field_priority", operator: "eq", valueFromField: "field_own" }, "literal", []);
    expect(next).toEqual({ fieldId: "field_priority", operator: "eq" });
    expect(rowIncomplete(next)).toBe(true);
  });
});

describe("rowIncomplete", () => {
  it("is true without a field or without a right side, and false once both exist", () => {
    expect(rowIncomplete({ operator: "eq", value: 1 })).toBe(true);
    expect(rowIncomplete({ fieldId: "field_priority", operator: "eq" })).toBe(true);
    expect(rowIncomplete({ fieldId: "field_priority", operator: "eq", valueFromField: "" })).toBe(true);
    expect(rowIncomplete({ fieldId: "field_priority", operator: "eq", value: 1 })).toBe(false);
    expect(rowIncomplete({ fieldId: "field_priority", operator: "eq", valueFromField: "field_own" })).toBe(false);
  });
});

describe("reconcileText: the row keeps its text, the parent keeps the parsed value", () => {
  it("returns the same state object while the value prop is unchanged", () => {
    const state = { text: "01", seen: 1 as unknown };
    expect(reconcileText(state, 1, "number", "eq")).toBe(state);
  });

  it("keeps the typed text when the new prop is what that text parses to", () => {
    const state = { text: "1.50", seen: 1 as unknown };
    expect(reconcileText(state, 1.5, "number", "eq")).toEqual({ text: "1.50", seen: 1.5 });
  });

  it("adopts a raw JSON change", () => {
    const state = { text: "1", seen: 1 as unknown };
    expect(reconcileText(state, 7, "number", "eq")).toEqual({ text: "7", seen: 7 });
  });

  it("adopts a stored value of the wrong type once, then stays quiet", () => {
    const state = { text: "1", seen: 1 as unknown };
    const once = reconcileText(state, "5", "number", "eq");
    expect(once).toEqual({ text: "5", seen: "5" });
    // "5" parses to the number 5, which differs from the string prop. A guard
    // comparing those on every draw would set the text again and loop.
    expect(reconcileText(once, "5", "number", "eq")).toBe(once);
  });

  it("clears the text when the value is cleared under text that still parses", () => {
    const state = { text: "open", seen: "open" as unknown };
    expect(reconcileText(state, undefined, "string", "eq")).toEqual({ text: "", seen: undefined });
  });

  it("parses as text while the type is unknown", () => {
    const state = { text: "", seen: undefined as unknown };
    expect(reconcileText(state, 5, undefined, "eq")).toEqual({ text: "5", seen: 5 });
  });
});

describe("comparison row keys", () => {
  it("keeps the keys while they match the row count, and mints one per row otherwise", () => {
    const ids = ["row_a", "row_b"];
    expect(syncRowIds(ids, 2)).toBeUndefined();
    const fresh = syncRowIds(ids, 3)!;
    expect(fresh).toHaveLength(3);
    expect(new Set(fresh).size).toBe(3);
    expect(syncRowIds([], 0)).toBeUndefined();
  });

  it("keeps the next row's own text when an earlier row with unparsed text is removed", () => {
    // Row 0 holds `abc` on a number field, so its value is undefined. Row 1
    // has no value either. Each row's text lives under its key.
    const ids = ["row_a", "row_b"];
    const texts = new Map<string, TextState>([
      ["row_a", { text: "abc", seen: undefined }],
      ["row_b", { text: "", seen: undefined }],
    ]);
    const where: WhereEntry[] = [
      { fieldId: "field_priority", operator: "eq" },
      { fieldId: "field_priority", operator: "eq" },
    ];

    const nextIds = withoutRowId(ids, 0);
    const nextWhere = where.filter((_, i) => i !== 0);
    expect(syncRowIds(nextIds, nextWhere.length)).toBeUndefined();

    // The surviving row draws under its own key, so it reconciles its own
    // text. An index key would hand it row 0's `abc`, and `undefined` against
    // `undefined` would keep that text.
    expect(nextIds).toEqual(["row_b"]);
    const drawn = reconcileText(texts.get(nextIds[0]!)!, nextWhere[0]!.value, "number", "eq");
    expect(drawn.text).toBe("");
  });
});
