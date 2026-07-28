/**
 * `POST /auth/login` (`src/auth/login.ts`), exercised through a real
 * `createServer` instance wired to the JWT resolver — proves the issued
 * token actually authenticates a subsequent route, not just that `jwt.ts`
 * verifies a hand-signed token in isolation (see test/auth-jwt.test.ts).
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { SignJWT } from "jose";
import { sql, initSchema } from "../src/engine/store.js";
import { createUser } from "../src/auth/users.js";
import { jwtResolver, LOCAL_ISSUER } from "../src/auth/jwt.js";
import { handleLogin, checkAndRecordAttempt, MAX_ATTEMPTS, WINDOW_MS, MAX_TRACKED_EMAILS } from "../src/auth/login.js";
import { createServer } from "../src/http/server.js";
import { PUBLISH_ROLE, ADMIN_ROLE } from "../src/auth/authorize.js";
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
  await createUser("login2@example.com", "correct-horse", ["employee", PUBLISH_ROLE]);
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

test.skipIf(!DB)("a token issued before the user is disabled via the admin route still authenticates until it expires", async () => {
  const { userId } = await createUser("login-disable@example.com", "correct-horse", ["employee"]);
  const loginResult = await handleLogin(loginRequest("login-disable@example.com", "correct-horse"), SECRET);
  const { token } = loginResult.body as { token: string };

  const reg = createRegistry();
  const dataSourceReg = createDataSourceRegistry();
  const resolver = jwtResolver({ localSecret: SECRET });
  const fetch = createServer(dataSourceReg, reg, sql, resolver);

  const adminToken = await new SignJWT({ roles: [ADMIN_ROLE] })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(LOCAL_ISSUER)
    .setSubject("user_admin_for_this_test")
    .setExpirationTime("8h")
    .sign(new TextEncoder().encode(SECRET));

  const disableRes = await fetch(
    new Request(`http://x/admin/users/${userId}/disable`, { method: "POST", headers: { Authorization: `Bearer ${adminToken}` } }),
  );
  expect(disableRes.status).toBe(200);

  // the pre-disable token is unaffected: jwtResolver verifies signature/exp only, no per-request DB lookup
  // (scope=mine, since this actor holds no system:admin role and the default scope=all requires it)
  const viewRes = await fetch(new Request("http://x/instances?scope=mine", { headers: { Authorization: `Bearer ${token}` } }));
  expect(viewRes.status).toBe(200);

  // but a fresh login attempt for the now-disabled user fails
  const reLogin = await handleLogin(loginRequest("login-disable@example.com", "correct-horse"), SECRET);
  expect(reLogin.status).toBe(401);
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

test("checkAndRecordAttempt allows up to MAX_ATTEMPTS, then limits, then resets after WINDOW_MS", () => {
  let t = 0;
  const now = () => t;
  const map = new Map<string, { count: number; windowStart: number }>();

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    expect(checkAndRecordAttempt(map, "a@example.com", now)).toBe("ok");
  }
  expect(checkAndRecordAttempt(map, "a@example.com", now)).toBe("limited");

  t += WINDOW_MS + 1;
  expect(checkAndRecordAttempt(map, "a@example.com", now)).toBe("ok");
});

test("checkAndRecordAttempt fails open once MAX_TRACKED_EMAILS distinct keys are tracked", () => {
  const now = () => 0;
  const map = new Map<string, { count: number; windowStart: number }>();
  for (let i = 0; i < MAX_TRACKED_EMAILS; i++) map.set(`user${i}@example.com`, { count: 1, windowStart: 0 });

  expect(checkAndRecordAttempt(map, "new@example.com", now)).toBe("ok");
  expect(map.has("new@example.com")).toBe(false);
  expect(map.size).toBe(MAX_TRACKED_EMAILS);

  // an already-tracked email is unaffected by capacity
  map.set("tracked@example.com", { count: MAX_ATTEMPTS, windowStart: 0 });
  expect(checkAndRecordAttempt(map, "tracked@example.com", now)).toBe("limited");
});

test.skipIf(!DB)("an email under MAX_ATTEMPTS is not rate-limited", async () => {
  await createUser("login5@example.com", "correct-horse", []);
  for (let i = 0; i < MAX_ATTEMPTS - 1; i++) {
    const result = await handleLogin(loginRequest("login5@example.com", "wrong-password"), SECRET);
    expect(result.status).toBe(401);
  }
});

test.skipIf(!DB)("after MAX_ATTEMPTS failed attempts, further attempts are rejected with 429 and verifyLogin is bypassed", async () => {
  await createUser("login6@example.com", "correct-horse", []);
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const result = await handleLogin(loginRequest("login6@example.com", "wrong-password"), SECRET);
    expect(result.status).toBe(401);
  }
  // the correct password would normally succeed — 429 here proves the limiter, not verifyLogin, rejected it
  const limited = await handleLogin(loginRequest("login6@example.com", "correct-horse"), SECRET);
  expect(limited.status).toBe(429);
  expect((limited.body as { error: { type: string } }).error.type).toBe("rate-limited");
});

test.skipIf(!DB)("a successful login resets the counter", async () => {
  await createUser("login7@example.com", "correct-horse", []);
  for (let i = 0; i < MAX_ATTEMPTS - 1; i++) {
    const result = await handleLogin(loginRequest("login7@example.com", "wrong-password"), SECRET);
    expect(result.status).toBe(401);
  }
  const success = await handleLogin(loginRequest("login7@example.com", "correct-horse"), SECRET);
  expect(success.status).toBe(200);

  // if the counter hadn't been cleared, this next attempt would already be at/over MAX_ATTEMPTS and get 429
  const afterReset = await handleLogin(loginRequest("login7@example.com", "wrong-password"), SECRET);
  expect(afterReset.status).toBe(401);
});

test.skipIf(!DB)("two different emails are rate-limited independently", async () => {
  await createUser("login8a@example.com", "correct-horse", []);
  await createUser("login8b@example.com", "correct-horse", []);
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const result = await handleLogin(loginRequest("login8a@example.com", "wrong-password"), SECRET);
    expect(result.status).toBe(401);
  }
  const limitedA = await handleLogin(loginRequest("login8a@example.com", "wrong-password"), SECRET);
  expect(limitedA.status).toBe(429);

  const unaffectedB = await handleLogin(loginRequest("login8b@example.com", "wrong-password"), SECRET);
  expect(unaffectedB.status).toBe(401);
});

test.skipIf(!DB)("rate limiting is keyed by normalized email — case/whitespace variants share one limit", async () => {
  await createUser("login9@example.com", "correct-horse", []);
  const variants = ["login9@example.com", "LOGIN9@EXAMPLE.COM", " Login9@Example.com ", "login9@example.com", "LOGIN9@example.COM"];
  for (const email of variants) {
    const result = await handleLogin(loginRequest(email, "wrong-password"), SECRET);
    expect(result.status).toBe(401);
  }
  const limited = await handleLogin(loginRequest(" login9@example.com", "wrong-password"), SECRET);
  expect(limited.status).toBe(429);
});

test.skipIf(!DB)("an account whose stored email contains uppercase letters can still log in (normalization is tracker-only)", async () => {
  await createUser("Login10@Example.com", "correct-horse", ["employee"]);
  const result = await handleLogin(loginRequest("Login10@Example.com", "correct-horse"), SECRET);
  expect(result.status).toBe(200);
});
