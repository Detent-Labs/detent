/**
 * The `/drafts` HTTP surface (src/http/studio-routes.ts): 401 without a
 * credential, 403 without `system:developer`, success with it, plus the
 * 404/400/409 mappings specific to drafts. DB-backed — skips when
 * DATABASE_URL is unset.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema } from "../src/engine/store.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import { createServer } from "../src/http/server.js";
import { DEVELOPER_ROLE } from "../src/auth/authorize.js";
import type { Actor } from "../src/cel/eval.js";

const DB = !!process.env.DATABASE_URL;
const reg = createRegistry();
const dataSourceReg = createDataSourceRegistry();
const fetch = createServer(dataSourceReg, reg);

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE drafts, outbox, instances, history_entries, instance_events, definitions`;
});

const developer: Actor = { id: "user_dev", roles: [DEVELOPER_ROLE] };
const bystander: Actor = { id: "user_bystander", roles: [] };

const authedReq = (url: string, method: string, actor: Actor, body?: unknown) =>
  new Request(url, {
    method,
    headers: {
      "X-Actor-Id": actor.id,
      ...(actor.roles.length > 0 ? { "X-Actor-Roles": actor.roles.join(",") } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

let n = 0;
const pid = () => `proc_http_studio_${++n}`;

const authoredBody = (label: string) => ({
  key: "wf",
  label: { en: label },
  baseLocale: "en",
  fields: [],
  workflow: { initialStep: "step_a", steps: [{ id: "step_a", key: "a", label: { en: "A" }, type: "task" }] },
});

// ============================================================
// GET /drafts
// ============================================================

test.skipIf(!DB)("GET /drafts with no resolvable credential maps to 401", async () => {
  const res = await fetch(new Request("http://x/drafts"));
  expect(res.status).toBe(401);
});

test.skipIf(!DB)("GET /drafts without system:developer maps to 403", async () => {
  const res = await fetch(authedReq("http://x/drafts", "GET", bystander));
  expect(res.status).toBe(403);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("authorization");
});

test.skipIf(!DB)("GET /drafts with system:developer succeeds", async () => {
  const processId = pid();
  await fetch(authedReq(`http://x/drafts/${processId}`, "PUT", developer, { body: authoredBody("v1"), layout: {}, revision: 0 }));

  const res = await fetch(authedReq("http://x/drafts", "GET", developer));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { processId: string }[];
  expect(body.map((d) => d.processId)).toContain(processId);
});

// ============================================================
// GET /drafts/:processId
// ============================================================

test.skipIf(!DB)("GET /drafts/:processId with no resolvable credential maps to 401", async () => {
  const res = await fetch(new Request(`http://x/drafts/${pid()}`));
  expect(res.status).toBe(401);
});

test.skipIf(!DB)("GET /drafts/:processId without system:developer maps to 403", async () => {
  const res = await fetch(authedReq(`http://x/drafts/${pid()}`, "GET", bystander));
  expect(res.status).toBe(403);
});

test.skipIf(!DB)("GET /drafts/:processId for an absent draft maps to 404", async () => {
  const res = await fetch(authedReq(`http://x/drafts/${pid()}`, "GET", developer));
  expect(res.status).toBe(404);
});

test.skipIf(!DB)("a developer reads and writes a draft", async () => {
  const processId = pid();
  const putRes = await fetch(authedReq(`http://x/drafts/${processId}`, "PUT", developer, { body: authoredBody("v1"), layout: {}, revision: 0 }));
  expect(putRes.status).toBe(200);

  const getRes = await fetch(authedReq(`http://x/drafts/${processId}`, "GET", developer));
  expect(getRes.status).toBe(200);
  const body = (await getRes.json()) as { body: { label: { en: string } }; revision: number; updatedBy: string };
  expect(body.body.label.en).toBe("v1");
  expect(body.revision).toBe(0);
  expect(body.updatedBy).toBe(developer.id);
});

// ============================================================
// PUT /drafts/:processId
// ============================================================

test.skipIf(!DB)("PUT /drafts/:processId with no resolvable credential maps to 401", async () => {
  const res = await fetch(new Request(`http://x/drafts/${pid()}`, { method: "PUT", body: "{}" }));
  expect(res.status).toBe(401);
});

test.skipIf(!DB)("PUT /drafts/:processId without system:developer maps to 403 and writes nothing", async () => {
  const processId = pid();
  const res = await fetch(authedReq(`http://x/drafts/${processId}`, "PUT", bystander, { body: authoredBody("v1"), layout: {}, revision: 0 }));
  expect(res.status).toBe(403);

  const rows = (await sql`SELECT 1 FROM drafts WHERE process_id = ${processId}`) as unknown[];
  expect(rows.length).toBe(0);
});

test.skipIf(!DB)("a malformed envelope maps to 400", async () => {
  const processId = pid();
  const res = await fetch(authedReq(`http://x/drafts/${processId}`, "PUT", developer, { body: [], layout: {}, revision: 0 }));
  expect(res.status).toBe(400);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("request-shape");

  const rows = (await sql`SELECT 1 FROM drafts WHERE process_id = ${processId}`) as unknown[];
  expect(rows.length).toBe(0);
});

test.skipIf(!DB)("a stale-revision PUT maps to 409 and leaves the stored row unchanged", async () => {
  const processId = pid();
  await fetch(authedReq(`http://x/drafts/${processId}`, "PUT", developer, { body: authoredBody("v1"), layout: {}, revision: 0 }));
  await fetch(authedReq(`http://x/drafts/${processId}`, "PUT", developer, { body: authoredBody("v2"), layout: {}, revision: 0 })); // -> revision 1

  const res = await fetch(authedReq(`http://x/drafts/${processId}`, "PUT", developer, { body: authoredBody("v3"), layout: {}, revision: 0 }));
  expect(res.status).toBe(409);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("draft-conflict");

  const stored = (await sql`SELECT body, revision FROM drafts WHERE process_id = ${processId}`) as { body: { label: { en: string } }; revision: number }[];
  expect(stored[0]!.revision).toBe(1);
  expect(stored[0]!.body.label.en).toBe("v2");
});

// ============================================================
// DELETE /drafts/:processId
// ============================================================

test.skipIf(!DB)("DELETE /drafts/:processId with no resolvable credential maps to 401", async () => {
  const res = await fetch(new Request(`http://x/drafts/${pid()}`, { method: "DELETE" }));
  expect(res.status).toBe(401);
});

test.skipIf(!DB)("DELETE /drafts/:processId without system:developer maps to 403 and deletes nothing", async () => {
  const processId = pid();
  await fetch(authedReq(`http://x/drafts/${processId}`, "PUT", developer, { body: authoredBody("v1"), layout: {}, revision: 0 }));

  const res = await fetch(authedReq(`http://x/drafts/${processId}`, "DELETE", bystander));
  expect(res.status).toBe(403);

  const rows = (await sql`SELECT 1 FROM drafts WHERE process_id = ${processId}`) as unknown[];
  expect(rows.length).toBe(1);
});

test.skipIf(!DB)("DELETE /drafts/:processId with system:developer removes the draft", async () => {
  const processId = pid();
  await fetch(authedReq(`http://x/drafts/${processId}`, "PUT", developer, { body: authoredBody("v1"), layout: {}, revision: 0 }));

  const res = await fetch(authedReq(`http://x/drafts/${processId}`, "DELETE", developer));
  expect(res.status).toBe(204);

  const rows = (await sql`SELECT 1 FROM drafts WHERE process_id = ${processId}`) as unknown[];
  expect(rows.length).toBe(0);
});

test.skipIf(!DB)("DELETE /drafts/:processId for a process with no draft maps to 404", async () => {
  const res = await fetch(authedReq(`http://x/drafts/${pid()}`, "DELETE", developer));
  expect(res.status).toBe(404);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("not-found");
});

// ============================================================
// CORS preflight
// ============================================================

test("OPTIONS preflight on the drafts listing route returns 204 permitting GET", async () => {
  const res = await fetch(new Request("http://x/drafts", { method: "OPTIONS" }));
  expect(res.status).toBe(204);
  expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET");
});

test("OPTIONS preflight on the drafts item route returns 204 permitting GET, PUT, DELETE", async () => {
  const res = await fetch(new Request("http://x/drafts/proc_x", { method: "OPTIONS" }));
  expect(res.status).toBe(204);
  expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET, PUT, DELETE");
});
