/**
 * `openspec/changes/add-db-data-lists`: the six `/admin/data-lists*` routes.
 * The write rules (omission deactivates, a returning value reactivates, no row
 * ever disappears), the delete guard in both directions, and the role gate on
 * every route. DB-backed — skips when DATABASE_URL is unset.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema } from "../src/engine/store.js";
import { createRegistry } from "../src/engine/registry.js";
import { createDefaultDataSourceRegistry, DB_LIST_DATA_SOURCE_TYPE, MAX_DATA_LIST_VALUES } from "../src/engine/host.js";
import { createServer } from "../src/http/server.js";
import { devHeaderResolver } from "../src/auth/resolve.js";
import { ADMIN_ROLE, DATALISTS_ROLE, DEVELOPER_ROLE, AUTHOR_ROLE } from "../src/auth/authorize.js";
import { publishBody } from "../src/engine/definitions.js";
import type { Actor } from "../src/cel/eval.js";
import type { ProcessBody, ProcessId } from "../src/schema/definition.js";

const DB = !!process.env.DATABASE_URL;
const reg = createRegistry();
const dataSourceReg = createDefaultDataSourceRegistry();
const fetch = createServer(dataSourceReg, reg, sql, devHeaderResolver);

const maintainer: Actor = { id: "user_maintainer", roles: [DATALISTS_ROLE] };
const developer: Actor = { id: "user_developer", roles: [DEVELOPER_ROLE] };
const admin: Actor = { id: "user_admin", roles: [ADMIN_ROLE] };
const bystander: Actor = { id: "user_bystander", roles: [] };
const author: Actor = { id: "user_author", roles: [AUTHOR_ROLE] };

const BASE = "http://localhost/admin/data-lists";

function req(url: string, method: string, actor: Actor, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: {
      "X-Actor-Id": actor.id,
      ...(actor.roles.length > 0 ? { "X-Actor-Roles": actor.roles.join(",") } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const createList = (key: string, actor: Actor = maintainer) => fetch(req(BASE, "POST", actor, { listKey: key, label: key }));
const putValues = (key: string, values: unknown[], actor: Actor = maintainer) =>
  fetch(req(`${BASE}/${key}/values`, "PUT", actor, { values }));
const v = (value: string, label = value) => ({ value, label: { en: label } });

const bodyWithList = (listKey: string): ProcessBody =>
  ({
    key: "uses_list",
    label: { en: "Uses List" },
    baseLocale: "en",
    fields: [],
    dataSources: [{ id: "ds_a", key: "a", type: DB_LIST_DATA_SOURCE_TYPE, config: { listKey } }],
    workflow: { initialStep: "step_a", steps: [{ id: "step_a", key: "a", label: { en: "A" }, type: "task", terminal: true }] },
  }) as unknown as ProcessBody;

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE outbox, instances, definitions, data_list_values, data_lists`;
});

test.skipIf(!DB)("the overview lists every data list, the detail route reports inactive values", async () => {
  await createList("cost_centres");
  await putValues("cost_centres", [v("cc1", "One"), v("cc2", "Two")]);
  await putValues("cost_centres", [v("cc1", "One")]);

  const overview = (await (await fetch(req(BASE, "GET", maintainer))).json()) as { items: { listKey: string; activeValueCount: number }[] };
  expect(overview.items).toHaveLength(1);
  expect(overview.items[0]).toMatchObject({ listKey: "cost_centres", activeValueCount: 1 });

  const detail = (await (await fetch(req(`${BASE}/cost_centres`, "GET", maintainer))).json()) as {
    values: { value: string; active: boolean; attributes: Record<string, unknown> }[];
  };
  // `attributes` is empty on a list that declares no columns, and the route
  // returns the key rather than omitting it — one shape for every list.
  expect(detail.values).toEqual([
    { value: "cc1", label: { en: "One" }, attributes: {}, active: true, sortOrder: 0 },
    { value: "cc2", label: { en: "Two" }, attributes: {}, active: false, sortOrder: 1 },
  ] as unknown as typeof detail.values);
});

test.skipIf(!DB)("an omitted value becomes inactive, a returning value becomes active, and no row disappears", async () => {
  await createList("cost_centres");
  await putValues("cost_centres", [v("cc1"), v("cc2")]);
  await putValues("cost_centres", [v("cc1")]);

  let rows = (await sql`SELECT value, active FROM data_list_values WHERE list_key = ${"cost_centres"} ORDER BY value`) as {
    value: string;
    active: boolean;
  }[];
  expect(rows).toEqual([
    { value: "cc1", active: true },
    { value: "cc2", active: false },
  ]);

  await putValues("cost_centres", [v("cc1"), v("cc2")]);
  rows = (await sql`SELECT value, active FROM data_list_values WHERE list_key = ${"cost_centres"} ORDER BY value`) as typeof rows;
  expect(rows).toEqual([
    { value: "cc1", active: true },
    { value: "cc2", active: true },
  ]);
});

test.skipIf(!DB)("the values route refuses a set over the bound and writes nothing", async () => {
  await createList("big");
  await putValues("big", [v("keep")]);
  const tooMany = Array.from({ length: MAX_DATA_LIST_VALUES + 1 }, (_, i) => v(`x${i}`));
  const res = await putValues("big", tooMany);
  expect(res.status).toBe(400);
  const rows = (await sql`SELECT value FROM data_list_values WHERE list_key = ${"big"}`) as { value: string }[];
  expect(rows).toEqual([{ value: "keep" }]);
});

test.skipIf(!DB)("the values route refuses a duplicate value and writes nothing", async () => {
  await createList("dupes");
  await putValues("dupes", [v("keep")]);
  const res = await putValues("dupes", [v("a"), v("a")]);
  expect(res.status).toBe(400);
  const rows = (await sql`SELECT value, active FROM data_list_values WHERE list_key = ${"dupes"}`) as { value: string; active: boolean }[];
  expect(rows).toEqual([{ value: "keep", active: true }]);
});

test.skipIf(!DB)("a referenced list survives a delete, an unreferenced one goes away with its values", async () => {
  await createList("referenced");
  await putValues("referenced", [v("cc1")]);
  await publishBody("proc_uses_list" as ProcessId, bodyWithList("referenced"), reg, dataSourceReg);

  const refused = await fetch(req(`${BASE}/referenced`, "DELETE", maintainer));
  expect(refused.status).toBe(409);
  expect(await readList("referenced")).toBe(1);

  await createList("unreferenced");
  await putValues("unreferenced", [v("cc1")]);
  const deleted = await fetch(req(`${BASE}/unreferenced`, "DELETE", maintainer));
  expect(deleted.status).toBe(200);
  expect(await readList("unreferenced")).toBe(0);
  const values = (await sql`SELECT 1 FROM data_list_values WHERE list_key = ${"unreferenced"}`) as unknown[];
  expect(values).toHaveLength(0);
});

async function readList(listKey: string): Promise<number> {
  const rows = (await sql`SELECT count(*)::int AS n FROM data_lists WHERE list_key = ${listKey}`) as { n: number }[];
  return rows[0]!.n;
}

type Usage = { processId: string; version: number; columns: string[] };

const usedBy = async (listKey: string): Promise<Usage[]> =>
  ((await (await fetch(req(`${BASE}/${listKey}`, "GET", maintainer))).json()) as { usedBy: Usage[] }).usedBy;

/**
 * `bodyWithList` plus a select field bound to that list, mapping `mapping`
 * onto catalog fields. `nest` wraps the pair in a group field, so the walk has
 * to descend to find them.
 */
