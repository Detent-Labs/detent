/**
 * `POST /auth/login` (`src/auth/login.ts`), exercised through a real
 * `createServer` instance wired to the JWT resolver — proves the issued
 * token actually authenticates a subsequent route, not just that `jwt.ts`
 * verifies a hand-signed token in isolation (see test/auth-jwt.test.ts).
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema } from "../src/engine/store.js";
import { createUser } from "../src/auth/users.js";
import { jwtResolver } from "../src/auth/jwt.js";
import { handleLogin } from "../src/auth/login.js";
import { createServer } from "../src/http/server.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import type { ProcessBody } from "../src/schema/definition.js";

const DB = !!process.env.DATABASE_URL;
const SECRET = "auth-login-test-secret-value";

const simpleBody = (): ProcessBody =>
  ({
    key: "login_test_body",
    label: { en: "Login Test Body" },
    baseLocale: "en",
    fields: [],
    workflow: {
      initialStep: "step_a",
      steps: [
        { id: "step_a", key: "a", label: { en: "A" }, type: "task", paths: [{ id: "path_ab", key: "ab", to: "step_b", trigger: "manual" }] },
        { id: "step_b", key: "b", label: { en: "B" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE auth_users, outbox, instances, history_entries, instance_events, definitions`;
});

function loginRequest(email: string, password: string): Request {
  return new Request("http://x/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

test.skipIf(!DB)("a valid login returns 200 with a token, expiresAt ~8h ahead, and the actor", async () => {
  await createUser("login@example.com", "correct-horse", ["employee"]);
  const before = Date.now();
  const result = await handleLogin(loginRequest("login@example.com", "correct-horse"), SECRET);
  expect(result.status).toBe(200);
  const body = result.body as { token: string; expiresAt: string; actor: { id: string; roles: string[] } };
  expect(typeof body.token).toBe("string");
  expect(body.actor.roles).toEqual(["employee"]);
  const expiresIn = new Date(body.expiresAt).getTime() - before;
  expect(expiresIn).toBeGreaterThan(7.9 * 60 * 60 * 1000);
  expect(expiresIn).toBeLessThan(8.1 * 60 * 60 * 1000);
});

test.skipIf(!DB)("the returned token authenticates a subsequent request", async () => {
  await createUser("login2@example.com", "correct-horse", ["employee"]);
  const loginResult = await handleLogin(loginRequest("login2@example.com", "correct-horse"), SECRET);
  const { token } = loginResult.body as { token: string };

  const reg = createRegistry();
  const dataSourceReg = createDataSourceRegistry();
  const resolver = jwtResolver({ localSecret: SECRET });
  const fetch = createServer(dataSourceReg, reg, sql, resolver);

  const publishRes = await fetch(
    new Request("http://x/processes", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ processId: "proc_login_test", body: simpleBody() }),
    }),
  );
  expect(publishRes.status).toBe(200);
  const published = (await publishRes.json()) as { processId: string };
  expect(published.processId).toBe("proc_login_test");

  const createRes = await fetch(
    new Request("http://x/processes/proc_login_test/instances", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    }),
  );
  expect(createRes.status).toBe(201);
  const created = (await createRes.json()) as { instanceId: string };
  const viewRes = await fetch(new Request(`http://x/instances/${created.instanceId}`, { headers: { Authorization: `Bearer ${token}` } }));
  expect(viewRes.status).toBe(200);
});

test.skipIf(!DB)("wrong password and unknown email return an identical generic 401", async () => {
  await createUser("login3@example.com", "correct-horse", []);
  const wrongPw = await handleLogin(loginRequest("login3@example.com", "wrong-password"), SECRET);
  const unknown = await handleLogin(loginRequest("nobody@example.com", "anything"), SECRET);
  expect(wrongPw.status).toBe(401);
  expect(unknown.status).toBe(401);
  expect(wrongPw.body).toEqual(unknown.body);
});

test.skipIf(!DB)("a disabled user's login returns the same generic 401", async () => {
  await createUser("login4@example.com", "correct-horse", []);
  await sql`UPDATE auth_users SET disabled = true WHERE email = ${"login4@example.com"}`;
  const result = await handleLogin(loginRequest("login4@example.com", "correct-horse"), SECRET);
  expect(result.status).toBe(401);
});

test.skipIf(!DB)("a malformed JSON body maps to 400", async () => {
  const req = new Request("http://x/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: "{not json" });
  const result = await handleLogin(req, SECRET);
  expect(result.status).toBe(400);
});
