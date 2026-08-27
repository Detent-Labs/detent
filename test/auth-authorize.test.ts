/**
 * requireRole gates process-admin operations against Actor.roles. Pure — no
 * DB, and so are the role-constant and export-canary tests below.
 *
 * can/requirePermission are the same seam's process-scoped half, and they are
 * NOT pure: the global-role test short-circuits with no query, but the
 * grant test opens one on every call that test doesn't win. Those tests sit
 * in their own DB-gated block near the bottom of this file.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql } from "../src/engine/store.js";
import { DB, initDb } from "./helpers/http-fixture.js";
import type { ProcessId } from "../src/schema/definition.js";
import {
  requireRole,
  can,
  requirePermission,
  AuthorizationError,
  PUBLISH_ROLE,
  CANCEL_ANY_ROLE,
  ADMIN_ROLE,
  DEVELOPER_ROLE,
  REPORTS_ROLE,
  DATALISTS_ROLE,
  TEMPLATES_ROLE,
  AUTHOR_ROLE,
  type Permission,
} from "../src/auth/authorize.js";
import * as authorize from "../src/auth/authorize.js";

beforeAll(initDb);
beforeEach(async () => {
  if (DB) await sql`TRUNCATE permission_grants`;
});

test("the reserved role constants carry their documented literal values", () => {
  expect(PUBLISH_ROLE).toBe("system:publish");
  expect(CANCEL_ANY_ROLE).toBe("system:cancel-any");
  expect(ADMIN_ROLE).toBe("system:admin");
  expect(DEVELOPER_ROLE).toBe("system:developer");
  expect(REPORTS_ROLE).toBe("system:reports");
  expect(DATALISTS_ROLE).toBe("system:datalists");
  expect(TEMPLATES_ROLE).toBe("system:templates");
  expect(AUTHOR_ROLE).toBe("system:author");
});

test("no authorization registry/plugin envelope exists alongside the fixed role checks", () => {
  // Canary for design.md's "checked directly, not an extension point": if this
  // module ever grows a createXRegistry/registerX/resolveX export (the
  // Registry/DataSourceRegistry pattern in engine/registry.ts), this fails.
  // `can`/`requirePermission` are the process-scoped seam and belong here;
  // PERMISSION_ROLE deliberately does not, since nothing outside may replace it.
  expect(Object.keys(authorize).sort()).toEqual([
    "ADMIN_ROLE",
    "AUTHOR_ROLE",
    "AuthorizationError",
    "CANCEL_ANY_ROLE",
    "DATALISTS_ROLE",
    "DEVELOPER_ROLE",
    "PUBLISH_ROLE",
    "REPORTS_ROLE",
    "TEMPLATES_ROLE",
    "can",
    "requirePermission",
    "requireRole",
  ]);
});

test("the admin role does not imply the other two", () => {
  expect(() => requireRole({ id: "user_1", roles: [ADMIN_ROLE] }, PUBLISH_ROLE)).toThrow(AuthorizationError);
  expect(() => requireRole({ id: "user_1", roles: [ADMIN_ROLE] }, CANCEL_ANY_ROLE)).toThrow(AuthorizationError);
});

test("the developer role implies nothing", () => {
  expect(() => requireRole({ id: "user_1", roles: [DEVELOPER_ROLE] }, PUBLISH_ROLE)).toThrow(AuthorizationError);
  expect(() => requireRole({ id: "user_1", roles: [DEVELOPER_ROLE] }, ADMIN_ROLE)).toThrow(AuthorizationError);
});

test("the reports role implies nothing", () => {
  expect(() => requireRole({ id: "user_1", roles: [REPORTS_ROLE] }, PUBLISH_ROLE)).toThrow(AuthorizationError);
  expect(() => requireRole({ id: "user_1", roles: [REPORTS_ROLE] }, ADMIN_ROLE)).toThrow(AuthorizationError);
  expect(() => requireRole({ id: "user_1", roles: [REPORTS_ROLE] }, DEVELOPER_ROLE)).toThrow(AuthorizationError);
});

test("no other reserved role implies the reports role", () => {
  for (const held of [ADMIN_ROLE, DEVELOPER_ROLE, PUBLISH_ROLE, CANCEL_ANY_ROLE]) {
    expect(() => requireRole({ id: "user_1", roles: [held] }, REPORTS_ROLE)).toThrow(AuthorizationError);
  }
});

test("the data list role implies nothing", () => {
  for (const wanted of [ADMIN_ROLE, DEVELOPER_ROLE, CANCEL_ANY_ROLE, PUBLISH_ROLE, REPORTS_ROLE]) {
    expect(() => requireRole({ id: "user_1", roles: [DATALISTS_ROLE] }, wanted)).toThrow(AuthorizationError);
  }
});

test("no other reserved role implies the data list role", () => {
  for (const held of [ADMIN_ROLE, DEVELOPER_ROLE, PUBLISH_ROLE, CANCEL_ANY_ROLE, REPORTS_ROLE]) {
    expect(() => requireRole({ id: "user_1", roles: [held] }, DATALISTS_ROLE)).toThrow(AuthorizationError);
  }
});

test("the template role implies nothing", () => {
  for (const wanted of [ADMIN_ROLE, DEVELOPER_ROLE, CANCEL_ANY_ROLE, PUBLISH_ROLE, REPORTS_ROLE, DATALISTS_ROLE]) {
    expect(() => requireRole({ id: "user_1", roles: [TEMPLATES_ROLE] }, wanted)).toThrow(AuthorizationError);
  }
});

test("no other reserved role implies the template role", () => {
  for (const held of [ADMIN_ROLE, DEVELOPER_ROLE, PUBLISH_ROLE, CANCEL_ANY_ROLE, REPORTS_ROLE, DATALISTS_ROLE]) {
    expect(() => requireRole({ id: "user_1", roles: [held] }, TEMPLATES_ROLE)).toThrow(AuthorizationError);
  }
});

test("the author role implies nothing", () => {
  for (const wanted of [ADMIN_ROLE, DEVELOPER_ROLE, CANCEL_ANY_ROLE, PUBLISH_ROLE, REPORTS_ROLE, DATALISTS_ROLE, TEMPLATES_ROLE]) {
    expect(() => requireRole({ id: "user_1", roles: [AUTHOR_ROLE] }, wanted)).toThrow(AuthorizationError);
  }
});

test("no other reserved role implies the author role", () => {
  for (const held of [ADMIN_ROLE, DEVELOPER_ROLE, PUBLISH_ROLE, CANCEL_ANY_ROLE, REPORTS_ROLE, DATALISTS_ROLE, TEMPLATES_ROLE]) {
    expect(() => requireRole({ id: "user_1", roles: [held] }, AUTHOR_ROLE)).toThrow(AuthorizationError);
  }
});

test("an actor carrying the required role passes", () => {
  expect(() => requireRole({ id: "user_1", roles: [PUBLISH_ROLE] }, PUBLISH_ROLE)).not.toThrow();
});

test("an actor missing the required role is rejected", () => {
  expect(() => requireRole({ id: "user_1", roles: ["employee"] }, PUBLISH_ROLE)).toThrow(AuthorizationError);
});

test("an actor with no roles at all is rejected", () => {
  expect(() => requireRole({ id: "user_1", roles: [] }, CANCEL_ANY_ROLE)).toThrow(AuthorizationError);
});

// The process-scoped seam. `can`'s first test is the global-role check and
// costs no query; every scenario below that expects `false`, or that holds
// no global role, reaches the grant store instead, which is why this whole
// block needs a database.
const PID_A = "proc_seam_a" as ProcessId;
const PID_B = "proc_seam_b" as ProcessId;

const writeGrant = async (role: string, permission: Permission, processId: ProcessId): Promise<void> => {
  await sql`INSERT INTO permission_grants (role, permission, scope) VALUES (${role}, ${permission}, ${{ type: "process", config: { processId } }})`;
};

test.skipIf(!DB)("each permission answers true for the role it maps to", async () => {
  expect(await can({ id: "user_1", roles: [PUBLISH_ROLE] }, "publish", PID_A, sql)).toBe(true);
  expect(await can({ id: "user_1", roles: [CANCEL_ANY_ROLE] }, "cancel", PID_A, sql)).toBe(true);
  expect(await can({ id: "user_1", roles: [DEVELOPER_ROLE] }, "migrate", PID_A, sql)).toBe(true);
});

test.skipIf(!DB)("each permission answers false for an actor missing that role, over a store holding no grant", async () => {
  expect(await can({ id: "user_1", roles: ["employee"] }, "publish", PID_A, sql)).toBe(false);
  expect(await can({ id: "user_1", roles: [] }, "cancel", PID_A, sql)).toBe(false);
  expect(await can({ id: "user_1", roles: ["employee"] }, "migrate", PID_A, sql)).toBe(false);
});

test.skipIf(!DB)("an admin-only actor answers true for read", async () => {
  expect(await can({ id: "user_1", roles: [ADMIN_ROLE] }, "read", PID_A, sql)).toBe(true);
});

test.skipIf(!DB)("a reports-only actor answers false for read", async () => {
  expect(await can({ id: "user_1", roles: [REPORTS_ROLE] }, "read", PID_A, sql)).toBe(false);
});

test.skipIf(!DB)("a read grant admits one process and refuses another", async () => {
  await writeGrant("hr-reporting", "read", PID_A);
  const actor = { id: "user_1", roles: ["hr-reporting"] };
  expect(await can(actor, "read", PID_A, sql)).toBe(true);
  expect(await can(actor, "read", PID_B, sql)).toBe(false);
});

test.skipIf(!DB)("no permission implies another", async () => {
  // Same rule the eight role constants hold: DEVELOPER_ROLE reaches migrate
  // and nothing else, so the map cannot quietly widen a grant.
  const developer = { id: "user_1", roles: [DEVELOPER_ROLE] };
  expect(await can(developer, "migrate", PID_A, sql)).toBe(true);
  expect(await can(developer, "publish", PID_A, sql)).toBe(false);
  expect(await can(developer, "cancel", PID_A, sql)).toBe(false);
  expect(await can(developer, "read", PID_A, sql)).toBe(false);
});

test.skipIf(!DB)("a grant admits one process and not another — the opposite of the pre-storage invariant that processId changed nothing", async () => {
  await writeGrant("finance-authors", "publish", PID_A);
  const actor = { id: "user_1", roles: ["finance-authors"] };
  expect(await can(actor, "publish", PID_A, sql)).toBe(true);
  expect(await can(actor, "publish", PID_B, sql)).toBe(false);
});

test.skipIf(!DB)("a grant admits one permission and not another", async () => {
  await writeGrant("finance-authors", "publish", PID_A);
  const actor = { id: "user_1", roles: ["finance-authors"] };
  expect(await can(actor, "cancel", PID_A, sql)).toBe(false);
});

test.skipIf(!DB)("a grant admits its role and not an actor holding a different one", async () => {
  await writeGrant("finance-authors", "publish", PID_A);
  const actor = { id: "user_1", roles: ["hr-authors"] };
  expect(await can(actor, "publish", PID_A, sql)).toBe(false);
});

test.skipIf(!DB)("one grant covers every holder of a role, since it names no account", async () => {
  // The whole point of granting to a role rather than an id: an operator
  // writes one row, and the directory decides who holds it.
  await writeGrant("finance-authors", "publish", PID_A);
  expect(await can({ id: "user_1", roles: ["finance-authors"] }, "publish", PID_A, sql)).toBe(true);
  expect(await can({ id: "user_2", roles: ["finance-authors"] }, "publish", PID_A, sql)).toBe(true);
});

test.skipIf(!DB)("a grant to a role nobody holds admits nobody", async () => {
  await writeGrant("role-nobody-holds", "publish", PID_A);
  expect(await can({ id: "user_1", roles: [] }, "publish", PID_A, sql)).toBe(false);
  expect(await can({ id: "user_2", roles: ["finance-authors"] }, "publish", PID_A, sql)).toBe(false);
});

test.skipIf(!DB)("a role string carries no scope", async () => {
  // The `@` fallback ROADMAP.md once named as a documented directory shape
  // was dropped 2026-08-16: a scope lives in the grant table alone, so a
  // role string that merely looks scoped matches no grant.
  const actor = { id: "user_1", roles: [`${PUBLISH_ROLE}@${PID_A}`] };
  expect(await can(actor, "publish", PID_A, sql)).toBe(false);
});

test.skipIf(!DB)("requirePermission throws where can answers false", async () => {
  await expect(requirePermission({ id: "user_1", roles: [] }, "cancel", PID_A, sql)).rejects.toThrow(AuthorizationError);
  await expect(requirePermission({ id: "user_1", roles: [DEVELOPER_ROLE] }, "publish", PID_A, sql)).rejects.toThrow(AuthorizationError);
});

test.skipIf(!DB)("requirePermission returns where can answers true", async () => {
  await expect(requirePermission({ id: "user_1", roles: [PUBLISH_ROLE] }, "publish", PID_A, sql)).resolves.toBeUndefined();
  await expect(requirePermission({ id: "user_1", roles: [DEVELOPER_ROLE] }, "migrate", PID_A, sql)).resolves.toBeUndefined();
});

test.skipIf(!DB)("requirePermission names the role an operator must grant", async () => {
  // The message keeps requireRole's "lacks required role 'X'" prefix, so a
  // grep over logs still finds both, and adds the process the gate named.
  await expect(requirePermission({ id: "user_1", roles: [] }, "publish", PID_A, sql)).rejects.toThrow(
    /lacks required role 'system:publish' for process 'proc_seam_a'/,
  );
});
