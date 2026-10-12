/**
 * `reportResultToCsv` (src/runtime/api.ts): pure, no DB. Covers the
 * three-way empty-cell marker text, a merge cell, CSV escaping and the
 * merge-column header format — see csv-download-report-table's design.md.
 */
import { test, expect } from "bun:test";
import { reportResultToCsv, type ReportExecutionResult } from "../src/runtime/api.js";
import type { FieldId, InstanceId } from "../src/schema/definition.js";

test("a plain value cell prints its value", () => {
  const result: ReportExecutionResult = {
    columns: [{ type: "field", fieldId: "amount" as FieldId }],
    rows: [{ instanceId: "inst_1" as InstanceId, cells: [{ kind: "value", value: 42 }] }],
    truncated: false,
  };
  expect(reportResultToCsv(result)).toBe("amount\r\n42\r\n");
});

test("a stored null value prints as an empty cell, distinct from no-value", () => {
  const result: ReportExecutionResult = {
    columns: [{ type: "field", fieldId: "note" as FieldId }],
    rows: [{ instanceId: "inst_1" as InstanceId, cells: [{ kind: "value", value: null }] }],
    truncated: false,
  };
  expect(reportResultToCsv(result)).toBe("note\r\n\r\n");
});

test("the three empty-cell kinds each get their own marker text", () => {
  const result: ReportExecutionResult = {
    columns: [
      { type: "field", fieldId: "no_value_field" as FieldId },
      { type: "field", fieldId: "not_in_version_field" as FieldId },
      { type: "field", fieldId: "redacted_field" as FieldId },
    ],
    rows: [
      {
        instanceId: "inst_1" as InstanceId,
        cells: [{ kind: "no-value" }, { kind: "not-in-version" }, { kind: "redacted" }],
      },
    ],
    truncated: false,
  };
  const [, dataLine] = reportResultToCsv(result).split("\r\n");
  const cells = dataLine!.split(",");
  expect(cells).toEqual(["(no value)", "(not in this version)", "(redacted)"]);
  expect(new Set(cells).size).toBe(3);
});

test("a merge column exports its joined value, no-value or redacted cell", () => {
  const result: ReportExecutionResult = {
    columns: [{ type: "merge", fieldIds: ["first_name" as FieldId, "legal_name" as FieldId], collisions: 0 }],
    rows: [
      { instanceId: "inst_1" as InstanceId, cells: [{ kind: "value", value: "Ada", collision: false }] },
      { instanceId: "inst_2" as InstanceId, cells: [{ kind: "no-value" }] },
      { instanceId: "inst_3" as InstanceId, cells: [{ kind: "redacted" }] },
    ],
    truncated: false,
  };
  const lines = reportResultToCsv(result).split("\r\n");
  expect(lines[0]).toBe('"merge(first_name,legal_name)"');
  expect(lines[1]).toBe("Ada");
  expect(lines[2]).toBe("(no value)");
  expect(lines[3]).toBe("(redacted)");
});

test("a value carrying a comma, a quote or a newline is quoted per RFC 4180", () => {
  const result: ReportExecutionResult = {
    columns: [{ type: "field", fieldId: "name" as FieldId }],
    rows: [
      { instanceId: "inst_1" as InstanceId, cells: [{ kind: "value", value: "Smith, John" }] },
      { instanceId: "inst_2" as InstanceId, cells: [{ kind: "value", value: 'He said "hi"' }] },
      { instanceId: "inst_3" as InstanceId, cells: [{ kind: "value", value: "line1\nline2" }] },
    ],
    truncated: false,
  };
  const lines = reportResultToCsv(result).split("\r\n");
  expect(lines[1]).toBe('"Smith, John"');
  expect(lines[2]).toBe('"He said ""hi"""');
  expect(lines[3]).toBe('"line1\nline2"');
});

test("a string value starting with a formula character gets one leading apostrophe", () => {
  const starts = ["=1+1", "+1", "-x", "@x", "\tx", "\rx"];
  const result: ReportExecutionResult = {
    columns: [{ type: "field", fieldId: "name" as FieldId }],
    rows: starts.map((value, i) => ({ instanceId: `inst_${i}` as InstanceId, cells: [{ kind: "value", value }] })),
    truncated: false,
  };
  const csv = reportResultToCsv(result);
  expect(csv).toBe("name\r\n'=1+1\r\n'+1\r\n'-x\r\n'@x\r\n'\tx\r\n\"'\rx\"\r\n");
});

