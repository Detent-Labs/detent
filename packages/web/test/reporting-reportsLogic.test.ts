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
} from "../src/areas/reporting/screens/reportsLogic.js";
import type { Report } from "../src/areas/reporting/api/types.js";

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
