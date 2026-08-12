/**
 * ActorResolver extension point + the non-production dev header-based
 * resolver. Pure — no DB. The credential is the request's `Headers`.
 */
import type { SQL } from "bun";
import { test, expect } from "bun:test";
import { devHeaderResolver, ActorResolutionError } from "../src/auth/resolve.js";

/**
 * These suites are pure: no resolver under test here reads a database except
 * through an injected `isActiveAccount`, which the cases below supply
 * themselves. The handle is a stand-in that satisfies the required parameter.
 */
const noDb = (() => Promise.resolve([])) as unknown as SQL;


function headers(entries: Record<string, string>): Headers {
  const h = new Headers();
  for (const [k, v] of Object.entries(entries)) h.set(k, v);
  return h;
}

test("valid headers resolve to the expected Actor", async () => {
  const actor = await devHeaderResolver(headers({ "X-Actor-Id": "user_1", "X-Actor-Roles": "employee,finance-approver" }), noDb);
  expect(actor).toEqual({ id: "user_1", roles: ["employee", "finance-approver"] });
});

test("a missing actor-id header throws ActorResolutionError", async () => {
  let caught: unknown;
  try {
    await devHeaderResolver(headers({ "X-Actor-Roles": "employee" }), noDb);
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(ActorResolutionError);
});

test("a missing roles header resolves to an empty roles array", async () => {
  const actor = await devHeaderResolver(headers({ "X-Actor-Id": "user_1" }), noDb);
  expect(actor).toEqual({ id: "user_1", roles: [] });
});

test("a single role with no comma resolves to a one-element array", async () => {
  const actor = await devHeaderResolver(headers({ "X-Actor-Id": "user_1", "X-Actor-Roles": "employee" }), noDb);
  expect(actor.roles).toEqual(["employee"]);
});
