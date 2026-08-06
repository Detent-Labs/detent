/**
 * Server wiring/configuration: `resolveAuthResolver`/`parseAuthIssuers`
 * (env -> resolver selection) and `createServer`'s conditional `/auth/login`
 * registration + CORS preflight, and the "JWT resolver active" route
 * behavior (401 without a token, 200 with one, legacy headers no longer
 * accepted, /auth/login 404 without a signing key).
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema } from "../src/engine/store.js";
import { createUser, setRolesById } from "../src/auth/users.js";
import { devHeaderResolver } from "../src/auth/resolve.js";
import { createServer, resolveAuthResolver, parseAuthIssuers } from "../src/http/server.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import { PUBLISH_ROLE, ADMIN_ROLE } from "../src/auth/authorize.js";

const DB = !!process.env.DATABASE_URL;
const SECRET = "auth-server-test-secret-0123456789"; // >= 32 encoded bytes, required by resolveAuthResolver
const reg = createRegistry();
const dataSourceReg = createDataSourceRegistry();

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE auth_users, outbox, instances, history_entries, instance_events, definitions`;
});

// ============================================================
// resolveAuthResolver / parseAuthIssuers
// ============================================================

test("no auth env and no flag fails startup", () => {
  expect(() => resolveAuthResolver({})).toThrow();
});

test("ALLOW_INSECURE_DEV_AUTH=1 selects the dev resolver, with no other auth env set, and warns loudly", () => {
  // Plain reassignment, not a mocking library — this repo has no mocking of
  // the system under test anywhere, and that stays true here: only the
  // console output is captured, no collaborator of resolveAuthResolver is
  // replaced. `log.warn` (add-observability) writes through `console.log`,
  // not `console.warn` — see src/log.ts's doc comment.
  const originalLog = console.log;
  let warned: unknown;
  console.log = (msg: unknown) => {
    warned = msg;
  };
  try {
    expect(resolveAuthResolver({ ALLOW_INSECURE_DEV_AUTH: "1" })).toBe(devHeaderResolver);
  } finally {
    console.log = originalLog;
  }
  expect(typeof warned).toBe("string");
  const parsed = JSON.parse(warned as string);
  expect(parsed.level).toBe("warn");
  expect(parsed.msg).toContain("X-Actor-Id");
  expect(parsed.msg).toContain("X-Actor-Roles");
  expect((parsed.msg as string).toLowerCase()).toContain("disabled");
});

test("AUTH_JWT_SECRET shorter than 32 encoded bytes fails startup", () => {
  expect(() => resolveAuthResolver({ AUTH_JWT_SECRET: "a".repeat(31) })).toThrow();
});

test("AUTH_JWT_SECRET of exactly 32 encoded bytes is accepted", () => {
  expect(resolveAuthResolver({ AUTH_JWT_SECRET: "a".repeat(32) })).not.toBe(devHeaderResolver);
});

test("AUTH_JWT_SECRET alone activates the JWT resolver", () => {
  expect(resolveAuthResolver({ AUTH_JWT_SECRET: SECRET })).not.toBe(devHeaderResolver);
});

test("AUTH_ISSUERS alone activates the JWT resolver", () => {
  const issuers = JSON.stringify([{ iss: "https://idp", jwksUrl: "https://idp/jwks", audience: "aud", rolesClaim: "roles" }]);
  expect(resolveAuthResolver({ AUTH_ISSUERS: issuers })).not.toBe(devHeaderResolver);
});

test("malformed AUTH_ISSUERS fails startup", () => {
  expect(() => resolveAuthResolver({ AUTH_ISSUERS: "not json" })).toThrow();
  expect(() => resolveAuthResolver({ AUTH_ISSUERS: "{}" })).toThrow();
  expect(() => resolveAuthResolver({ AUTH_ISSUERS: JSON.stringify([{ iss: "x" }]) })).toThrow();
});

test("parseAuthIssuers returns undefined for unset/empty", () => {
  expect(parseAuthIssuers(undefined)).toBeUndefined();
  expect(parseAuthIssuers("")).toBeUndefined();
  expect(parseAuthIssuers("   ")).toBeUndefined();
});

// ============================================================
// createServer: conditional /auth/login + CORS preflight
// ============================================================

test.skipIf(!DB)("/auth/login is 404 without a signing key", async () => {
  const fetch = createServer(dataSourceReg, reg, sql, devHeaderResolver);
  const res = await fetch(new Request("http://x/auth/login", { method: "POST", body: JSON.stringify({ email: "a", password: "b" }) }));
  expect(res.status).toBe(404);
});

test.skipIf(!DB)("/auth/login exists and answers preflight when a signing key is configured", async () => {
  const resolver = resolveAuthResolver({ AUTH_JWT_SECRET: SECRET });
  const fetch = createServer(dataSourceReg, reg, sql, resolver, "*", SECRET);

  const preflight = await fetch(new Request("http://x/auth/login", { method: "OPTIONS", headers: { Origin: "http://example.com" } }));
  expect(preflight.status).toBe(204);
  expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe("*");

  await createUser("server-test@example.com", "correct-horse", []);
  const res = await fetch(
    new Request("http://x/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "server-test@example.com", password: "correct-horse" }),
    }),
  );
  expect(res.status).toBe(200);
});

// ============================================================
// JWT resolver active: route behavior
// ============================================================

test.skipIf(!DB)("with the JWT resolver active, a route with no token is 401 with error.type actor-resolution", async () => {
  const resolver = resolveAuthResolver({ AUTH_JWT_SECRET: SECRET });
  const fetch = createServer(dataSourceReg, reg, sql, resolver);
  const res = await fetch(new Request("http://x/instances/inst_nonexistent"));
  expect(res.status).toBe(401);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("actor-resolution");
});

test.skipIf(!DB)("with the JWT resolver active, X-Actor-Id alone is 401", async () => {
  const resolver = resolveAuthResolver({ AUTH_JWT_SECRET: SECRET });
  const fetch = createServer(dataSourceReg, reg, sql, resolver);
  const res = await fetch(new Request("http://x/instances/inst_nonexistent", { headers: { "X-Actor-Id": "user_1" } }));
  expect(res.status).toBe(401);
});

test.skipIf(!DB)("with the JWT resolver active, a valid token reaches the route (200)", async () => {
  const resolver = resolveAuthResolver({ AUTH_JWT_SECRET: SECRET });
  const fetch = createServer(dataSourceReg, reg, sql, resolver, undefined, SECRET);
  await createUser("route-test@example.com", "correct-horse", [PUBLISH_ROLE]);
  const loginRes = await fetch(
    new Request("http://x/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "route-test@example.com", password: "correct-horse" }),
    }),
  );
  const { token } = (await loginRes.json()) as { token: string };
  const body = {
    key: "auth_server_route_test",
    label: { en: "Route Test" },
    baseLocale: "en",
    fields: [],
    workflow: {
      initialStep: "step_a",
      steps: [{ id: "step_a", key: "a", label: { en: "A" }, type: "task", terminal: true }],
    },
  };
  const res = await fetch(
    new Request("http://x/processes", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ processId: "proc_auth_server_route_test", body }),
    }),
  );
  expect(res.status).toBe(200);
});

// A role granted over PATCH /admin/users/:id/roles reaches the roles claim at
// the next login only. Token verification does read the account behind a
// locally issued token now (harden-local-account-sessions), but it reads only
// whether that account is live: `Actor.roles` still comes from the token's own
// claim, so an already-issued token keeps the roles it was signed with.
test.skipIf(!DB)("a token issued before a grant keeps its old roles, and the next login carries the new ones", async () => {
  const resolver = resolveAuthResolver({ AUTH_JWT_SECRET: SECRET });
  const fetch = createServer(dataSourceReg, reg, sql, resolver, undefined, SECRET);
  const login = async (): Promise<string> => {
    const res = await fetch(
      new Request("http://x/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "grantee@example.com", password: "correct-horse" }),
      }),
    );
    return ((await res.json()) as { token: string }).token;
  };

  const { userId } = await createUser("grantee@example.com", "correct-horse", []);
  const staleToken = await login();

  await setRolesById(userId, [ADMIN_ROLE]);

  const stale = await fetch(new Request("http://x/admin/users", { headers: { Authorization: `Bearer ${staleToken}` } }));
  expect(stale.status).toBe(403);

  const freshToken = await login();
  const fresh = await fetch(new Request("http://x/admin/users", { headers: { Authorization: `Bearer ${freshToken}` } }));
  expect(fresh.status).toBe(200);
});

// GET /instances, GET /instances/:id/record, GET /processes and GET
// /processes/:id/versions used to bypass the resolver entirely (routes.ts
// handlers took no ActorResolver at all) — found in code review and fixed by
// threading resolveActor through all four. Regression coverage below.
test.skipIf(!DB)("with the JWT resolver active, the four list/record routes reject a request with no token", async () => {
  const resolver = resolveAuthResolver({ AUTH_JWT_SECRET: SECRET });
  const fetch = createServer(dataSourceReg, reg, sql, resolver);

  const routes = ["/instances", "/instances/inst_nonexistent/record", "/processes", "/processes/proc_nonexistent/versions"];
  for (const path of routes) {
    const res = await fetch(new Request(`http://x${path}`));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { type: string } };
    expect(body.error.type).toBe("actor-resolution");
  }
});

test.skipIf(!DB)("with the JWT resolver active, the four list/record routes succeed with a valid token", async () => {
  const resolver = resolveAuthResolver({ AUTH_JWT_SECRET: SECRET });
  const fetch = createServer(dataSourceReg, reg, sql, resolver, undefined, SECRET);
  // system:admin is required for /instances (omitted scope) and /instances/:id/record
  // since admin-shell-and-ops; this test is about the resolver/route wiring, not scope.
  await createUser("list-routes-test@example.com", "correct-horse", [ADMIN_ROLE]);
  const loginRes = await fetch(
    new Request("http://x/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "list-routes-test@example.com", password: "correct-horse" }),
    }),
  );
  const { token } = (await loginRes.json()) as { token: string };
  const authHeaders = { Authorization: `Bearer ${token}` };

  const routes = ["/instances", "/instances/inst_nonexistent/record", "/processes", "/processes/proc_nonexistent/versions"];
  for (const path of routes) {
    const res = await fetch(new Request(`http://x${path}`, { headers: authHeaders }));
    expect(res.status).toBe(200);
  }
});
