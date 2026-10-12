import { describe, expect, it } from "bun:test";
import {
  attributeRecord,
  attributesToCommit,
  duplicateRowIds,
  recordFromRows,
  reseedRows,
  rowsFromRecord,
  sameRecord,
  type AttributeRow,
} from "../src/areas/studio/panels/shared/attributeRows.js";

/** `studio-plugin-config-form`: attribute rows keep their identity while the developer types a key (design.md decision 4). */

const row = (rowId: string, key: string, fieldId: string): AttributeRow => ({ rowId, key, fieldId });

describe("recordFromRows", () => {
  it("keeps rows with a non-empty key, in row order", () => {
    expect(recordFromRows([row("r1", "cost_center", "field_a"), row("r2", "region", "field_b")])).toEqual({
      cost_center: "field_a",
      region: "field_b",
    });
  });

  it("skips a row with an empty key", () => {
    expect(recordFromRows([row("r1", "", "field_a"), row("r2", "region", "field_b")])).toEqual({ region: "field_b" });
  });

  it("lets the first row win a duplicate key", () => {
    expect(recordFromRows([row("r1", "region", "field_a"), row("r2", "region", "field_b")])).toEqual({ region: "field_a" });
  });
});

describe("duplicateRowIds", () => {
  it("names every later row that repeats an earlier key, and never the first", () => {
    const rows = [row("r1", "region", "field_a"), row("r2", "region", "field_b"), row("r3", "cost", "field_c"), row("r4", "region", "")];
    expect([...duplicateRowIds(rows)]).toEqual(["r2", "r4"]);
  });

  it("never names an empty key", () => {
    expect(duplicateRowIds([row("r1", "", "field_a"), row("r2", "", "field_b")]).size).toBe(0);
  });
});

describe("attributeRecord", () => {
  it("reads only string values under a non-empty key", () => {
    expect(attributeRecord({ "": "field_x", region: "field_a", bad: 5 })).toEqual({ region: "field_a" });
    expect(attributeRecord(undefined)).toEqual({});
    expect(attributeRecord(["field_a"])).toEqual({});
  });
});

describe("sameRecord", () => {
  it("ignores key order", () => {
    expect(sameRecord({ a: "x", "1": "y" }, { "1": "y", a: "x" })).toBe(true);
    expect(sameRecord({ a: "x" }, { a: "y" })).toBe(false);
    expect(sameRecord({ a: "x" }, { a: "x", b: "y" })).toBe(false);
  });
});

describe("reseedRows", () => {
  it("keeps local rows while their record matches the config", () => {
    const rows = [row("r1", "region", "field_a"), row("r2", "", ""), row("r3", "region", "field_b")];
    expect(reseedRows(rows, { region: "field_a" })).toBeUndefined();
  });

  it("reseeds from the config when a raw JSON change replaced the attributes", () => {
    const rows = [row("r1", "region", "field_a"), row("r2", "", "")];
    const next = reseedRows(rows, { cost_center: "field_c", region: "field_a" });
    expect(next?.map(({ key, fieldId }) => ({ key, fieldId }))).toEqual([
      { key: "cost_center", fieldId: "field_c" },
      { key: "region", fieldId: "field_a" },
    ]);
  });

  it("reaches a fixed point on a config the rows cannot hold, so a render-time reseed never loops", () => {
    const config = { "": "field_x", region: "field_a", bad: 5 };
    const first = reseedRows([], config);
    expect(first?.map((r) => r.key)).toEqual(["region"]);
    expect(reseedRows(first!, config)).toBeUndefined();
  });

  it("mints a distinct row id per row", () => {
    const rows = rowsFromRecord({ a: "field_a", b: "field_b" });
    expect(new Set(rows.map((r) => r.rowId)).size).toBe(2);
  });
});

describe("attributesToCommit", () => {
  it("commits nothing when the add control appends a row while a key is empty", () => {
    const config = { region: "field_a" };
    const rows = [row("r1", "region", "field_a"), row("r2", "", "")];
    expect(attributesToCommit([...rows, row("r3", "", "")], config)).toBeUndefined();
  });

  it("commits the record once a typed key changes it", () => {
    const rows = [row("r1", "region", "field_a"), row("r2", "cost_center", "field_b")];
    expect(attributesToCommit(rows, { region: "field_a" })).toEqual({ region: "field_a", cost_center: "field_b" });
  });

  it("commits nothing when a duplicate key repeats an earlier row", () => {
    const rows = [row("r1", "region", "field_a"), row("r2", "region", "field_b")];
    expect(attributesToCommit(rows, { region: "field_a" })).toBeUndefined();
  });
});
