/**
 * Rollout migration for process-access-roles: backfillProcessAccessRoles seeds
 * every existing process's Developer list from global roles. DB-backed, skips
 * when DATABASE_URL is unset.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema } from "../src/engine/store.js";
import { backfillProcessAccessRoles } from "../scripts/backfill-process-access-roles.js";
import { createUser } from "../src/auth/users.js";
import { DEVELOPER_ROLE, AUTHOR_ROLE } from "../src/auth/authorize.js";
import { matchesAccessList } from "../src/auth/process-access.js";
import type { ProcessId } from "../src/schema/definition.js";
import type { Actor } from "../src/cel/eval.js";

const DB = !!process.env.DATABASE_URL;

let n = 0;
const pid = (): ProcessId => `proc_backfill_${++n}` as ProcessId;

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE drafts, definitions, process_access_roles, auth_users CASCADE`;
});

test.skipIf(!DB)("an existing process keeps every current author's access", async () => {
  const processId = pid();
  await sql`INSERT INTO drafts (process_id, body, layout, revision, updated_by, updated_at)
    VALUES (${processId}, '{}', '{}', 0, 'user_seed', now())`;

  const dev1 = await createUser("dev1@example.com", "x", [DEVELOPER_ROLE]);
  const dev2 = await createUser("dev2@example.com", "x", [DEVELOPER_ROLE]);
  const author1 = await createUser("author1@example.com", "x", [AUTHOR_ROLE]);
  const bystander = await createUser("bystander@example.com", "x", []);

  await backfillProcessAccessRoles(sql);

  const dev1Actor: Actor = { id: dev1.userId, roles: [DEVELOPER_ROLE] };
  expect(await matchesAccessList(dev1Actor, processId, "developer", sql)).toBe(true);

  const dev2Actor: Actor = { id: dev2.userId, roles: [DEVELOPER_ROLE] };
  expect(await matchesAccessList(dev2Actor, processId, "developer", sql)).toBe(true);

  const author1Actor: Actor = { id: author1.userId, roles: [AUTHOR_ROLE] };
  expect(await matchesAccessList(author1Actor, processId, "developer", sql)).toBe(true);

  const bystanderActor: Actor = { id: bystander.userId, roles: [] };
  expect(await matchesAccessList(bystanderActor, processId, "developer", sql)).toBe(false);
});

test.skipIf(!DB)("a second migration run changes nothing", async () => {
  const processId = pid();
  await sql`INSERT INTO drafts (process_id, body, layout, revision, updated_by, updated_at)
    VALUES (${processId}, '{}', '{}', 0, 'user_seed', now())`;
  await createUser("dev1@example.com", "x", [DEVELOPER_ROLE]);

  await backfillProcessAccessRoles(sql);
  const before = (await sql`SELECT * FROM process_access_roles ORDER BY principal`) as unknown[];

  await backfillProcessAccessRoles(sql);
  const after = (await sql`SELECT * FROM process_access_roles ORDER BY principal`) as unknown[];

  expect(after).toEqual(before);
});
