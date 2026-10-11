/**
 * The report builder's pure view-model module. Components stay untested, per
 * the repo's existing convention (admin-migrationsLogic.test.ts).
 */
import { test, expect } from "bun:test";
import {
  addFieldColumn,
  addMergeColumn,
  addMergeSource,
  allVersionsInRange,
  canRemovePrincipal,
  draftFromReport,
  draftToInput,
  emptyDraft,
  fieldCellDisplay,
  isPartialCoverage,
  isValidReportName,
  mergeCellDisplay,
  moveColumn,
  removeColumn,
  removeMergeSource,
  usedFieldIds,
  rememberTypes,
  valueTypeFor,
  switchComparisonField,
  switchComparisonOperator,
  comparisonIncomplete,
  parseComparisonText,
  reasonKey,
  initialTextState,
  reconcileText,
  syncRowIds,
  withoutRowId,
  columnRequestKey,
  seedTypes,
  typesAfterResponse,
  typesFor,
  booleanChoice,
  valueFromChoice,
  type TextState,
} from "../src/areas/reporting/screens/reportsLogic.js";
import type { DataComparison, Report } from "../src/areas/reporting/api/types.js";

test("isValidReportName rejects empty and whitespace-only names", () => {
  expect(isValidReportName("")).toBe(false);
  expect(isValidReportName("   ")).toBe(false);
  expect(isValidReportName("  My report  ")).toBe(true);
});

test("draftToInput trims the name and omits every unset filter axis", () => {
  const draft = emptyDraft("proc_1");
  draft.name = "  Onboarding  ";
  const input = draftToInput(draft);
  expect(input.name).toBe("Onboarding");
  expect(input.query).toEqual({ status: undefined, createdAfter: undefined, createdBefore: undefined, dataWhere: undefined });
});