const bodyMapping = (listKey: string, mapping: Record<string, string>, nest = false): ProcessBody => {
  const base = bodyWithList(listKey) as unknown as { fields: unknown[] };
  const picker = { id: "field_pick", key: "pick", label: { en: "Pick" }, type: "select", dataSource: "ds_a", columnMapping: mapping };
  const targets = [...new Set(Object.values(mapping))].map((id) => ({ id, key: id.slice("field_".length), label: { en: id }, type: "string" }));
  const leaves = [picker, ...targets];
  base.fields = nest ? [{ id: "field_group", key: "group", label: { en: "Group" }, type: "group", fields: leaves }] : leaves;
  return base as unknown as ProcessBody;
};

test.skipIf(!DB)("the detail route names the processes that reference the list", async () => {
  await createList("referenced");
  await publishBody("proc_uses_list" as ProcessId, bodyWithList("referenced"), reg, dataSourceReg);
  expect(await usedBy("referenced")).toEqual([{ processId: "proc_uses_list", version: 1, columns: [] }]);
});

test.skipIf(!DB)("the detail route reports a mapped column key", async () => {
  await createList("products");
  await publishBody("proc_maps" as ProcessId, bodyMapping("products", { price: "field_amount" }), reg, dataSourceReg);
  expect((await usedBy("products"))[0]!.columns).toEqual(["price"]);
});