test("a number, a boolean and a plain string keep their text", () => {
  const result: ReportExecutionResult = {
    columns: [{ type: "field", fieldId: "v" as FieldId }],
    rows: [
      { instanceId: "inst_1" as InstanceId, cells: [{ kind: "value", value: -5 }] },
      { instanceId: "inst_2" as InstanceId, cells: [{ kind: "value", value: true }] },
      { instanceId: "inst_3" as InstanceId, cells: [{ kind: "value", value: "a=b" }] },
    ],
    truncated: false,
  };
  expect(reportResultToCsv(result)).toBe("v\r\n-5\r\ntrue\r\na=b\r\n");
});

test("a merge cell holding a formula-like string gets the prefix", () => {
  const result: ReportExecutionResult = {
    columns: [{ type: "merge", fieldIds: ["a" as FieldId, "b" as FieldId], collisions: 0 }],
    rows: [{ instanceId: "inst_1" as InstanceId, cells: [{ kind: "value", value: "-5", collision: false }] }],
    truncated: false,
  };
  expect(reportResultToCsv(result).split("\r\n")[1]).toBe("'-5");
});

test("the three empty-cell markers carry no prefix", () => {
  const result: ReportExecutionResult = {
    columns: [{ type: "field", fieldId: "a" as FieldId }, { type: "field", fieldId: "b" as FieldId }, { type: "field", fieldId: "c" as FieldId }],
    rows: [{ instanceId: "inst_1" as InstanceId, cells: [{ kind: "no-value" }, { kind: "not-in-version" }, { kind: "redacted" }] }],
    truncated: false,
  };
  expect(reportResultToCsv(result)).toBe("a,b,c\r\n(no value),(not in this version),(redacted)\r\n");
});

test("a list value exports as text and gets the prefix when its first item starts a formula", () => {
  const result: ReportExecutionResult = {
    columns: [{ type: "field", fieldId: "tags" as FieldId }],
    rows: [
      { instanceId: "inst_1" as InstanceId, cells: [{ kind: "value", value: ["=1+1", "x"] }] },
      { instanceId: "inst_2" as InstanceId, cells: [{ kind: "value", value: ["safe", "=1+1"] }] },
      { instanceId: "inst_3" as InstanceId, cells: [{ kind: "value", value: ["=1+1"] }] },
    ],
    truncated: false,
  };
  const lines = reportResultToCsv(result).split("\r\n");
  expect(lines[1]).toBe(`"'=1+1,x"`);
  expect(lines[2]).toBe(`"safe,=1+1"`);
  expect(lines[3]).toBe("'=1+1");
});

test("a number and a boolean stay raw even when their text starts with a formula character", () => {
  const result: ReportExecutionResult = {
    columns: [{ type: "field", fieldId: "v" as FieldId }],
    rows: [
      { instanceId: "inst_1" as InstanceId, cells: [{ kind: "value", value: -5 }] },
      { instanceId: "inst_2" as InstanceId, cells: [{ kind: "value", value: false }] },
    ],
    truncated: false,
  };
  expect(reportResultToCsv(result)).toBe("v\r\n-5\r\nfalse\r\n");
});

test("a truncated result ends with the marker line, padded to the column count", () => {
  const result: ReportExecutionResult = {
    columns: [{ type: "field", fieldId: "a" as FieldId }, { type: "field", fieldId: "b" as FieldId }, { type: "field", fieldId: "c" as FieldId }],
    rows: [{ instanceId: "inst_1" as InstanceId, cells: [{ kind: "value", value: 1 }, { kind: "value", value: 2 }, { kind: "value", value: 3 }] }],
    truncated: true,
  };
  expect(reportResultToCsv(result)).toBe("a,b,c\r\n1,2,3\r\n(truncated: first 1000 rows only),,\r\n");
});

test("a truncated result with one column ends with the bare marker line", () => {
  const result: ReportExecutionResult = {
    columns: [{ type: "field", fieldId: "a" as FieldId }],
    rows: [],
    truncated: true,
  };
  expect(reportResultToCsv(result)).toBe("a\r\n(truncated: first 1000 rows only)\r\n");
});

test("a complete result has no marker line", () => {
  const result: ReportExecutionResult = {
    columns: [{ type: "field", fieldId: "a" as FieldId }],
    rows: [{ instanceId: "inst_1" as InstanceId, cells: [{ kind: "value", value: 1 }] }],
    truncated: false,
  };
  expect(reportResultToCsv(result)).not.toContain("truncated");
});
