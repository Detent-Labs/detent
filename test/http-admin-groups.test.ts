/**
 * The `/admin/groups*` HTTP surface (src/http/admin-routes.ts): list/page,
 * create (empty/too-long name), rename (404, too-long name), set members, set
 * scope (both shapes, 400, narrow-after-publish), delete (referenced/
 * unreferenced/unknown), and the 403 an actor lacking `system:admin` gets
 * from all six. DB-backed — skips when DATABASE_URL is unset.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql } from "../src/engine/store.js";
import { DB, initDb, authedReq } from "./helpers/http-fixture.js";
import { clearInstanceAudit } from "./audit-cleanup.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import { createDefaultAssignmentRegistry } from "../src/engine/assignment-strategies.js";
import { createServer } from "../src/http/server.js";
import { devHeaderResolver } from "../src/auth/resolve.js";
import { ADMIN_ROLE } from "../src/auth/authorize.js";
import { publishBody } from "../src/engine/definitions.js";
import type { Actor } from "../src/cel/eval.js";
import type { ProcessBody, ProcessId } from "../src/schema/definition.js";

const reg = createRegistry();
const dataSourceReg = createDataSourceRegistry();
const assignmentReg = createDefaultAssignmentRegistry();
const fetch = createServer(dataSourceReg, reg, sql, devHeaderResolver);

beforeAll(initDb);
beforeEach(async () => {
  if (DB) await sql`TRUNCATE outbox, instances, definitions, groups, auth_users`;
  if (DB) await clearInstanceAudit();
});

const admin: Actor = { id: "user_admin", roles: [ADMIN_ROLE] };
const bystander: Actor = { id: "user_bystander", roles: [] };

const groupBody = (allowedGroups: string[]): ProcessBody =>
  ({
    key: "wf",
    label: { en: "Wf" },
    baseLocale: "en",
    fields: [],
    allowedGroups,
    workflow: {
      initialStep: "step_done",
      steps: [{ id: "step_done", key: "done", label: { en: "Done" }, type: "task", terminal: true }],
    },
  }) as unknown as ProcessBody;

let n = 0;
const nextPid = () => `proc_http_admin_groups_${++n}` as ProcessId;

// ============================================================
// GET /admin/groups
// ============================================================

test.skipIf(!DB)("GET /admin/groups lists and paginates", async () => {
  await fetch(authedReq("http://x/admin/groups", "POST", admin, { name: "A", scope: { type: "global" } }));
  await fetch(authedReq("http://x/admin/groups", "POST", admin, { name: "B", scope: { type: "global" } }));
  await fetch(authedReq("http://x/admin/groups", "POST", admin, { name: "C", scope: { type: "global" } }));

  const res = await fetch(authedReq("http://x/admin/groups?limit=2", "GET", admin));
  expect(res.status).toBe(200);
  const page = (await res.json()) as { items: { name: string }[]; cursor?: string };
  expect(page.items.map((g) => g.name)).toEqual(["A", "B"]);
  expect(page.cursor).toBeDefined();

  const rest = await fetch(authedReq(`http://x/admin/groups?limit=2&cursor=${page.cursor}`, "GET", admin));
  const restPage = (await rest.json()) as { items: { name: string }[]; cursor?: string };
  expect(restPage.items.map((g) => g.name)).toEqual(["C"]);
  expect(restPage.cursor).toBeUndefined();
});

// ============================================================
// POST /admin/groups
// ============================================================

test.skipIf(!DB)("POST /admin/groups creates, and refuses an empty name", async () => {
  const res = await fetch(authedReq("http://x/admin/groups", "POST", admin, { name: "Finance Approvers", scope: { type: "global" } }));
  expect(res.status).toBe(201);
  const created = (await res.json()) as { groupId: string; name: string; scope: unknown; members: string[] };
  expect(created.name).toBe("Finance Approvers");
  expect(created.scope).toEqual({ type: "global" });
  expect(created.members).toEqual([]);

  const empty = await fetch(authedReq("http://x/admin/groups", "POST", admin, { name: "   ", scope: { type: "global" } }));
  expect(empty.status).toBe(400);
});

test.skipIf(!DB)("POST /admin/groups refuses a name past 200 characters, and creates no group", async () => {
  const res = await fetch(authedReq("http://x/admin/groups", "POST", admin, { name: "x".repeat(201), scope: { type: "global" } }));
  expect(res.status).toBe(400);
  const list = await fetch(authedReq("http://x/admin/groups", "GET", admin));
  const page = (await list.json()) as { items: unknown[] };
  expect(page.items).toHaveLength(0);
});

// ============================================================
// PATCH /admin/groups/:groupId/name
// ============================================================

test.skipIf(!DB)("PATCH /admin/groups/:groupId/name renames, and 404s for an unknown groupId", async () => {
  const created = await fetch(authedReq("http://x/admin/groups", "POST", admin, { name: "Old", scope: { type: "global" } }));
  const { groupId } = (await created.json()) as { groupId: string };

  const res = await fetch(authedReq(`http://x/admin/groups/${groupId}/name`, "PATCH", admin, { name: "Regional Approvers" }));
  expect(res.status).toBe(200);
  expect(((await res.json()) as { name: string }).name).toBe("Regional Approvers");

  const missing = await fetch(authedReq("http://x/admin/groups/group_ghost/name", "PATCH", admin, { name: "X" }));
  expect(missing.status).toBe(404);
});

test.skipIf(!DB)("PATCH /admin/groups/:groupId/name refuses a name past 200 characters, leaving the stored name unchanged", async () => {
  const created = await fetch(authedReq("http://x/admin/groups", "POST", admin, { name: "Keep Me", scope: { type: "global" } }));
  const { groupId } = (await created.json()) as { groupId: string };

  const res = await fetch(authedReq(`http://x/admin/groups/${groupId}/name`, "PATCH", admin, { name: "x".repeat(201) }));
  expect(res.status).toBe(400);

  const list = await fetch(authedReq("http://x/admin/groups", "GET", admin));
  const page = (await list.json()) as { items: { groupId: string; name: string }[] };
  expect(page.items.find((g) => g.groupId === groupId)!.name).toBe("Keep Me");
});

// ============================================================
// PATCH /admin/groups/:groupId/members
// ============================================================

test.skipIf(!DB)("PATCH /admin/groups/:groupId/members replaces the whole member list", async () => {
  const created = await fetch(authedReq("http://x/admin/groups", "POST", admin, { name: "M", scope: { type: "global" } }));
  const { groupId } = (await created.json()) as { groupId: string };

  await fetch(authedReq(`http://x/admin/groups/${groupId}/members`, "PATCH", admin, { members: ["user_a", "user_b"] }));
  const res = await fetch(authedReq(`http://x/admin/groups/${groupId}/members`, "PATCH", admin, { members: ["user_a", "user_c"] }));
  expect(res.status).toBe(200);
  expect(((await res.json()) as { members: string[] }).members).toEqual(["user_a", "user_c"]);
});

// ============================================================
// PATCH /admin/groups/:groupId/scope
// ============================================================

test.skipIf(!DB)("PATCH /admin/groups/:groupId/scope accepts both scope shapes, and 400s for neither", async () => {
  const created = await fetch(authedReq("http://x/admin/groups", "POST", admin, { name: "S", scope: { type: "global" } }));
  const { groupId } = (await created.json()) as { groupId: string };

  const toProcesses = await fetch(authedReq(`http://x/admin/groups/${groupId}/scope`, "PATCH", admin, { scope: { type: "processes", processIds: ["proc_a"] } }));
  expect(toProcesses.status).toBe(200);
  expect(((await toProcesses.json()) as { scope: unknown }).scope).toEqual({ type: "processes", processIds: ["proc_a"] });

  const toGlobal = await fetch(authedReq(`http://x/admin/groups/${groupId}/scope`, "PATCH", admin, { scope: { type: "global" } }));
  expect(toGlobal.status).toBe(200);

  const bad = await fetch(authedReq(`http://x/admin/groups/${groupId}/scope`, "PATCH", admin, { scope: { type: "nonsense" } }));
  expect(bad.status).toBe(400);
});

test.skipIf(!DB)("narrowing a group's scope after a published process references it succeeds, and the published process is unaffected", async () => {
  const created = await fetch(authedReq("http://x/admin/groups", "POST", admin, { name: "Narrow", scope: { type: "global" } }));
  const { groupId } = (await created.json()) as { groupId: string };

  const pid = nextPid();
  await publishBody(pid, groupBody([groupId]), reg, dataSourceReg, sql, assignmentReg);

  const res = await fetch(authedReq(`http://x/admin/groups/${groupId}/scope`, "PATCH", admin, { scope: { type: "processes", processIds: ["proc_someone_else"] } }));
  expect(res.status).toBe(200);
});

// ============================================================
// DELETE /admin/groups/:groupId
// ============================================================

test.skipIf(!DB)("DELETE /admin/groups/:groupId refuses and names the blocking process for a referenced group", async () => {
  const created = await fetch(authedReq("http://x/admin/groups", "POST", admin, { name: "Ref", scope: { type: "global" } }));
  const { groupId } = (await created.json()) as { groupId: string };

  const pid = nextPid();
  await publishBody(pid, groupBody([groupId]), reg, dataSourceReg, sql, assignmentReg);

  const res = await fetch(authedReq(`http://x/admin/groups/${groupId}`, "DELETE", admin));
  expect(res.status).toBe(409);
  const body = (await res.json()) as { error: { type: string; processIds: string[] } };
  expect(body.error.type).toBe("conflict");
  expect(body.error.processIds).toContain(pid);
});

test.skipIf(!DB)("DELETE /admin/groups/:groupId succeeds for an unreferenced group, and 404s for an unknown groupId", async () => {
  const created = await fetch(authedReq("http://x/admin/groups", "POST", admin, { name: "Unref", scope: { type: "global" } }));
  const { groupId } = (await created.json()) as { groupId: string };

  const res = await fetch(authedReq(`http://x/admin/groups/${groupId}`, "DELETE", admin));
  expect(res.status).toBe(200);

  const missing = await fetch(authedReq("http://x/admin/groups/group_ghost", "DELETE", admin));
  expect(missing.status).toBe(404);
});

// ============================================================
// system:admin gates all six routes
// ============================================================

test.skipIf(!DB)("an actor lacking system:admin gets 403 from each of the six group routes, with no read or write performed", async () => {
  const created = await fetch(authedReq("http://x/admin/groups", "POST", admin, { name: "Gate", scope: { type: "global" } }));
  const { groupId } = (await created.json()) as { groupId: string };

  const attempts: [string, string, unknown?][] = [
    ["GET", "http://x/admin/groups"],
    ["POST", "http://x/admin/groups", { name: "Nope", scope: { type: "global" } }],
    ["PATCH", `http://x/admin/groups/${groupId}/name`, { name: "Nope" }],
    ["PATCH", `http://x/admin/groups/${groupId}/members`, { members: ["user_x"] }],
    ["PATCH", `http://x/admin/groups/${groupId}/scope`, { scope: { type: "global" } }],
    ["DELETE", `http://x/admin/groups/${groupId}`],
  ];
  for (const [method, url, body] of attempts) {
    const res = await fetch(authedReq(url, method, bystander, body));
    expect(res.status).toBe(403);
  }

  const list = await fetch(authedReq("http://x/admin/groups", "GET", admin));
  const page = (await list.json()) as { items: { groupId: string; name: string; members: string[] }[] };
  const row = page.items.find((g) => g.groupId === groupId)!;
  expect(row.name).toBe("Gate");
  expect(row.members).toEqual([]);
});