test.skipIf(!DB)("a mapping inside a group field counts", async () => {
  await createList("nested");
  await publishBody("proc_nested" as ProcessId, bodyMapping("nested", { price: "field_amount" }, true), reg, dataSourceReg);
  expect((await usedBy("nested"))[0]!.columns).toEqual(["price"]);
});

test.skipIf(!DB)("two fields mapping one column report it once, sorted", async () => {
  await createList("twice");
  const body = bodyMapping("twice", { sku: "field_a", price: "field_b" }) as unknown as { fields: Record<string, unknown>[] };
  // A second picker on the same source, mapping `price` again onto its own target.
  body.fields.push(
    { id: "field_pick2", key: "pick2", label: { en: "Pick 2" }, type: "select", dataSource: "ds_a", columnMapping: { price: "field_c" } },
    { id: "field_c", key: "c", label: { en: "C" }, type: "string" },
  );
  await publishBody("proc_twice" as ProcessId, body as unknown as ProcessBody, reg, dataSourceReg);
  expect((await usedBy("twice"))[0]!.columns).toEqual(["price", "sku"]);
});

test.skipIf(!DB)("a mapped key the list no longer declares still reports", async () => {
  await createList("stale");
  // The list declares nothing, so `gone` names no column of it. `checkColumnMapping`
  // never checks a key against a declaration, which is why the report has to.
  await publishBody("proc_stale" as ProcessId, bodyMapping("stale", { gone: "field_amount" }), reg, dataSourceReg);
  expect((await usedBy("stale"))[0]!.columns).toEqual(["gone"]);
});

test.skipIf(!DB)("the delete guard refuses a list a mapping references, as it does an unmapped one", async () => {
  await createList("guarded");
  await publishBody("proc_guarded" as ProcessId, bodyMapping("guarded", { price: "field_amount" }), reg, dataSourceReg);
  expect((await fetch(req(`${BASE}/guarded`, "DELETE", maintainer))).status).toBe(409);
  expect(await readList("guarded")).toBe(1);
});

test.skipIf(!DB)("a mapping of another list's column stays out of this list's entry", async () => {
  await createList("mine");
  await createList("theirs");
  const body = bodyWithList("mine") as unknown as { dataSources: unknown[]; fields: unknown[] };
  body.dataSources.push({ id: "ds_b", key: "b", type: DB_LIST_DATA_SOURCE_TYPE, config: { listKey: "theirs" } });
  body.fields = [
    { id: "field_pick", key: "pick", label: { en: "Pick" }, type: "select", dataSource: "ds_b", columnMapping: { price: "field_amount" } },
    { id: "field_amount", key: "amount", label: { en: "Amount" }, type: "string" },
  ];
  await publishBody("proc_other" as ProcessId, body as unknown as ProcessBody, reg, dataSourceReg);
  expect((await usedBy("mine"))[0]!.columns).toEqual([]);
  expect((await usedBy("theirs"))[0]!.columns).toEqual(["price"]);
});

test.skipIf(!DB)("the metadata route changes label and description", async () => {
  await createList("cost_centres");
  const res = await fetch(req(`${BASE}/cost_centres`, "PUT", maintainer, { label: "Cost centres", description: "Finance owns these" }));
  expect(res.status).toBe(200);
  const detail = (await (await fetch(req(`${BASE}/cost_centres`, "GET", maintainer))).json()) as { label: string; description: string };
  expect(detail).toMatchObject({ label: "Cost centres", description: "Finance owns these" });
});

test.skipIf(!DB)("creating a list twice is a 409, decided by the insert rather than a preceding read", async () => {
  expect((await createList("cost_centres")).status).toBe(201);
  expect((await createList("cost_centres")).status).toBe(409);

  // Two simultaneous creates of one key: exactly one wins, and the loser gets
  // the same 409 rather than a primary key violation surfacing as a 500.
  const [a, b] = await Promise.all([createList("racing"), createList("racing")]);
  expect([a.status, b.status].sort()).toEqual([201, 409]);
});

