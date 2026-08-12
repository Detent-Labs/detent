/**
 * `openspec/changes/add-db-data-lists`: the two data list relations and the
 * built-in `"db.list"` data source handler that reads them. DB-backed; skips
 * when DATABASE_URL is unset.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema } from "../src/engine/store.js";
import { createDefaultDataSourceRegistry, MAX_DATA_LIST_VALUES, DB_LIST_DATA_SOURCE_TYPE } from "../src/engine/host.js";
import { resolveDataSource } from "../src/engine/registry.js";

const DB = !!process.env.DATABASE_URL;

const handler = () => resolveDataSource(createDefaultDataSourceRegistry(), DB_LIST_DATA_SOURCE_TYPE)!;

async function seedList(listKey: string, values: { value: string; label: string; active?: boolean; sortOrder?: number }[]): Promise<void> {
  await sql`INSERT INTO data_lists (list_key, label, updated_by) VALUES (${listKey}, ${listKey}, ${"tester"})`;
  for (const v of values) {
    await sql`INSERT INTO data_list_values (list_key, value, label, active, sort_order, updated_by)
      VALUES (${listKey}, ${v.value}, ${{ en: v.label }}, ${v.active ?? true}, ${v.sortOrder ?? 0}, ${"tester"})`;
  }
}

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE data_list_values, data_lists`;
});

test.skipIf(!DB)("initSchema creates both data list relations, and a second run raises nothing", async () => {
  await initSchema();
  const rows = (await sql`SELECT tablename FROM pg_tables WHERE tablename IN ('data_lists', 'data_list_values')`) as { tablename: string }[];
  expect(rows.map((r) => r.tablename).sort()).toEqual(["data_list_values", "data_lists"]);
});

test.skipIf(!DB)("deleting a data_lists row takes its values with it", async () => {
  await seedList("cost_centres", [{ value: "cc1", label: "One" }]);
  await sql`DELETE FROM data_lists WHERE list_key = ${"cost_centres"}`;
  const rows = (await sql`SELECT 1 FROM data_list_values WHERE list_key = ${"cost_centres"}`) as unknown[];
  expect(rows).toHaveLength(0);
});

test.skipIf(!DB)("one value per key per list", async () => {
  await seedList("cost_centres", [{ value: "cc1", label: "One" }]);
  let raised: unknown;
  try {
    await sql`INSERT INTO data_list_values (list_key, value, label, updated_by)
      VALUES (${"cost_centres"}, ${"cc1"}, ${{ en: "Again" }}, ${"tester"})`;
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(Error);
});

test.skipIf(!DB)("an existing list with no values resolves to an empty option list", async () => {
  await seedList("empty", []);
  expect(await handler().resolve({ config: { listKey: "empty" } , db: sql })).toEqual([]);
});

test.skipIf(!DB)("an active value resolves to an option, an inactive value nobody holds stays out", async () => {
  await seedList("cost_centres", [
    { value: "cc1", label: "One" },
    { value: "cc2", label: "Two", active: false },
  ]);
  expect(await handler().resolve({ config: { listKey: "cost_centres" } , db: sql })).toEqual([{ value: "cc1", label: { en: "One" } }]);
});

test.skipIf(!DB)("an inactive value heldValues names comes back with its label", async () => {
  await seedList("cost_centres", [
    { value: "cc1", label: "One" },
    { value: "cc2", label: "Two", active: false },
  ]);
  const options = await handler().resolve({ config: { listKey: "cost_centres" }, heldValues: ["cc2"] , db: sql });
  expect(options).toEqual([
    { value: "cc1", label: { en: "One" } },
    { value: "cc2", label: { en: "Two" } },
  ]);
});

test.skipIf(!DB)("options come back ordered by sort_order, then value", async () => {
  await seedList("ordered", [
    { value: "b", label: "B", sortOrder: 1 },
    { value: "a", label: "A", sortOrder: 2 },
    { value: "c", label: "C", sortOrder: 1 },
  ]);
  const options = await handler().resolve({ config: { listKey: "ordered" } , db: sql });
  expect(options.map((o) => o.value)).toEqual(["b", "c", "a"]);
});

test.skipIf(!DB)("a list over the bound raises rather than truncating, naming the listKey", async () => {
  await sql`INSERT INTO data_lists (list_key, label, updated_by) VALUES (${"big"}, ${"Big"}, ${"tester"})`;
  const values = Array.from({ length: MAX_DATA_LIST_VALUES + 1 }, (_, i) => `v${i}`);
  await sql`INSERT INTO data_list_values (list_key, value, label, updated_by)
    SELECT ${"big"}, v, ${{ en: "x" }}, ${"tester"} FROM unnest(${sql.array(values, "TEXT")}) AS v`;
  let raised: unknown;
  try {
    await handler().resolve({ config: { listKey: "big" } , db: sql });
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(Error);
  expect((raised as Error).message).toContain("big");
});

test.skipIf(!DB)("a list sitting exactly on the bound still resolves for a holder of a retired value", async () => {
  // The bound counts offered values. A holder adds a row on top of it, and
  // that must not turn the list the holder depends on into a raise.
  await sql`INSERT INTO data_lists (list_key, label, updated_by) VALUES (${"full"}, ${"Full"}, ${"tester"})`;
  const active = Array.from({ length: MAX_DATA_LIST_VALUES }, (_, i) => `a${i}`);
  await sql`INSERT INTO data_list_values (list_key, value, label, updated_by)
    SELECT ${"full"}, v, ${{ en: "x" }}, ${"tester"} FROM unnest(${sql.array(active, "TEXT")}) AS v`;
  await sql`INSERT INTO data_list_values (list_key, value, label, active, updated_by)
    VALUES (${"full"}, ${"retired_held"}, ${{ en: "Old" }}, false, ${"tester"})`;

  expect(await handler().resolve({ config: { listKey: "full" } , db: sql })).toHaveLength(MAX_DATA_LIST_VALUES);
  const forHolder = await handler().resolve({ config: { listKey: "full" }, heldValues: ["retired_held"] , db: sql });
  expect(forHolder).toHaveLength(MAX_DATA_LIST_VALUES + 1);
  expect(forHolder).toContainEqual({ value: "retired_held", label: { en: "Old" } });
});

test.skipIf(!DB)("a list one active value over the bound still raises, even for a holder", async () => {
  await sql`INSERT INTO data_lists (list_key, label, updated_by) VALUES (${"over"}, ${"Over"}, ${"tester"})`;
  const active = Array.from({ length: MAX_DATA_LIST_VALUES + 1 }, (_, i) => `a${i}`);
  await sql`INSERT INTO data_list_values (list_key, value, label, updated_by)
    SELECT ${"over"}, v, ${{ en: "x" }}, ${"tester"} FROM unnest(${sql.array(active, "TEXT")}) AS v`;
  await sql`INSERT INTO data_list_values (list_key, value, label, active, updated_by)
    VALUES (${"over"}, ${"retired_held"}, ${{ en: "Old" }}, false, ${"tester"})`;

  let raised: unknown;
  try {
    await handler().resolve({ config: { listKey: "over" }, heldValues: ["retired_held"] , db: sql });
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(Error);
  expect((raised as Error).message).toContain("over");
});

test.skipIf(!DB)("an unknown listKey raises a plain canary Error naming the key", async () => {
  let raised: unknown;
  try {
    await handler().resolve({ config: { listKey: "no_such_list" } , db: sql });
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(Error);
  expect((raised as Error).message).toContain("no_such_list");
});

test.skipIf(!DB)("the static handler ignores heldValues", async () => {
  const options = [{ value: "us", label: { en: "United States" } }];
  const staticDef = resolveDataSource(createDefaultDataSourceRegistry(), "static")!;
  expect(await staticDef.resolve({ config: { options }, heldValues: ["ca"] , db: sql })).toEqual(options);
});
