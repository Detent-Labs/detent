/**
 * requireRole gates process-admin operations against Actor.roles. Pure — no DB.
 * can/requirePermission are the same check behind a process-scoped seam.
 */
import { test, expect } from "bun:test";
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
} from "../src/auth/authorize.js";
import * as authorize from "../src/auth/authorize.js";

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

// The process-scoped seam. `can`'s body is the global-role check that already
// ships, so these assert the mapping and the one property that outlives it:
// the processId argument changes nothing today.
const PID_A = "proc_seam_a" as ProcessId;
const PID_B = "proc_seam_b" as ProcessId;

test("each permission answers true for the role it maps to", () => {
  expect(can({ id: "user_1", roles: [PUBLISH_ROLE] }, "publish", PID_A)).toBe(true);
  expect(can({ id: "user_1", roles: [CANCEL_ANY_ROLE] }, "cancel", PID_A)).toBe(true);
  expect(can({ id: "user_1", roles: [DEVELOPER_ROLE] }, "migrate", PID_A)).toBe(true);
});

test("each permission answers false for an actor missing that role", () => {
  expect(can({ id: "user_1", roles: ["employee"] }, "publish", PID_A)).toBe(false);
  expect(can({ id: "user_1", roles: [] }, "cancel", PID_A)).toBe(false);
  expect(can({ id: "user_1", roles: ["employee"] }, "migrate", PID_A)).toBe(false);
});

test("no permission implies another", () => {
  // Same rule the eight role constants hold: DEVELOPER_ROLE reaches migrate
  // and nothing else, so the map cannot quietly widen a grant.
  const developer = { id: "user_1", roles: [DEVELOPER_ROLE] };
  expect(can(developer, "migrate", PID_A)).toBe(true);
  expect(can(developer, "publish", PID_A)).toBe(false);
  expect(can(developer, "cancel", PID_A)).toBe(false);
});

test("the processId argument does not change the answer", () => {
  // The seam's whole invariant while no grant carries a scope. A future
  // scoped implementation is what makes this test meaningful to change.
  for (const permission of ["publish", "cancel", "migrate"] as const) {
    for (const roles of [[PUBLISH_ROLE], [CANCEL_ANY_ROLE], [DEVELOPER_ROLE], []]) {
      const actor = { id: "user_1", roles };
      expect(can(actor, permission, PID_A)).toBe(can(actor, permission, PID_B));
    }
  }
});

test("requirePermission throws where can answers false", () => {
  expect(() => requirePermission({ id: "user_1", roles: [] }, "cancel", PID_A)).toThrow(AuthorizationError);
  expect(() => requirePermission({ id: "user_1", roles: [DEVELOPER_ROLE] }, "publish", PID_A)).toThrow(AuthorizationError);
});

test("requirePermission returns where can answers true", () => {
  expect(() => requirePermission({ id: "user_1", roles: [PUBLISH_ROLE] }, "publish", PID_A)).not.toThrow();
  expect(() => requirePermission({ id: "user_1", roles: [DEVELOPER_ROLE] }, "migrate", PID_A)).not.toThrow();
});

test("requirePermission names the role an operator must grant", () => {
  // The message keeps requireRole's "lacks required role 'X'" prefix, so a
  // grep over logs still finds both, and adds the process the gate named.
  expect(() => requirePermission({ id: "user_1", roles: [] }, "publish", PID_A)).toThrow(
    /lacks required role 'system:publish' for process 'proc_seam_a'/,
  );
});
