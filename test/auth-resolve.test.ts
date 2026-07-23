/**
 * ActorResolver extension point + the non-production dev header-based
 * resolver. Pure — no DB.
 */
import { test, expect } from "bun:test";
import { devHeaderResolver, ActorResolutionError } from "../src/auth/resolve.js";

test("valid headers resolve to the expected Actor", async () => {
  const actor = await devHeaderResolver({ actorIdHeader: "user_1", actorRolesHeader: "employee,finance-approver" });
  expect(actor).toEqual({ id: "user_1", roles: ["employee", "finance-approver"] });
});

test("a missing actor-id header throws ActorResolutionError", async () => {
  let caught: unknown;
  try {
    await devHeaderResolver({ actorIdHeader: undefined, actorRolesHeader: "employee" });
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(ActorResolutionError);
});

test("an empty actor-id header throws ActorResolutionError", async () => {
  let caught: unknown;
  try {
    await devHeaderResolver({ actorIdHeader: "", actorRolesHeader: "employee" });
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(ActorResolutionError);
});

test("a missing roles header resolves to an empty roles array", async () => {
  const actor = await devHeaderResolver({ actorIdHeader: "user_1", actorRolesHeader: undefined });
  expect(actor).toEqual({ id: "user_1", roles: [] });
});

test("a single role with no comma resolves to a one-element array", async () => {
  const actor = await devHeaderResolver({ actorIdHeader: "user_1", actorRolesHeader: "employee" });
  expect(actor.roles).toEqual(["employee"]);
});
