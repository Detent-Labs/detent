/**
 * `process-access-roles`, "Matching a principal resolves from the actor's
 * credential": `matchesAccessList`'s four scenarios. DB-backed — skips when
 * DATABASE_URL is unset.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema } from "../src/engine/store.js";
import { createGroup, setGroupMembers } from "../src/auth/groups.js";
import { DEVELOPER_ROLE, OWNER_ROLE } from "../src/auth/authorize.js";
import { matchesAccessList } from "../src/auth/process-access.js";
import type { ProcessId } from "../src/schema/definition.js";
import type { Actor } from "../src/cel/eval.js";

const DB = !!process.env.DATABASE_URL;

let n = 0;
const pid = (): ProcessId => `proc_access_${++n}` as ProcessId;

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE process_access_roles, groups`;
});

async function addToList(processId: ProcessId, kind: "developer" | "owner" | "reader", principal: string) {
  await sql`INSERT INTO process_access_roles (process_id, kind, principal) VALUES (${processId}, ${kind}, ${principal})`;
}

test.skipIf(!DB)("a Developer-list group entry filters by role", async () => {
  const processId = pid();
  const group = await createGroup("devs", { type: "global" }, sql);
  await setGroupMembers(group.groupId, ["user_has_role", "user_no_role"], sql);
  await addToList(processId, "developer", group.groupId);

  const hasRole: Actor = { id: "user_has_role", roles: [DEVELOPER_ROLE] };
  const noRole: Actor = { id: "user_no_role", roles: [] };

  expect(await matchesAccessList(hasRole, processId, "developer")).toBe(true);
  expect(await matchesAccessList(noRole, processId, "developer")).toBe(false);
});

test.skipIf(!DB)("an Owner-list group entry filters by role", async () => {
  const processId = pid();
  const group = await createGroup("owners", { type: "global" }, sql);
  await setGroupMembers(group.groupId, ["user_has_role", "user_no_role"], sql);
  await addToList(processId, "owner", group.groupId);

  const hasRole: Actor = { id: "user_has_role", roles: [OWNER_ROLE] };
  const noRole: Actor = { id: "user_no_role", roles: [] };

  expect(await matchesAccessList(hasRole, processId, "owner")).toBe(true);
  expect(await matchesAccessList(noRole, processId, "owner")).toBe(false);
});

test.skipIf(!DB)("a Reader-list entry does not need a role", async () => {
  const processId = pid();
  await addToList(processId, "reader", "user_plain");

  const plain: Actor = { id: "user_plain", roles: [] };

  expect(await matchesAccessList(plain, processId, "reader")).toBe(true);
});

test.skipIf(!DB)("Reader access follows live group membership", async () => {
  const processId = pid();
  const group = await createGroup("readers", { type: "global" }, sql);
  await addToList(processId, "reader", group.groupId);

  const actor: Actor = { id: "user_late_joiner", roles: [] };
  expect(await matchesAccessList(actor, processId, "reader")).toBe(false);

  await setGroupMembers(group.groupId, ["user_late_joiner"], sql);
  expect(await matchesAccessList(actor, processId, "reader")).toBe(true);

  const rows = (await sql`SELECT principal FROM process_access_roles WHERE process_id = ${processId} AND kind = 'reader'`) as { principal: string }[];
  expect(rows.map((r) => r.principal)).toEqual([group.groupId]);
});
