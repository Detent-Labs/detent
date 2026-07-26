/**
 * requireRole gates process-admin operations against Actor.roles. Pure — no DB.
 */
import { test, expect } from "bun:test";
import { requireRole, AuthorizationError, PUBLISH_ROLE, CANCEL_ANY_ROLE } from "../src/auth/authorize.js";
import * as authorize from "../src/auth/authorize.js";

test("the reserved role constants carry their documented literal values", () => {
  expect(PUBLISH_ROLE).toBe("system:publish");
  expect(CANCEL_ANY_ROLE).toBe("system:cancel-any");
});

test("no authorization registry/plugin envelope exists alongside the two fixed role checks", () => {
  // Canary for design.md's "checked directly, not an extension point": if this
  // module ever grows a createXRegistry/registerX/resolveX export (the
  // Registry/DataSourceRegistry pattern in engine/registry.ts), this fails.
  expect(Object.keys(authorize).sort()).toEqual(["AuthorizationError", "CANCEL_ANY_ROLE", "PUBLISH_ROLE", "requireRole"]);
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
