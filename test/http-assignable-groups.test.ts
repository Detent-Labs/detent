/**
 * `GET /drafts/:processId/assignable-groups` and `listGroupsPermitting`.
 * The statement is driven through `publishBody` too, since `validateGroupScope`
 * is not exported: both must agree on global, listed, unlisted and empty-list
 * scopes. DB-backed, skips when DATABASE_URL is unset.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql } from "../src/engine/store.js";
import { DB, initDb, authedReq } from "./helpers/http-fixture.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import { createServer } from "../src/http/server.js";
import { devHeaderResolver } from "../src/auth/resolve.js";
import { DEVELOPER_ROLE, ADMIN_ROLE, AUTHOR_ROLE, CREATE_ROLE } from "../src/auth/authorize.js";
import { createGroup } from "../src/auth/groups.js";
import { listGroupsPermitting } from "../src/auth/groups.js";
import { publishBody, GroupScopeValidationError } from "../src/engine/definitions.js";
import type { ProcessBody, ProcessId } from "../src/schema/definition.js";
import type { Actor } from "../src/cel/eval.js";
import { clearInstanceAudit } from "./audit-cleanup.js";

const reg = createRegistry();
const dataSourceReg = createDataSourceRegistry();
const fetch = createServer(dataSourceReg, reg, sql, devHeaderResolver);

beforeAll(initDb);
beforeEach(async () => {
  if (!DB) return;
  await sql`TRUNCATE outbox, instances, definitions, drafts, groups, process_access_roles`;
  await clearInstanceAudit();
});

const admin: Actor = { id: "user_admin", roles: [ADMIN_ROLE] };
const developer: Actor = { id: "user_dev", roles: [DEVELOPER_ROLE, CREATE_ROLE] };
const author: Actor = { id: "user_author", roles: [AUTHOR_ROLE, CREATE_ROLE] };
const bystander: Actor = { id: "user_bystander", roles: [] };

const bodyWithGroups = (allowedGroups: string[]): ProcessBody =>
  ({
    key: "wf",
    label: { en: "Wf" },
    baseLocale: "en",
    fields: [],
    allowedGroups,
    workflow: { initialStep: "step_s", steps: [{ id: "step_s", key: "s", label: { en: "S" }, type: "task", terminal: true }] },
  }) as unknown as ProcessBody;

async function publishes(processId: string, groupId: string): Promise<boolean> {
  try {
    await publishBody(processId as ProcessId, bodyWithGroups([groupId]), reg, dataSourceReg);
    return true;
  } catch (err) {
    if (err instanceof GroupScopeValidationError) return false;
    throw err;
  }
}

test.skipIf(!DB)("listGroupsPermitting orders by name and agrees with publish on global, listed, unlisted and empty-list scopes", async () => {
  const global = await createGroup("Delta", { type: "global" });
  const listed = await createGroup("Alpha", { type: "processes", processIds: ["proc_x", "proc_other"] });
  const unlisted = await createGroup("Bravo", { type: "processes", processIds: ["proc_other"] });
  const empty = await createGroup("Charlie", { type: "processes", processIds: [] });

  const forX = await listGroupsPermitting("proc_x");
  expect(forX).toEqual([
    { groupId: listed.groupId, name: "Alpha" },
    { groupId: global.groupId, name: "Delta" },
  ]);
  expect(await listGroupsPermitting("proc_y")).toEqual([{ groupId: global.groupId, name: "Delta" }]);

  const ids = new Set(forX.map((g) => g.groupId));
  for (const g of [global, listed, unlisted, empty]) {
    expect(await publishes("proc_x", g.groupId)).toBe(ids.has(g.groupId));
  }
});

const url = (processId: string) => `http://x/drafts/${processId}/assignable-groups`;
const get = (actor: Actor, processId: string) => fetch(authedReq(url(processId), "GET", actor));

async function seedDraft(processId: string): Promise<void> {
  const res = await fetch(
    authedReq(`http://x/drafts/${processId}`, "PUT", developer, {
      body: { key: "wf", label: { en: "Wf" }, baseLocale: "en", fields: [], workflow: { initialStep: "s", steps: [{ id: "s", key: "s", label: { en: "S" }, type: "task" }] } },
      layout: {},
      revision: 0,
    }),
  );
  expect(res.status).toBe(200);
  await sql`INSERT INTO process_access_roles (process_id, kind, principal) VALUES (${processId}, ${"developer"}, ${developer.id}) ON CONFLICT DO NOTHING`;
}

test.skipIf(!DB)("200 with groupId and name alone", async () => {
  await seedDraft("proc_ag_1");
  const g = await createGroup("Finance", { type: "global" });
  const res = await get(developer, "proc_ag_1");
  expect(res.status).toBe(200);
  const body = (await res.json()) as { groups: Record<string, unknown>[] };
  expect(body).toEqual({ groups: [{ groupId: g.groupId, name: "Finance" }] });
  expect(Object.keys(body.groups[0]!).sort()).toEqual(["groupId", "name"]);
});

test.skipIf(!DB)("401 with no credential", async () => {
  await seedDraft("proc_ag_2");
  expect((await fetch(new Request(url("proc_ag_2")))).status).toBe(401);
});

test.skipIf(!DB)("403 for a participant and for an author outside the Developer list", async () => {
  await seedDraft("proc_ag_3");
  expect((await get(bystander, "proc_ag_3")).status).toBe(403);
  expect((await get(author, "proc_ag_3")).status).toBe(403);
});

test.skipIf(!DB)("an admin reads a process with a draft", async () => {
  await seedDraft("proc_ag_4");
  expect((await get(admin, "proc_ag_4")).status).toBe(200);
});

test.skipIf(!DB)("404 for an author on a process with no draft, 403 for an admin-only actor there", async () => {
  expect((await get(author, "proc_ag_none")).status).toBe(404);
  expect((await get(admin, "proc_ag_none")).status).toBe(403);
});
