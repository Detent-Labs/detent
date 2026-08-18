/**
 * `openspec/changes/table-shaped-data-sources`: a data list's declared columns,
 * the per-value attributes they name, and how the `"db.list"` handler carries
 * both onto a resolved option. DB-backed; skips when DATABASE_URL is unset.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema } from "../src/engine/store.js";
import {
  attributeMatchesColumn,
  createDefaultDataSourceRegistry,
  dataListColumns,
  DB_LIST_DATA_SOURCE_TYPE,
  MAX_DATA_LIST_COLUMNS,
  parseJsonb,
  type DataListColumn,
} from "../src/engine/host.js";

const DB = !!process.env.DATABASE_URL;

const handler = () => createDefaultDataSourceRegistry().get(DB_LIST_DATA_SOURCE_TYPE)!;

async function seedList(
  listKey: string,
  columns: DataListColumn[],
  values: { value: string; label: string; attributes?: Record<string, unknown>; active?: boolean; sortOrder?: number }[],
): Promise<void> {
  await sql`INSERT INTO data_lists (list_key, label, columns, updated_by)
    VALUES (${listKey}, ${listKey}, ${JSON.stringify(columns)}::jsonb, ${"tester"})`;
  for (const v of values) {
    await sql`INSERT INTO data_list_values (list_key, value, label, attributes, active, sort_order, updated_by)
      VALUES (${listKey}, ${v.value}, ${{ en: v.label }}, ${JSON.stringify(v.attributes ?? {})}::jsonb,
              ${v.active ?? true}, ${v.sortOrder ?? 0}, ${"tester"})`;
  }
}

const resolve = (listKey: string, heldValues?: string[]) =>
  handler().resolve({ config: { listKey }, db: sql, heldValues });

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE data_list_values, data_lists`;
});

// ---- The declaration schema, no database needed ----

test("a column declaration takes a slug key, a heading and a scalar type", () => {
  expect(dataListColumns.safeParse([{ key: "unit_price", label: "Unit price", type: "number" }]).success).toBe(true);
});

test("a column key outside the slug grammar is rejected", () => {
  expect(dataListColumns.safeParse([{ key: "Unit Price", label: "x", type: "string" }]).success).toBe(false);
  expect(dataListColumns.safeParse([{ key: "1st", label: "x", type: "string" }]).success).toBe(false);
});

test("an unknown column type is rejected", () => {
  expect(dataListColumns.safeParse([{ key: "k", label: "x", type: "date" }]).success).toBe(false);
});

test("a duplicate column key is rejected", () => {
  const dupe = [
    { key: "sku", label: "SKU", type: "string" },
    { key: "sku", label: "Code", type: "string" },
  ];
  expect(dataListColumns.safeParse(dupe).success).toBe(false);
});

test("a declaration over the bound is rejected", () => {
  const over = Array.from({ length: MAX_DATA_LIST_COLUMNS + 1 }, (_, i) => ({ key: `c${i}`, label: `C${i}`, type: "string" }));
  expect(dataListColumns.safeParse(over).success).toBe(false);
  expect(dataListColumns.safeParse(over.slice(0, MAX_DATA_LIST_COLUMNS)).success).toBe(true);
});

test("attributeMatchesColumn holds each declared type to its own JS type", () => {
  const number: DataListColumn = { key: "price", label: "Price", type: "number" };
  expect(attributeMatchesColumn(number, 12.5)).toBe(true);
  expect(attributeMatchesColumn(number, "12.5")).toBe(false);
  const bool: DataListColumn = { key: "bulk", label: "Bulk", type: "boolean" };
  expect(attributeMatchesColumn(bool, true)).toBe(true);
  expect(attributeMatchesColumn(bool, "true")).toBe(false);
});

// ---- The handler ----

test.skipIf(!DB)("a resolved option carries the attributes its row fills", async () => {
  await seedList(
    "products",
    [
      { key: "sku", label: "SKU", type: "string" },
      { key: "price", label: "Price", type: "number" },
    ],
    [{ value: "widget", label: "Widget", attributes: { sku: "A-1140", price: 12.5 } }],
  );
  const options = await resolve("products");
  expect(options).toEqual([{ value: "widget", label: { en: "Widget" }, attributes: { sku: "A-1140", price: 12.5 } }]);
});

test.skipIf(!DB)("an unfilled column produces no entry", async () => {
  await seedList(
    "products",
    [
      { key: "sku", label: "SKU", type: "string" },
      { key: "price", label: "Price", type: "number" },
    ],
    [{ value: "widget", label: "Widget", attributes: { sku: "A-1140" } }],
  );
  const options = await resolve("products");
  expect(options[0]!.attributes).toEqual({ sku: "A-1140" });
  expect("price" in options[0]!.attributes!).toBe(false);
});

test.skipIf(!DB)("a list declaring no columns resolves exactly as before", async () => {
  await seedList("plain", [], [{ value: "a", label: "A" }]);
  const options = await resolve("plain");
  // Absent, not an empty map: the renderer branches on the key's presence.
  expect(options).toEqual([{ value: "a", label: { en: "A" } }]);
});

test.skipIf(!DB)("a value that fills nothing carries no attributes key", async () => {
  await seedList("products", [{ key: "sku", label: "SKU", type: "string" }], [{ value: "widget", label: "Widget" }]);
  expect(await resolve("products")).toEqual([{ value: "widget", label: { en: "Widget" } }]);
});

test.skipIf(!DB)("the declared column order beats the order jsonb stores", async () => {
  // Postgres orders a jsonb object's keys by length, then bytewise, so it
  // stores `a` before `zzzzzzzz`. The declaration says the opposite, and the
  // declaration is what the renderer walks.
  await seedList(
    "products",
    [
      { key: "zzzzzzzz", label: "Long", type: "string" },
      { key: "a", label: "Short", type: "string" },
    ],
    [{ value: "widget", label: "Widget", attributes: { a: "1", zzzzzzzz: "2" } }],
  );
  const stored = (await sql`SELECT attributes FROM data_list_values WHERE value = ${"widget"}`) as { attributes: unknown }[];
  // Postgres orders a jsonb object's keys by length, then bytewise.
  expect(Object.keys(parseJsonb(stored[0]!.attributes) as Record<string, string>)).toEqual(["a", "zzzzzzzz"]);
  const options = await resolve("products");
  expect(Object.keys(options[0]!.attributes!)).toEqual(["zzzzzzzz", "a"]);
});

test.skipIf(!DB)("a retired value a holder names comes back with its attributes", async () => {
  await seedList(
    "products",
    [{ key: "sku", label: "SKU", type: "string" }],
    [{ value: "old", label: "Old", attributes: { sku: "A-0001" }, active: false }],
  );
  expect(await resolve("products", ["old"])).toEqual([{ value: "old", label: { en: "Old" }, attributes: { sku: "A-0001" } }]);
  // Without the hold it stays out, attributes and all.
  expect(await resolve("products")).toEqual([]);
});

test.skipIf(!DB)("a stored attribute whose type no longer matches its column is left out", async () => {
  // An operator can retype a column under values that already exist. The read
  // drops the mismatch rather than handing the write-back a value it would
  // have to drop again.
  await seedList("products", [{ key: "price", label: "Price", type: "number" }], [{ value: "widget", label: "Widget", attributes: { price: "cheap" } }]);
  expect(await resolve("products")).toEqual([{ value: "widget", label: { en: "Widget" } }]);
});