test.skipIf(!DB)("an unknown listKey is a 404 on every route that names one", async () => {
  expect((await fetch(req(`${BASE}/nope`, "GET", maintainer))).status).toBe(404);
  expect((await fetch(req(`${BASE}/nope`, "PUT", maintainer, { label: "x" }))).status).toBe(404);
  expect((await putValues("nope", [])).status).toBe(404);
  expect((await fetch(req(`${BASE}/nope`, "DELETE", maintainer))).status).toBe(404);
});

test.skipIf(!DB)("an actor holding neither role reads nothing", async () => {
  await createList("cost_centres");
  expect((await fetch(req(BASE, "GET", bystander))).status).toBe(403);
  expect((await fetch(req(`${BASE}/cost_centres`, "GET", bystander))).status).toBe(403);
  // system:admin implies nothing here either — the grant is narrow on purpose.
  expect((await fetch(req(BASE, "GET", admin))).status).toBe(403);
});

test.skipIf(!DB)("a developer reads but cannot write", async () => {
  await createList("cost_centres");
  expect((await fetch(req(BASE, "GET", developer))).status).toBe(200);
  expect((await fetch(req(`${BASE}/cost_centres`, "GET", developer))).status).toBe(200);

  expect((await createList("from_developer", developer)).status).toBe(403);
  expect((await putValues("cost_centres", [v("cc1")], developer)).status).toBe(403);
  expect((await fetch(req(`${BASE}/cost_centres`, "PUT", developer, { label: "x" }))).status).toBe(403);
  expect((await fetch(req(`${BASE}/cost_centres`, "DELETE", developer))).status).toBe(403);
});

// The read is what fills the `"db.list"` picker in the studio's data source
// panel, and an author authors data sources. The write stays the maintainer's.
test.skipIf(!DB)("an author reads but cannot write", async () => {
  await createList("cost_centres");
  expect((await fetch(req(BASE, "GET", author))).status).toBe(200);
  expect((await fetch(req(`${BASE}/cost_centres`, "GET", author))).status).toBe(200);

  expect((await createList("from_author", author)).status).toBe(403);
  expect((await putValues("cost_centres", [v("cc1")], author)).status).toBe(403);
  expect((await fetch(req(`${BASE}/cost_centres`, "PUT", author, { label: "x" }))).status).toBe(403);
  expect((await fetch(req(`${BASE}/cost_centres`, "DELETE", author))).status).toBe(403);
});

test.skipIf(!DB)("an admin cannot write a data list", async () => {
  await createList("cost_centres");
  expect((await createList("from_admin", admin)).status).toBe(403);
  expect((await putValues("cost_centres", [v("cc1")], admin)).status).toBe(403);
  expect((await fetch(req(`${BASE}/cost_centres`, "DELETE", admin))).status).toBe(403);
});

// ---- table-shaped-data-sources: the column declaration and per-value attributes ----

const COLS = [
  { key: "sku", label: "SKU", type: "string" },
  { key: "price", label: "Price", type: "number" },
];

const createWithColumns = (key: string, columns: unknown[], actor: Actor = maintainer) =>
  fetch(req(BASE, "POST", actor, { listKey: key, label: key, columns }));
const updateList = (key: string, patch: Record<string, unknown>, actor: Actor = maintainer) =>
  fetch(req(`${BASE}/${key}`, "PUT", actor, { label: key, ...patch }));
const getList = (key: string, actor: Actor = maintainer) => fetch(req(`${BASE}/${key}`, "GET", actor));

test.skipIf(!DB)("a create declares columns, and both read routes return them", async () => {
  expect((await createWithColumns("products", COLS)).status).toBe(201);
  const detail = (await (await getList("products")).json()) as { columns: unknown[] };
  expect(detail.columns).toEqual(COLS);
  const page = (await (await fetch(req(BASE, "GET", maintainer))).json()) as { items: { listKey: string; columns: unknown[] }[] };
  expect(page.items.find((i) => i.listKey === "products")!.columns).toEqual(COLS);
});

test.skipIf(!DB)("an update that omits columns leaves the declaration alone", async () => {
  await createWithColumns("products", COLS);
  expect((await updateList("products", {})).status).toBe(200);
  const detail = (await (await getList("products")).json()) as { columns: unknown[] };
  expect(detail.columns).toEqual(COLS);
});

