import { describe, it, expect } from "bun:test";
import {
  columnMappingRows,
  declaredColumns,
  mappableTargets,
  showsColumnMapping,
} from "../src/areas/studio/panels/columnMappingLogic.js";
import type { DraftField } from "../src/areas/studio/draft/fields.js";
import type { StudioDataList } from "../src/areas/studio/api/types.js";

const col = (key: string) => ({ key, label: key, type: "string" as const });

const LISTS: StudioDataList[] = [
  { listKey: "products", columns: [col("sku"), col("price")] },
  { listKey: "regions", columns: [col("iso")] },
];

const SOURCES = [
  { id: "ds_products", key: "products", type: "db.list", config: { listKey: "products" } },
  { id: "ds_regions", key: "regions", type: "db.list", config: { listKey: "regions" } },
  { id: "ds_other", key: "other", type: "some.other", config: {} },
];

const field = (over: Record<string, unknown> = {}): DraftField =>
  ({ id: "field_pick", key: "pick", type: "select", dataSource: "ds_products", ...over }) as DraftField;

describe("showsColumnMapping", () => {
  it("accepts a select field bound to a db.list source", () => {
    expect(showsColumnMapping(field(), SOURCES)).toBe(true);
  });

  it("refuses a multiselect: it picks several rows for one target", () => {
    expect(showsColumnMapping(field({ type: "multiselect" }), SOURCES)).toBe(false);
  });

  it("refuses a field carrying no dataSource", () => {
    expect(showsColumnMapping(field({ dataSource: undefined }), SOURCES)).toBe(false);
  });

  it("refuses a source that is not a db.list: no other type declares columns", () => {
    expect(showsColumnMapping(field({ dataSource: "ds_other" as DraftField["dataSource"] }), SOURCES)).toBe(false);
  });
});

describe("declaredColumns", () => {
  it("offers the bound list's own keys, and not another list's", () => {
    expect(declaredColumns(field(), SOURCES, LISTS)).toEqual(["sku", "price"]);
    expect(declaredColumns(field({ dataSource: "ds_regions" as DraftField["dataSource"] }), SOURCES, LISTS)).toEqual(["iso"]);
  });

  it("offers nothing while the lists have not arrived", () => {
    expect(declaredColumns(field(), SOURCES, undefined)).toEqual([]);
  });
});

describe("columnMappingRows", () => {
  it("returns one row per mapped key, carrying its target", () => {
    const rows = columnMappingRows(field({ columnMapping: { price: "field_amount" } }), SOURCES, LISTS);
    expect(rows).toEqual([{ column: "price", target: "field_amount", stale: false }]);
  });

  it("marks a key the list no longer declares, rather than dropping the row", () => {
    const rows = columnMappingRows(field({ columnMapping: { gone: "field_amount" } }), SOURCES, LISTS);
    expect(rows).toEqual([{ column: "gone", target: "field_amount", stale: true }]);
  });

  it("marks nothing while the lists have not arrived", () => {
    // The same rule `unknownListKeyWarning` takes beside it: a failed fetch
    // says nothing rather than marking every key.
    const rows = columnMappingRows(field({ columnMapping: { gone: "field_amount" } }), SOURCES, undefined);
    expect(rows[0]!.stale).toBe(false);
  });

  it("returns no row for a field carrying no mapping", () => {
    expect(columnMappingRows(field(), SOURCES, LISTS)).toEqual([]);
  });
});

describe("mappableTargets", () => {
  const catalog = [
    field(),
    { id: "field_amount", key: "amount", type: "number" } as DraftField,
    { id: "field_group", key: "group", type: "group", fields: [{ id: "field_leaf", key: "leaf", type: "string" }] } as DraftField,
  ];

  it("offers a nested leaf field, so a group's children stay reachable", () => {
    expect(mappableTargets(field(), catalog).map((f) => String(f.id))).toContain("field_leaf");
  });

  it("omits a group field, which takes no value", () => {
    expect(mappableTargets(field(), catalog).map((f) => String(f.id))).not.toContain("field_group");
  });

  it("omits the mapping field itself", () => {
    expect(mappableTargets(field(), catalog).map((f) => String(f.id))).not.toContain("field_pick");
  });
});