test("draftFromReport and draftToInput round-trip a saved report's query axes", () => {
  const report: Report = {
    reportId: "rep_1",
    owner: "user_1",
    processId: "proc_1",
    name: "Onboarding",
    query: { status: ["completed"], createdAfter: "2026-01-01T00:00:00.000Z", createdBefore: "2026-02-01T00:00:00.000Z", dataWhere: [] },
    columns: [{ type: "field", fieldId: "field_x" }],
    viewers: ["user_2"],
    editors: ["user_1"],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const draft = draftFromReport(report);
  const input = draftToInput(draft);
  expect(input.query.status).toEqual(["completed"]);
  expect(input.query.createdAfter).toBe(report.query.createdAfter);
  expect(input.columns).toEqual(report.columns);
  expect(input.viewers).toEqual(report.viewers);
  expect(input.editors).toEqual(report.editors);
});

// ------------------------------------------------------------ comparisons

const AMOUNT: DataComparison = { fieldId: "field_amount", operator: "eq", value: 500 };

test("draftToInput keeps a typed value as it is", () => {
  const draft = { ...emptyDraft("proc_1"), dataWhere: [AMOUNT, { fieldId: "field_tags", operator: "in" as const, value: ["a", "b"] }] };
  expect(draftToInput(draft).query.dataWhere).toEqual([AMOUNT, { fieldId: "field_tags", operator: "in", value: ["a", "b"] }]);
});

test("draftToInput drops a comparison without a value, and every other one stays", () => {
  const draft = { ...emptyDraft("proc_1"), dataWhere: [{ fieldId: "field_amount", operator: "eq" as const, value: undefined }, AMOUNT] };
  expect(draftToInput(draft).query.dataWhere).toEqual([AMOUNT]);
});

test("draftToInput omits dataWhere when every comparison is incomplete", () => {
  const draft = { ...emptyDraft("proc_1"), dataWhere: [{ fieldId: "field_amount", operator: "eq" as const, value: undefined }] };
  expect(draftToInput(draft).query.dataWhere).toBeUndefined();
});

test("draftToInput keeps a null value: only undefined means incomplete", () => {
  const cmp: DataComparison = { fieldId: "field_note", operator: "eq", value: null };
  expect(draftToInput({ ...emptyDraft("proc_1"), dataWhere: [cmp] }).query.dataWhere).toEqual([cmp]);
});

test("comparisonIncomplete is true for an undefined value alone", () => {
  expect(comparisonIncomplete({ fieldId: "field_amount", operator: "eq", value: undefined })).toBe(true);
  expect(comparisonIncomplete(AMOUNT)).toBe(false);
  expect(comparisonIncomplete({ fieldId: "field_flag", operator: "eq", value: false })).toBe(false);
});

test("rememberTypes records every named field, a field without a type included", () => {
  const types = rememberTypes(new Map(), [
    { fieldId: "field_amount", versions: [1], type: "number" },
    { fieldId: "field_plugin", versions: [1] },
  ]);
  expect(types.get("field_amount")).toBe("number");
  expect(types.has("field_plugin")).toBe(true);
  expect(types.get("field_plugin")).toBeUndefined();
});

test("rememberTypes keeps a field the next response no longer names, and returns a new map", () => {
  const first = rememberTypes(new Map(), [{ fieldId: "field_amount", versions: [1], type: "number" }]);
  const second = rememberTypes(first, []);
  expect(second).not.toBe(first);
  expect(second.get("field_amount")).toBe("number");
});

test("rememberTypes lets a later response overwrite a field's type", () => {
  const first = rememberTypes(new Map(), [{ fieldId: "field_amount", versions: [1], type: "string" }]);
  expect(rememberTypes(first, [{ fieldId: "field_amount", versions: [2], type: "number" }]).get("field_amount")).toBe("number");
  // The earlier map stays as it was.
  expect(first.get("field_amount")).toBe("string");
});

test("valueTypeFor reads a remembered type through literalType", () => {
  const types = rememberTypes(new Map(), [
    { fieldId: "field_amount", versions: [1], type: "number" },
    { fieldId: "field_flag", versions: [1], type: "boolean" },
    { fieldId: "field_when", versions: [1], type: "date" },
    { fieldId: "field_plugin", versions: [1] },
  ]);
  expect(valueTypeFor(types, "field_amount", "text")).toBe("number");
  expect(valueTypeFor(types, "field_flag", undefined)).toBe("boolean");
  expect(valueTypeFor(types, "field_when", 5)).toBe("string");
  // A field named without a type takes text, whatever its value holds.
  expect(valueTypeFor(types, "field_plugin", 5)).toBe("string");
});

test("valueTypeFor follows the value for a field no response named, then falls back to text", () => {
  const types = new Map<string, string | undefined>();
  expect(valueTypeFor(types, "field_x", 500)).toBe("number");
  expect(valueTypeFor(types, "field_x", [true])).toBe("boolean");
  expect(valueTypeFor(types, "field_x", "open")).toBe("string");
  expect(valueTypeFor(types, "field_x", undefined)).toBe("string");
});

test("an emptied range keeps the row's number type and value", () => {
  const seen = rememberTypes(new Map(), [{ fieldId: "field_amount", versions: [1], type: "number" }]);
  // A comparison on 999999 matches nothing, so the next response names no field.
  const after = rememberTypes(seen, []);
  expect(valueTypeFor(after, "field_amount", 999999)).toBe("number");
});

test("a loaded comparison on a field no response named keeps its number type when its value clears", () => {
  const seeded = seedTypes("proc_1", [{ fieldId: "field_amount", operator: "eq", value: 7 }]);
  expect(valueTypeFor(typesFor(seeded, "proc_1"), "field_amount", 7)).toBe("number");
  // The owner clears the input or types `7a`: the value is undefined, and the control stays a number input.
  expect(valueTypeFor(typesFor(seeded, "proc_1"), "field_amount", undefined)).toBe("number");
});

test("seedTypes skips a value without a type, and the first comparison on a field wins", () => {
  const seeded = seedTypes("proc_1", [
    { fieldId: "field_a", operator: "eq", value: undefined },
    { fieldId: "field_b", operator: "eq", value: true },
    { fieldId: "field_b", operator: "eq", value: "x" },
  ]);
  expect(seeded.types.has("field_a")).toBe(false);
  expect(seeded.types.get("field_b")).toBe("boolean");
});

test("a column response overwrites a seeded type", () => {
  const seeded = seedTypes("proc_1", [{ fieldId: "field_amount", operator: "eq", value: 7 }]);
  const after = typesAfterResponse(seeded, "proc_1", [{ fieldId: "field_amount", versions: [1], type: "string" }]);
  expect(valueTypeFor(typesFor(after, "proc_1"), "field_amount", undefined)).toBe("string");
});

test("typesAfterResponse adds to the map of the same process", () => {
  const first = typesAfterResponse(undefined, "proc_1", [{ fieldId: "field_amount", versions: [1], type: "number" }]);
  const second = typesAfterResponse(first, "proc_1", [{ fieldId: "field_flag", versions: [1], type: "boolean" }]);
  expect(second.processId).toBe("proc_1");
  expect(second.types.get("field_amount")).toBe("number");
  expect(second.types.get("field_flag")).toBe("boolean");
});

test("a response for another process never writes into the current process's map", () => {
  const current = typesAfterResponse(undefined, "proc_2", [{ fieldId: "field_amount", versions: [1], type: "number" }]);
  const other = typesAfterResponse(current, "proc_1", [{ fieldId: "field_amount", versions: [1], type: "string" }]);
  // The proc_2 map stays as it was.
  expect(current.types.get("field_amount")).toBe("number");
  // A draw for proc_2 reads no proc_1 entry.
  expect(typesFor(other, "proc_2").size).toBe(0);
});

test("a process switch drops the old process's map", () => {
  const old = typesAfterResponse(undefined, "proc_1", [{ fieldId: "field_amount", versions: [1], type: "number" }]);
  const switched = typesAfterResponse(old, "proc_2", [{ fieldId: "field_flag", versions: [1], type: "boolean" }]);
  expect(switched.processId).toBe("proc_2");
  expect(switched.types.has("field_amount")).toBe(false);
  expect(switched.types.get("field_flag")).toBe("boolean");
  expect(typesFor(switched, "proc_1").size).toBe(0);
});

test("columnRequestKey ignores an incomplete row and changes on a complete one", () => {
  const draft = { ...emptyDraft("proc_1"), dataWhere: [AMOUNT] };
  const key = columnRequestKey(draft);
  const withIncomplete = { ...draft, dataWhere: [...draft.dataWhere, { fieldId: "field_amount", operator: "eq" as const, value: undefined }] };
  expect(columnRequestKey(withIncomplete)).toBe(key);
  const withComplete = { ...draft, dataWhere: [...draft.dataWhere, { fieldId: "field_amount", operator: "ne" as const, value: 7 }] };
  expect(columnRequestKey(withComplete)).not.toBe(key);
  expect(JSON.parse(columnRequestKey(withComplete))).toEqual(["proc_1", { dataWhere: [AMOUNT, { fieldId: "field_amount", operator: "ne", value: 7 }] }]);
});

test("columnRequestKey changes with the process", () => {
  expect(columnRequestKey(emptyDraft("proc_1"))).not.toBe(columnRequestKey(emptyDraft("proc_2")));
});

test("valueFromChoice writes a boolean for Yes and No, and nothing for the empty choice", () => {
  expect(valueFromChoice("true")).toBe(true);
  expect(valueFromChoice("false")).toBe(false);
  expect(valueFromChoice("")).toBeUndefined();
});

test("booleanChoice selects Yes or No for a boolean alone", () => {
  expect(booleanChoice(true)).toBe("true");
  expect(booleanChoice(false)).toBe("false");
  expect(booleanChoice(undefined)).toBe("");
  // A stored string "true" is not a boolean, so the empty choice shows.
  expect(booleanChoice("true")).toBe("");
});

test("switchComparisonField keeps the value when both fields take the same value type", () => {
  const types = rememberTypes(new Map(), [
    { fieldId: "field_amount", versions: [1], type: "number" },
    { fieldId: "field_total", versions: [1], type: "number" },
  ]);
  expect(switchComparisonField(AMOUNT, "field_total", types)).toEqual({ fieldId: "field_total", operator: "eq", value: 500 });
});

test("switchComparisonField clears the value for a field of another value type", () => {
  const types = rememberTypes(new Map(), [
    { fieldId: "field_amount", versions: [1], type: "number" },
    { fieldId: "field_flag", versions: [1], type: "boolean" },
  ]);
  expect(switchComparisonField(AMOUNT, "field_flag", types)).toEqual({ fieldId: "field_flag", operator: "eq", value: undefined });
});

test("switchComparisonOperator drops the value on a switch into or out of in, and keeps it between eq and ne", () => {
  expect(switchComparisonOperator(AMOUNT, "ne")).toEqual({ ...AMOUNT, operator: "ne" });
  expect(switchComparisonOperator(AMOUNT, "in")).toEqual({ ...AMOUNT, operator: "in", value: undefined });
  expect(switchComparisonOperator({ ...AMOUNT, operator: "in", value: [1] }, "eq")).toEqual({ ...AMOUNT, operator: "eq", value: undefined });
});

test("parseComparisonText writes a number, a string and a list by the field's value type", () => {
  expect(parseComparisonText("500", "number", "eq")).toEqual({ ok: true, value: 500 });
  expect(parseComparisonText("open", "string", "eq")).toEqual({ ok: true, value: "open" });
  expect(parseComparisonText("a,b", "string", "in")).toEqual({ ok: true, value: ["a", "b"] });
  expect(parseComparisonText("1, 2", "number", "in")).toEqual({ ok: true, value: [1, 2] });
  expect(parseComparisonText("a,", "string", "in")).toEqual({ ok: true, value: ["a"] });
  expect(parseComparisonText("abc", "number", "eq")).toEqual({ ok: false, reason: "not-number" });
});

test("reasonKey names a reason for unparsable text, and none for empty text", () => {
  expect(reasonKey("not-number")).toBe("builder.notNumber");
  expect(reasonKey("not-boolean")).toBe("builder.notBoolean");
  expect(reasonKey("empty")).toBeUndefined();
});

test("reconcileText keeps the typed text when the new value is what that text parses to", () => {
  // `a,` parses to ["a"], and the screen hands ["a"] back as the next prop.
  const typed: TextState = { text: "a,", seen: undefined };
  const next = reconcileText(typed, ["a"], "string", "in");
  expect(next).toEqual({ text: "a,", seen: ["a"] });
});

test("reconcileText adopts the new value's text when the typed text means something else", () => {
  const typed: TextState = { text: "abc", seen: undefined };
  // A field switch clears the value to undefined: `abc` already stands for undefined on a number field.
  expect(reconcileText(typed, undefined, "number", "eq")).toBe(typed);
  // A reloaded report sets 7.
  expect(reconcileText(typed, 7, "number", "eq")).toEqual({ text: "7", seen: 7 });
});

test("a stored wrong-type value settles after one draw", () => {
  // A saved report holds the string "500" on a number field.
  let state = initialTextState("500");
  expect(state).toEqual({ text: "500", seen: "500" });
  for (let draw = 0; draw < 3; draw++) {
    const next = reconcileText(state, "500", "number", "eq");
    expect(next).toBe(state);
    state = next;
  }
  // The same value arriving as a change also settles: one adoption, then quiet.
  const changed = reconcileText({ text: "abc", seen: undefined }, "500", "number", "eq");
  expect(changed).toEqual({ text: "500", seen: "500" });
  expect(reconcileText(changed, "500", "number", "eq")).toBe(changed);
});

test("syncRowIds mints one id per row on a count change, and leaves a matching list alone", () => {
  expect(syncRowIds(["a", "b"], 2)).toBeUndefined();
  const minted = syncRowIds([], 3)!;
  expect(minted).toHaveLength(3);
  expect(new Set(minted).size).toBe(3);
});

test("removing row 0 never hands its unparsed text to row 1", () => {
  const ids = syncRowIds([], 2)!;
  // Row 0 holds unparsed `abc` on a number field, row 1 is empty. Both hold value undefined.
  const texts = new Map<string, TextState>([
    [ids[0]!, { text: "abc", seen: undefined }],
    [ids[1]!, initialTextState(undefined)],
  ]);
  const remaining = withoutRowId(ids, 0);
  expect(remaining).toEqual([ids[1]!]);
  // The surviving row draws from its own state, keyed by its own id.
  const drawn = reconcileText(texts.get(remaining[0]!)!, undefined, "number", "eq");
  expect(drawn.text).toBe("");
  // An index key would hand row 0's state to the survivor: the value prop
  // stays undefined, so reconcileText keeps `abc` there. That is the defect ids prevent.
  expect(reconcileText(texts.get(ids[0]!)!, undefined, "number", "eq").text).toBe("abc");
});

test("column list edits: add, remove, and reorder", () => {
  let columns = addFieldColumn([], "field_a");
  columns = addFieldColumn(columns, "field_b");
  expect(columns).toEqual([{ type: "field", fieldId: "field_a" }, { type: "field", fieldId: "field_b" }]);

  columns = moveColumn(columns, 1, -1);
  expect(columns.map((c) => (c.type === "field" ? c.fieldId : ""))).toEqual(["field_b", "field_a"]);

  // Out-of-range moves are a no-op rather than throwing.
  expect(moveColumn(columns, 0, -1)).toEqual(columns);
  expect(moveColumn(columns, columns.length - 1, 1)).toEqual(columns);

  columns = removeColumn(columns, 0);
  expect(columns).toEqual([{ type: "field", fieldId: "field_a" }]);
});

test("merge column source edits: add and remove", () => {
  let columns = addMergeColumn([]);
  columns = addMergeSource(columns, 0, "field_a");
  columns = addMergeSource(columns, 0, "field_b");
  expect(columns).toEqual([{ type: "merge", fieldIds: ["field_a", "field_b"] }]);

  columns = removeMergeSource(columns, 0, 0);
  expect(columns).toEqual([{ type: "merge", fieldIds: ["field_b"] }]);
});

test("usedFieldIds covers both a direct column and every merge column's sources", () => {
  const columns = [{ type: "field" as const, fieldId: "field_a" }, { type: "merge" as const, fieldIds: ["field_b", "field_c"] }];
  expect(usedFieldIds(columns)).toEqual(new Set(["field_a", "field_b", "field_c"]));
});

test("isPartialCoverage flags a field an in-range version does not declare", () => {
  expect(isPartialCoverage({ fieldId: "field_a", versions: [1] }, [1, 2])).toBe(true);
  expect(isPartialCoverage({ fieldId: "field_a", versions: [1, 2] }, [1, 2])).toBe(false);
});

test("allVersionsInRange unions every offered field's own version tags", () => {
  expect(
    allVersionsInRange([
      { fieldId: "field_a", versions: [1] },
      { fieldId: "field_b", versions: [2, 3] },
    ]),
  ).toEqual([1, 2, 3]);
});

test("canRemovePrincipal blocks only the owner's own editors entry", () => {
  expect(canRemovePrincipal("editors", "user_owner", "user_owner")).toBe(false);
  expect(canRemovePrincipal("editors", "user_other", "user_owner")).toBe(true);
  // The owner can still be removed from viewers — the invariant is editors-only.
  expect(canRemovePrincipal("viewers", "user_owner", "user_owner")).toBe(true);
});

test("fieldCellDisplay renders the three empty states and a value as distinct kinds", () => {
  expect(fieldCellDisplay({ kind: "value", value: "hi" }, "en").kind).toBe("value");
  expect(fieldCellDisplay({ kind: "value", value: "hi" }, "en").text).toBe("hi");
  expect(fieldCellDisplay({ kind: "no-value" }, "en").kind).toBe("no-value");
  expect(fieldCellDisplay({ kind: "not-in-version" }, "en").kind).toBe("not-in-version");
  expect(fieldCellDisplay({ kind: "redacted" }, "en").kind).toBe("redacted");
  // Every kind is distinct — no two collapse onto the same rendered kind.
  const kinds = new Set(
    ([{ kind: "value", value: "x" }, { kind: "no-value" }, { kind: "not-in-version" }, { kind: "redacted" }] as const).map(
      (c) => fieldCellDisplay(c, "en").kind,
    ),
  );
  expect(kinds.size).toBe(4);
});

test("mergeCellDisplay carries the collision flag on a value, and renders redacted distinctly", () => {
  expect(mergeCellDisplay({ kind: "value", value: "a, b", collision: true }, "en")).toEqual({
    kind: "value",
    text: "a, b",
    srLabel: "",
    collision: true,
  });
  expect(mergeCellDisplay({ kind: "value", value: "a", collision: false }, "en").collision).toBe(false);
  expect(mergeCellDisplay({ kind: "redacted" }, "en").kind).toBe("redacted");
});

test("mergeCellDisplay renders no-value distinctly from a value of the empty string", () => {
  const display = mergeCellDisplay({ kind: "no-value" }, "en");
  expect(display.kind).toBe("no-value");
  expect(display.collision).toBe(false);
  expect(display.kind).not.toBe(mergeCellDisplay({ kind: "value", value: "", collision: false }, "en").kind);
});