test.skipIf(!DB)("an empty array clears the declaration and every attribute with it", async () => {
  await createWithColumns("products", COLS);
  await putValues("products", [{ ...v("widget"), attributes: { sku: "A-1140", price: 12.5 } }]);
  expect((await updateList("products", { columns: [] })).status).toBe(200);
  const detail = (await (await getList("products")).json()) as { columns: unknown[]; values: { attributes: unknown }[] };
  expect(detail.columns).toEqual([]);
  expect(detail.values[0]!.attributes).toEqual({});
});

test.skipIf(!DB)("dropping one column drops that attribute and keeps the others", async () => {
  await createWithColumns("products", COLS);
  await putValues("products", [{ ...v("widget"), attributes: { sku: "A-1140", price: 12.5 } }]);
  await updateList("products", { columns: [COLS[0]] });
  const detail = (await (await getList("products")).json()) as { values: { attributes: Record<string, unknown> }[] };
  expect(detail.values[0]!.attributes).toEqual({ sku: "A-1140" });
});

test.skipIf(!DB)("the route refuses a malformed column and writes nothing", async () => {
  await createList("products");
  const res = await updateList("products", { columns: [{ key: "Unit Price", label: "x", type: "string" }] });
  expect(res.status).toBe(400);
  const detail = (await (await getList("products")).json()) as { columns: unknown[] };
  expect(detail.columns).toEqual([]);
});

test.skipIf(!DB)("the route refuses a duplicate column key and a count over the bound", async () => {
  await createList("products");
  expect((await updateList("products", { columns: [COLS[0], COLS[0]] })).status).toBe(400);
  const over = Array.from({ length: 11 }, (_, i) => ({ key: `c${i}`, label: `C${i}`, type: "string" }));
  expect((await updateList("products", { columns: over })).status).toBe(400);
});

test.skipIf(!DB)("a value carries typed attributes, and the detail route returns them", async () => {
  await createWithColumns("products", COLS);
  expect((await putValues("products", [{ ...v("widget"), attributes: { sku: "A-1140", price: 12.5 } }])).status).toBe(200);
  const detail = (await (await getList("products")).json()) as { values: { attributes: unknown }[] };
  expect(detail.values[0]!.attributes).toEqual({ sku: "A-1140", price: 12.5 });
});

test.skipIf(!DB)("the values route refuses an undeclared attribute key and writes nothing", async () => {
  await createWithColumns("products", COLS);
  await putValues("products", [{ ...v("widget"), attributes: { sku: "A-1140" } }]);
  const res = await putValues("products", [{ ...v("widget"), attributes: { nope: "x" } }]);
  expect(res.status).toBe(400);
  const detail = (await (await getList("products")).json()) as { values: { attributes: unknown }[] };
  expect(detail.values[0]!.attributes).toEqual({ sku: "A-1140" });
});

test.skipIf(!DB)("the values route refuses a mistyped attribute", async () => {
  await createWithColumns("products", COLS);
  expect((await putValues("products", [{ ...v("widget"), attributes: { price: "cheap" } }])).status).toBe(400);
});

test.skipIf(!DB)("a value entry that omits attributes clears the map", async () => {
  await createWithColumns("products", COLS);
  await putValues("products", [{ ...v("widget"), attributes: { sku: "A-1140" } }]);
  await putValues("products", [v("widget")]);
  const detail = (await (await getList("products")).json()) as { values: { attributes: unknown }[] };
  expect(detail.values[0]!.attributes).toEqual({});
});

test.skipIf(!DB)("a retired value keeps the attributes it held", async () => {
  await createWithColumns("products", COLS);
  await putValues("products", [{ ...v("widget"), attributes: { sku: "A-1140" } }, v("other")]);
  // Omitting `widget` retires it. It still resolves for an instance holding
  // it, so its attributes have to survive with it.
  await putValues("products", [v("other")]);
  const detail = (await (await getList("products")).json()) as { values: { value: string; active: boolean; attributes: unknown }[] };
  const widget = detail.values.find((x) => x.value === "widget")!;
  expect(widget.active).toBe(false);
  expect(widget.attributes).toEqual({ sku: "A-1140" });
});
