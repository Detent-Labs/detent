/**
 * `process-access-roles`: `matchesAccessList`'s four scenarios under
 * "Matching a principal resolves from the actor's credential", plus
 * `addAccessPrincipal`/`deleteAccessPrincipal`'s seven scenarios under "A
 * Developer manages the Developer and Owner lists" and "An Owner manages the
 * Reader list". DB-backed — skips when DATABASE_URL is unset.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema } from "../src/engine/store.js";
import { createGroup, setGroupMembers } from "../src/auth/groups.js";
import { DEVELOPER_ROLE, OWNER_ROLE, ADMIN_ROLE, AuthorizationError } from "../src/auth/authorize.js";
import { matchesAccessList, addAccessPrincipal, deleteAccessPrincipal } from "../src/auth/process-access.js";
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

async function listPrincipals(processId: ProcessId, kind: "developer" | "owner" | "reader"): Promise<string[]> {
  const rows = (await sql`SELECT principal FROM process_access_roles WHERE process_id = ${processId} AND kind = ${kind}`) as { principal: string }[];
  return rows.map((r) => r.principal);
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

test.skipIf(!DB)("a listed Developer edits the Developer list", async () => {
  const processId = pid();
  await addToList(processId, "developer", "user_dev");
  const dev: Actor = { id: "user_dev", roles: [DEVELOPER_ROLE] };

  await addAccessPrincipal(dev, processId, "developer", "user_new", sql);
  expect(await listPrincipals(processId, "developer")).toContain("user_new");

  await deleteAccessPrincipal(dev, processId, "developer", "user_new", sql);
  expect(await listPrincipals(processId, "developer")).not.toContain("user_new");
});

test.skipIf(!DB)("a listed Developer edits the Owner list", async () => {
  const processId = pid();
  await addToList(processId, "developer", "user_dev");
  const dev: Actor = { id: "user_dev", roles: [DEVELOPER_ROLE] };

  await addAccessPrincipal(dev, processId, "owner", "user_owner", sql);
  expect(await listPrincipals(processId, "owner")).toContain("user_owner");

  await deleteAccessPrincipal(dev, processId, "owner", "user_owner", sql);
  expect(await listPrincipals(processId, "owner")).not.toContain("user_owner");
});

test.skipIf(!DB)("the engine refuses an unlisted actor", async () => {
  const processId = pid();
  const stranger: Actor = { id: "user_stranger", roles: [] };

  await expect(addAccessPrincipal(stranger, processId, "developer", "user_new", sql)).rejects.toThrow(AuthorizationError);
  await expect(addAccessPrincipal(stranger, processId, "owner", "user_new", sql)).rejects.toThrow(AuthorizationError);
});

test.skipIf(!DB)("an admin edits either list unconditionally", async () => {
  const processId = pid();
  const admin: Actor = { id: "user_admin", roles: [ADMIN_ROLE] };

  await addAccessPrincipal(admin, processId, "developer", "user_new_dev", sql);
  expect(await listPrincipals(processId, "developer")).toContain("user_new_dev");
  await deleteAccessPrincipal(admin, processId, "developer", "user_new_dev", sql);
  expect(await listPrincipals(processId, "developer")).not.toContain("user_new_dev");

  await addAccessPrincipal(admin, processId, "owner", "user_new_owner", sql);
  expect(await listPrincipals(processId, "owner")).toContain("user_new_owner");
  await deleteAccessPrincipal(admin, processId, "owner", "user_new_owner", sql);
  expect(await listPrincipals(processId, "owner")).not.toContain("user_new_owner");
});

test.skipIf(!DB)("a listed Owner edits the Reader list", async () => {
  const processId = pid();
  await addToList(processId, "owner", "user_owner");
  const owner: Actor = { id: "user_owner", roles: [OWNER_ROLE] };

  await addAccessPrincipal(owner, processId, "reader", "user_reader", sql);
  expect(await listPrincipals(processId, "reader")).toContain("user_reader");

  await deleteAccessPrincipal(owner, processId, "reader", "user_reader", sql);
  expect(await listPrincipals(processId, "reader")).not.toContain("user_reader");
});

test.skipIf(!DB)("the engine refuses a Developer holding no Owner entry", async () => {
  const processId = pid();
  await addToList(processId, "developer", "user_dev");
  const dev: Actor = { id: "user_dev", roles: [DEVELOPER_ROLE] };

  await expect(addAccessPrincipal(dev, processId, "reader", "user_reader", sql)).rejects.toThrow(AuthorizationError);
});

test.skipIf(!DB)("an admin edits the Reader list unconditionally", async () => {
  const processId = pid();
  const admin: Actor = { id: "user_admin", roles: [ADMIN_ROLE] };

  await addAccessPrincipal(admin, processId, "reader", "user_reader", sql);
  expect(await listPrincipals(processId, "reader")).toContain("user_reader");
});
