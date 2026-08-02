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
import { ADMIN_ROLE, DATALISTS_ROLE, DEVELOPER_ROLE } from "../src/auth/authorize.js";
import { publishBody } from "../src/engine/definitions.js";
import type { Actor } from "../src/cel/eval.js";
import type { ProcessBody, ProcessId } from "../src/schema/definition.js";

const DB = !!process.env.DATABASE_URL;
const reg = createRegistry();
const dataSourceReg = createDefaultDataSourceRegistry(sql);
const fetch = createServer(dataSourceReg, reg, sql, devHeaderResolver);

const maintainer: Actor = { id: "user_maintainer", roles: [DATALISTS_ROLE] };
const developer: Actor = { id: "user_developer", roles: [DEVELOPER_ROLE] };
const admin: Actor = { id: "user_admin", roles: [ADMIN_ROLE] };
const bystander: Actor = { id: "user_bystander", roles: [] };

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
    values: { value: string; active: boolean }[];
  };
  expect(detail.values).toEqual([
    { value: "cc1", label: { en: "One" }, active: true, sortOrder: 0 },
    { value: "cc2", label: { en: "Two" }, active: false, sortOrder: 1 },
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

test.skipIf(!DB)("the detail route names the processes that reference the list", async () => {
  await createList("referenced");
  await publishBody("proc_uses_list" as ProcessId, bodyWithList("referenced"), reg, dataSourceReg);
  const detail = (await (await fetch(req(`${BASE}/referenced`, "GET", maintainer))).json()) as {
    usedBy: { processId: string; version: number }[];
  };
  expect(detail.usedBy).toEqual([{ processId: "proc_uses_list", version: 1 }]);
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

test.skipIf(!DB)("an admin cannot write a data list", async () => {
  await createList("cost_centres");
  expect((await createList("from_admin", admin)).status).toBe(403);
  expect((await putValues("cost_centres", [v("cc1")], admin)).status).toBe(403);
  expect((await fetch(req(`${BASE}/cost_centres`, "DELETE", admin))).status).toBe(403);
});
