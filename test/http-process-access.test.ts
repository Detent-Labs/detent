/**
 * The `/processes/:processId/access` and `/processes/access/mine` HTTP
 * surface (src/http/studio-routes.ts, process-access-roles). The write
 * scenarios mirror `test/process-access.test.ts`'s engine-layer coverage of
 * `addAccessPrincipal`/`deleteAccessPrincipal`, exercised over HTTP; the two
 * reads have no engine-layer test of their own. DB-backed — skips when
 * DATABASE_URL is unset.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql } from "../src/engine/store.js";
import { DB, initDb, authedReq } from "./helpers/http-fixture.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import { createServer } from "../src/http/server.js";
import { devHeaderResolver } from "../src/auth/resolve.js";
import { DEVELOPER_ROLE, OWNER_ROLE, ADMIN_ROLE } from "../src/auth/authorize.js";
import type { Actor } from "../src/cel/eval.js";
import type { ProcessId } from "../src/schema/definition.js";

const reg = createRegistry();
const dataSourceReg = createDataSourceRegistry();
const fetch = createServer(dataSourceReg, reg, sql, devHeaderResolver);

beforeAll(initDb);
beforeEach(async () => {
  if (DB) await sql`TRUNCATE process_access_roles`;
});

let n = 0;
const pid = (): ProcessId => `proc_http_access_${++n}` as ProcessId;

async function addToList(processId: ProcessId, kind: "developer" | "owner" | "reader", principal: string): Promise<void> {
  await sql`INSERT INTO process_access_roles (process_id, kind, principal) VALUES (${processId}, ${kind}, ${principal})`;
}

const bystander: Actor = { id: "user_bystander", roles: [] };

// ============================================================
// GET /processes/:processId/access
// ============================================================

test.skipIf(!DB)("GET /processes/:processId/access with no resolvable credential maps to 401", async () => {
  const res = await fetch(new Request(`http://x/processes/${pid()}/access`));
  expect(res.status).toBe(401);
});

test.skipIf(!DB)("GET /processes/:processId/access returns all three lists, any resolved actor admitted", async () => {
  const processId = pid();
  await addToList(processId, "developer", "user_dev");
  await addToList(processId, "owner", "user_owner");
  await addToList(processId, "reader", "user_reader");

  const res = await fetch(authedReq(`http://x/processes/${processId}/access`, "GET", bystander));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { developer: string[]; owner: string[]; reader: string[] };
  expect(body).toEqual({ developer: ["user_dev"], owner: ["user_owner"], reader: ["user_reader"] });
});

test.skipIf(!DB)("GET /processes/:processId/access for a process with no rows returns three empty lists", async () => {
  const res = await fetch(authedReq(`http://x/processes/${pid()}/access`, "GET", bystander));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ developer: [], owner: [], reader: [] });
});

// ============================================================
// PUT /processes/:processId/access
// ============================================================

test.skipIf(!DB)("PUT /processes/:processId/access with no resolvable credential maps to 401", async () => {
  const res = await fetch(new Request(`http://x/processes/${pid()}/access`, { method: "PUT", body: "{}" }));
  expect(res.status).toBe(401);
});

test.skipIf(!DB)("a listed Developer adds an entry to the Developer list", async () => {
  const processId = pid();
  await addToList(processId, "developer", "user_dev");
  const dev: Actor = { id: "user_dev", roles: [DEVELOPER_ROLE] };

  const res = await fetch(authedReq(`http://x/processes/${processId}/access`, "PUT", dev, { kind: "developer", principal: "user_new" }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ kind: "developer", principal: "user_new" });

  const rows = (await sql`SELECT principal FROM process_access_roles WHERE process_id = ${processId} AND kind = 'developer'`) as { principal: string }[];
  expect(rows.map((r) => r.principal)).toContain("user_new");
});

test.skipIf(!DB)("a listed Developer adds an entry to the Owner list", async () => {
  const processId = pid();
  await addToList(processId, "developer", "user_dev");
  const dev: Actor = { id: "user_dev", roles: [DEVELOPER_ROLE] };

  const res = await fetch(authedReq(`http://x/processes/${processId}/access`, "PUT", dev, { kind: "owner", principal: "user_owner" }));
  expect(res.status).toBe(200);

  const rows = (await sql`SELECT 1 FROM process_access_roles WHERE process_id = ${processId} AND kind = 'owner' AND principal = 'user_owner'`) as unknown[];
  expect(rows.length).toBe(1);
});

test.skipIf(!DB)("an unlisted actor's write is refused with 403 and writes nothing", async () => {
  const processId = pid();
  const stranger: Actor = { id: "user_stranger", roles: [] };

  const res = await fetch(authedReq(`http://x/processes/${processId}/access`, "PUT", stranger, { kind: "developer", principal: "user_new" }));
  expect(res.status).toBe(403);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("authorization");

  const rows = (await sql`SELECT 1 FROM process_access_roles WHERE process_id = ${processId}`) as unknown[];
  expect(rows.length).toBe(0);
});

test.skipIf(!DB)("a Developer holding no Owner entry is refused writing the Reader list", async () => {
  const processId = pid();
  await addToList(processId, "developer", "user_dev");
  const dev: Actor = { id: "user_dev", roles: [DEVELOPER_ROLE] };

  const res = await fetch(authedReq(`http://x/processes/${processId}/access`, "PUT", dev, { kind: "reader", principal: "user_reader" }));
  expect(res.status).toBe(403);
});

test.skipIf(!DB)("an admin writes any list unconditionally", async () => {
  const processId = pid();
  const admin: Actor = { id: "user_admin", roles: [ADMIN_ROLE] };

  const res = await fetch(authedReq(`http://x/processes/${processId}/access`, "PUT", admin, { kind: "owner", principal: "user_owner" }));
  expect(res.status).toBe(200);
});

test.skipIf(!DB)("an unknown kind maps to 400 and writes nothing", async () => {
  const processId = pid();
  await addToList(processId, "developer", "user_dev");
  const dev: Actor = { id: "user_dev", roles: [DEVELOPER_ROLE] };

  const res = await fetch(authedReq(`http://x/processes/${processId}/access`, "PUT", dev, { kind: "manager", principal: "user_new" }));
  expect(res.status).toBe(400);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("request-shape");
});

test.skipIf(!DB)("a non-string principal maps to 400", async () => {
  const processId = pid();
  await addToList(processId, "developer", "user_dev");
  const dev: Actor = { id: "user_dev", roles: [DEVELOPER_ROLE] };

  const res = await fetch(authedReq(`http://x/processes/${processId}/access`, "PUT", dev, { kind: "developer", principal: 42 }));
  expect(res.status).toBe(400);
});

test.skipIf(!DB)("an empty principal maps to 400", async () => {
  const processId = pid();
  await addToList(processId, "developer", "user_dev");
  const dev: Actor = { id: "user_dev", roles: [DEVELOPER_ROLE] };

  const res = await fetch(authedReq(`http://x/processes/${processId}/access`, "PUT", dev, { kind: "developer", principal: "" }));
  expect(res.status).toBe(400);
});

test.skipIf(!DB)("writing an entry already present succeeds and changes nothing", async () => {
  const processId = pid();
  await addToList(processId, "developer", "user_dev");
  const dev: Actor = { id: "user_dev", roles: [DEVELOPER_ROLE] };

  const res = await fetch(authedReq(`http://x/processes/${processId}/access`, "PUT", dev, { kind: "developer", principal: "user_dev" }));
  expect(res.status).toBe(200);

  const rows = (await sql`SELECT count(*)::int AS n FROM process_access_roles WHERE process_id = ${processId} AND kind = 'developer' AND principal = 'user_dev'`) as { n: number }[];
  expect(rows[0]!.n).toBe(1);
});

// ============================================================
// DELETE /processes/:processId/access
// ============================================================

test.skipIf(!DB)("DELETE /processes/:processId/access with no resolvable credential maps to 401", async () => {
  const res = await fetch(new Request(`http://x/processes/${pid()}/access`, { method: "DELETE", body: "{}" }));
  expect(res.status).toBe(401);
});

test.skipIf(!DB)("a listed Owner removes an entry from the Reader list", async () => {
  const processId = pid();
  await addToList(processId, "owner", "user_owner");
  await addToList(processId, "reader", "user_reader");
  const owner: Actor = { id: "user_owner", roles: [OWNER_ROLE] };

  const res = await fetch(authedReq(`http://x/processes/${processId}/access`, "DELETE", owner, { kind: "reader", principal: "user_reader" }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ kind: "reader", principal: "user_reader" });

  const rows = (await sql`SELECT 1 FROM process_access_roles WHERE process_id = ${processId} AND kind = 'reader'`) as unknown[];
  expect(rows.length).toBe(0);
});

test.skipIf(!DB)("an unlisted actor's delete is refused with 403 and deletes nothing", async () => {
  const processId = pid();
  await addToList(processId, "reader", "user_reader");
  const stranger: Actor = { id: "user_stranger", roles: [] };

  const res = await fetch(authedReq(`http://x/processes/${processId}/access`, "DELETE", stranger, { kind: "reader", principal: "user_reader" }));
  expect(res.status).toBe(403);

  const rows = (await sql`SELECT 1 FROM process_access_roles WHERE process_id = ${processId} AND kind = 'reader'`) as unknown[];
  expect(rows.length).toBe(1);
});

test.skipIf(!DB)("deleting an absent entry is idempotent and still returns 200", async () => {
  const processId = pid();
  await addToList(processId, "developer", "user_dev");
  const dev: Actor = { id: "user_dev", roles: [DEVELOPER_ROLE] };

  const res = await fetch(authedReq(`http://x/processes/${processId}/access`, "DELETE", dev, { kind: "developer", principal: "user_absent" }));
  expect(res.status).toBe(200);
});

test.skipIf(!DB)("a malformed delete body maps to 400", async () => {
  const processId = pid();
  await addToList(processId, "developer", "user_dev");
  const dev: Actor = { id: "user_dev", roles: [DEVELOPER_ROLE] };

  const res = await fetch(authedReq(`http://x/processes/${processId}/access`, "DELETE", dev, { kind: "developer" }));
  expect(res.status).toBe(400);
});

// ============================================================
// GET /processes/access/mine
// ============================================================

test.skipIf(!DB)("GET /processes/access/mine with no resolvable credential maps to 401", async () => {
  const res = await fetch(new Request("http://x/processes/access/mine"));
  expect(res.status).toBe(401);
});

test.skipIf(!DB)("GET /processes/access/mine returns only the calling actor's own Developer and Owner lists", async () => {
  const mine = pid();
  const someoneElses = pid();
  await addToList(mine, "developer", "user_dev");
  await addToList(mine, "owner", "user_dev");
  await addToList(someoneElses, "developer", "user_other");
  await addToList(someoneElses, "owner", "user_other");

  const dev: Actor = { id: "user_dev", roles: [DEVELOPER_ROLE, OWNER_ROLE] };
  const res = await fetch(authedReq("http://x/processes/access/mine", "GET", dev));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { developer: string[]; owner: string[] };
  expect(body.developer).toEqual([mine]);
  expect(body.owner).toEqual([mine]);
});

test.skipIf(!DB)("an actor listed but holding neither required role sees two empty arrays", async () => {
  const processId = pid();
  await addToList(processId, "developer", "user_no_role");
  await addToList(processId, "owner", "user_no_role");

  const actor: Actor = { id: "user_no_role", roles: [] };
  const res = await fetch(authedReq("http://x/processes/access/mine", "GET", actor));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ developer: [], owner: [] });
});

test.skipIf(!DB)("GET /processes/access/mine does not reach another actor's group-listed processes", async () => {
  const processId = pid();
  await addToList(processId, "developer", "user_other");

  const dev: Actor = { id: "user_dev", roles: [DEVELOPER_ROLE] };
  const res = await fetch(authedReq("http://x/processes/access/mine", "GET", dev));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ developer: [], owner: [] });
});

// ============================================================
// CORS preflight
// ============================================================

test("OPTIONS preflight on the process access item route returns 204 permitting GET, PUT, DELETE", async () => {
  const res = await fetch(new Request("http://x/processes/proc_x/access", { method: "OPTIONS" }));
  expect(res.status).toBe(204);
  expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET, PUT, DELETE");
});

test("OPTIONS preflight on the process access mine route returns 204 permitting GET", async () => {
  const res = await fetch(new Request("http://x/processes/access/mine", { method: "OPTIONS" }));
  expect(res.status).toBe(204);
  expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET");
});
