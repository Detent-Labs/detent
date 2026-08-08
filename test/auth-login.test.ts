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
import {
  handleLogin,
  checkAndRecordAttempt,
  MAX_ATTEMPTS,
  WINDOW_MS,
  MAX_TRACKED_EMAILS,
  MAX_ADDRESS_ATTEMPTS,
  MAX_TRACKED_ADDRESSES,
} from "../src/auth/login.js";
import { createServer, resolveAuthResolver, clientAddressOf } from "../src/http/server.js";
import { PUBLISH_ROLE, ADMIN_ROLE } from "../src/auth/authorize.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import type { ProcessBody } from "../src/schema/definition.js";

const DB = !!process.env.DATABASE_URL;
const SECRET = "auth-login-test-secret-value-0123456789"; // >= 32 encoded bytes; models a configuration the server now requires

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

test.skipIf(!DB)("the 200 actor carries the resolved display name, never null or empty", async () => {
  await createUser("login-named@example.com", "correct-horse", [], "Rita Alvarez");
  await createUser("login-unnamed@example.com", "correct-horse", []);

  const named = await handleLogin(loginRequest("login-named@example.com", "correct-horse"), SECRET);
  expect(named.status).toBe(200);
  expect((named.body as { actor: { displayName: string } }).actor.displayName).toBe("Rita Alvarez");

  // The fallback is the account's email, so the browser never has to render a
  // blank name for an account nobody has named yet.
  const unnamed = await handleLogin(loginRequest("login-unnamed@example.com", "correct-horse"), SECRET);
  expect(unnamed.status).toBe(200);
  expect((unnamed.body as { actor: { displayName: string } }).actor.displayName).toBe("login-unnamed@example.com");
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

// This test used to assert the opposite — that a pre-disable token kept
// working until its `exp` — because the resolver did no per-request lookup.
// `harden-local-account-sessions` gave `resolveAuthResolver`'s resolver that
// lookup, so the disable now lands on the account's very next request. The
// resolver here is the one the server builds for itself, not a hand-built
// `jwtResolver`: what changed is the composition root's wiring, and a resolver
// built without the lookup still reads no directory (see test/auth-jwt.test.ts).
test.skipIf(!DB)("a token issued before the user is disabled via the admin route stops authenticating at once", async () => {
  const { userId } = await createUser("login-disable@example.com", "correct-horse", ["employee"]);
  const loginResult = await handleLogin(loginRequest("login-disable@example.com", "correct-horse"), SECRET);
  const { token } = loginResult.body as { token: string };

  const reg = createRegistry();
  const dataSourceReg = createDataSourceRegistry();
  const resolver = resolveAuthResolver({ AUTH_JWT_SECRET: SECRET }, sql);
  const fetch = createServer(dataSourceReg, reg, sql, resolver);

  // A real account, not a hand-signed subject: the admin's own token now has
  // to resolve in the directory too.
  await createUser("login-disable-admin@example.com", "correct-horse", [ADMIN_ROLE]);
  const adminLogin = await handleLogin(loginRequest("login-disable-admin@example.com", "correct-horse"), SECRET);
  const { token: adminToken } = adminLogin.body as { token: string };

  // The token works before the disable, so the 401 below is the disable's
  // doing and not a broken fixture. (scope=mine, since this actor holds no
  // system:admin role and the default scope=all requires it.)
  const beforeRes = await fetch(new Request("http://x/instances?scope=mine", { headers: { Authorization: `Bearer ${token}` } }));
  expect(beforeRes.status).toBe(200);

  const disableRes = await fetch(
    new Request(`http://x/admin/users/${userId}/disable`, { method: "POST", headers: { Authorization: `Bearer ${adminToken}` } }),
  );
  expect(disableRes.status).toBe(200);

  const viewRes = await fetch(new Request("http://x/instances?scope=mine", { headers: { Authorization: `Bearer ${token}` } }));
  expect(viewRes.status).toBe(401);
  expect(((await viewRes.json()) as { error: { type: string } }).error.type).toBe("actor-resolution");

  // and a fresh login attempt for the now-disabled user fails too
  const reLogin = await handleLogin(loginRequest("login-disable@example.com", "correct-horse"), SECRET);
  expect(reLogin.status).toBe(401);
});

// See jwt-authentication's "A request already past the resolver keeps its
// rights" scenario: the check runs once, ahead of the route handler, so the
// disabling request itself still completes under the rights it resolved
// before the disable committed.
test.skipIf(!DB)("an admin's own disabling request still answers 200, and only the next request gets 401", async () => {
  const { userId } = await createUser("login-self-disable@example.com", "correct-horse", [ADMIN_ROLE]);
  const { token } = (await handleLogin(loginRequest("login-self-disable@example.com", "correct-horse"), SECRET)).body as { token: string };

  const fetch = createServer(createDataSourceRegistry(), createRegistry(), sql, resolveAuthResolver({ AUTH_JWT_SECRET: SECRET }, sql));

  const disableRes = await fetch(
    new Request(`http://x/admin/users/${userId}/disable`, { method: "POST", headers: { Authorization: `Bearer ${token}` } }),
  );
  expect(disableRes.status).toBe(200); // the disabling request itself still resolved before the row flipped
  expect(((await disableRes.json()) as { disabled: boolean }).disabled).toBe(true);

  const after = await fetch(new Request("http://x/instances?scope=mine", { headers: { Authorization: `Bearer ${token}` } }));
  expect(after.status).toBe(401); // the next request re-reads the directory
});

test.skipIf(!DB)("an account deleted from the directory loses its live session the same way", async () => {
  const { userId } = await createUser("login-deleted@example.com", "correct-horse", ["employee"]);
  const { token } = (await handleLogin(loginRequest("login-deleted@example.com", "correct-horse"), SECRET)).body as { token: string };

  const fetch = createServer(createDataSourceRegistry(), createRegistry(), sql, resolveAuthResolver({ AUTH_JWT_SECRET: SECRET }, sql));
  expect((await fetch(new Request("http://x/instances?scope=mine", { headers: { Authorization: `Bearer ${token}` } }))).status).toBe(200);

  await sql`DELETE FROM auth_users WHERE user_id = ${userId}`;

  const after = await fetch(new Request("http://x/instances?scope=mine", { headers: { Authorization: `Bearer ${token}` } }));
  expect(after.status).toBe(401);
});

test.skipIf(!DB)("re-enabling an account restores its live session, since nothing caches the answer", async () => {
  const { userId } = await createUser("login-reenable@example.com", "correct-horse", ["employee"]);
  const { token } = (await handleLogin(loginRequest("login-reenable@example.com", "correct-horse"), SECRET)).body as { token: string };

  const fetch = createServer(createDataSourceRegistry(), createRegistry(), sql, resolveAuthResolver({ AUTH_JWT_SECRET: SECRET }, sql));
  const request = (): Request => new Request("http://x/instances?scope=mine", { headers: { Authorization: `Bearer ${token}` } });

  await sql`UPDATE auth_users SET disabled = true WHERE user_id = ${userId}`;
  expect((await fetch(request())).status).toBe(401);

  await sql`UPDATE auth_users SET disabled = false WHERE user_id = ${userId}`;
  expect((await fetch(request())).status).toBe(200);
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

// This suite exercises the capacity (MAX_TRACKED_EMAILS) path at the pure
// checkAndRecordAttempt level, not through handleLogin end-to-end. Reaching
// capacity via real handleLogin calls now costs one Bun.password.verify per
// distinct email (the login-timing fix in src/auth/users.ts runs the dummy-hash
// verification on every path, ~100ms each), so a literal 50,000-request
// end-to-end test would take well over an hour. The MAX_ATTEMPTS 429 path below
// already proves handleLogin's dispatch on a "limited" result short-circuits
// before verifyLogin; that dispatch is identical regardless of which branch of
// checkAndRecordAttempt produced "limited".
test("checkAndRecordAttempt evicts the earliest window once MAX_TRACKED_EMAILS live-window keys are tracked", () => {
  const now = () => 1_000;
  const map = new Map<string, { count: number; windowStart: number }>();
  // Live windows, none expired at `now`, with `oldest@` the earliest by 1ms.
  map.set("oldest@example.com", { count: 1, windowStart: 0 });
  for (let i = 0; i < MAX_TRACKED_EMAILS - 1; i++) map.set(`user${i}@example.com`, { count: 1, windowStart: 1 });

  expect(checkAndRecordAttempt(map, "new@example.com", now)).toBe("ok");
  expect(map.has("new@example.com")).toBe(true);
  expect(map.has("oldest@example.com")).toBe(false); // the earliest window, and the only one evicted
  expect(map.size).toBe(MAX_TRACKED_EMAILS);

  // an already-tracked email under MAX_ATTEMPTS is admitted normally, even
  // though the map is at full capacity — the entry-exists branch never
  // consults map size
  map.set("under-limit@example.com", { count: 1, windowStart: 1 });
  expect(checkAndRecordAttempt(map, "under-limit@example.com", now)).toBe("ok");

  // an already-tracked email already at MAX_ATTEMPTS is still rate-limited
  // normally, for the ordinary MAX_ATTEMPTS reason, not because of capacity
  map.set("tracked@example.com", { count: MAX_ATTEMPTS, windowStart: 1 });
  expect(checkAndRecordAttempt(map, "tracked@example.com", now)).toBe("limited");
});

// The rule this replaced refused an untracked email at capacity, so a flood of
// distinct values cost every untracked account its login until the window
// rolled. The per-address window is what made that trade affordable to reverse:
// it stops one caller from minting 50,000 entries in the first place.
test("a full map of live windows costs the new email nothing but one evicted entry", () => {
  const now = () => 1_000;
  const map = new Map<string, { count: number; windowStart: number }>();
  for (let i = 0; i < MAX_TRACKED_EMAILS; i++) map.set(`flood${i}@example.com`, { count: 1, windowStart: i });

  expect(checkAndRecordAttempt(map, "victim@example.com", now)).toBe("ok");
  expect(map.get("victim@example.com")).toEqual({ count: 1, windowStart: 1_000 });
  expect(map.has("flood0@example.com")).toBe(false);
  expect(map.has("flood1@example.com")).toBe(true);
});

test("checkAndRecordAttempt takes its threshold and capacity from its parameters", () => {
  const now = () => 0;
  const map = new Map<string, { count: number; windowStart: number }>();

  // The address map passes MAX_ADDRESS_ATTEMPTS, which is above MAX_ATTEMPTS:
  // an attempt count that limits the email map must not limit this one.
  for (let i = 0; i < MAX_ADDRESS_ATTEMPTS; i++) {
    expect(checkAndRecordAttempt(map, "203.0.113.7", now, MAX_ADDRESS_ATTEMPTS, MAX_TRACKED_ADDRESSES)).toBe("ok");
  }
  expect(checkAndRecordAttempt(map, "203.0.113.7", now, MAX_ADDRESS_ATTEMPTS, MAX_TRACKED_ADDRESSES)).toBe("limited");
  expect(MAX_ADDRESS_ATTEMPTS).toBeGreaterThan(MAX_ATTEMPTS);

  // A capacity of 2 evicts on the third distinct key, which the default
  // capacity would not do.
  const small = new Map<string, { count: number; windowStart: number }>();
  expect(checkAndRecordAttempt(small, "a", now, MAX_ADDRESS_ATTEMPTS, 2)).toBe("ok");
  expect(checkAndRecordAttempt(small, "b", now, MAX_ADDRESS_ATTEMPTS, 2)).toBe("ok");
  expect(checkAndRecordAttempt(small, "c", now, MAX_ADDRESS_ATTEMPTS, 2)).toBe("ok");
  expect(small.size).toBe(2);
  expect(small.has("c")).toBe(true);
  expect(small.has("a")).toBe(false); // the earliest window went
});

test("checkAndRecordAttempt reclaims expired entries before judging capacity, and admits the new email", () => {
  const now = () => 0;
  const map = new Map<string, { count: number; windowStart: number }>();
  // Every entry's window started long enough ago to have expired by "now".
  for (let i = 0; i < MAX_TRACKED_EMAILS; i++) {
    map.set(`user${i}@example.com`, { count: 1, windowStart: -(WINDOW_MS + 1) });
  }

  expect(checkAndRecordAttempt(map, "new@example.com", now)).toBe("ok");
  expect(map.has("new@example.com")).toBe(true);
  expect(map.size).toBe(1); // every expired entry was swept, only the new one remains
});

test("a flood of distinct emails leaves the map at its ordinary state once the windows expire", () => {
  let t = 0;
  const now = () => t;
  const map = new Map<string, { count: number; windowStart: number }>();
  for (let i = 0; i < MAX_TRACKED_EMAILS; i++) map.set(`flood${i}@example.com`, { count: 1, windowStart: t });

  t += WINDOW_MS + 1;
  expect(checkAndRecordAttempt(map, "victim@example.com", now)).toBe("ok");
  expect(map.has("victim@example.com")).toBe(true);
  expect(map.size).toBe(1); // the whole flood was swept as expired
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

// ============================================================
// The per-address window
// ============================================================

// The credential-stuffing case the per-email window cannot see: one password
// against many accounts, where every email opens its own window and no counter
// ever trips. Every email below is distinct, so the email window never fires
// and the 429 can only come from the address window.
//
// This one runs MAX_ADDRESS_ATTEMPTS real logins, each costing one argon2id
// verify (~100ms, see the dummy-hash comment in src/auth/users.ts), so it
// carries its own timeout rather than the 5s default. It also folds in the
// success-does-not-reset rule, to pay that cost once instead of twice.
test.skipIf(!DB)(
  "one address trying many emails is limited whatever email it names, and a success in between does not reset it",
  async () => {
    const address = "198.51.100.10";
    await createUser("stuffing-victim@example.com", "correct-horse", []);

    for (let i = 0; i < MAX_ADDRESS_ATTEMPTS; i++) {
      // One real success partway through. It clears that email's window and
      // must leave the address's alone.
      const result =
        i === 3
          ? await handleLogin(loginRequest("stuffing-victim@example.com", "correct-horse"), SECRET, sql, address)
          : await handleLogin(loginRequest(`stuffing${i}@example.com`, "any-password"), SECRET, sql, address);
      expect(result.status).toBe(i === 3 ? 200 : 401);
    }

    const limited = await handleLogin(loginRequest("stuffing-final@example.com", "any-password"), SECRET, sql, address);
    expect(limited.status).toBe(429);
    expect((limited.body as { error: { type: string } }).error.type).toBe("rate-limited");

    // Even the account whose password is correct is refused from this address,
    // which is what "the request never reaches verifyLogin" means here.
    const alsoLimited = await handleLogin(loginRequest("stuffing-victim@example.com", "correct-horse"), SECRET, sql, address);
    expect(alsoLimited.status).toBe(429);

    // A different address is unaffected: the window is per address, not global.
    const other = await handleLogin(loginRequest("stuffing-other@example.com", "any-password"), SECRET, sql, "198.51.100.11");
    expect(other.status).toBe(401);
  },
  120_000,
);

test.skipIf(!DB)("an undefined address applies the email window alone", async () => {
  await createUser("no-address@example.com", "correct-horse", []);
  // No third argument at all: every existing suite calls handleLogin this way,
  // and every one of those requests must keep working.
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    expect((await handleLogin(loginRequest("no-address@example.com", "wrong-password"), SECRET)).status).toBe(401);
  }
  expect((await handleLogin(loginRequest("no-address@example.com", "wrong-password"), SECRET)).status).toBe(429);
});

// ============================================================
// Where the client address comes from
// ============================================================

// `clientAddressOf` only ever reads `requestIP` off the server, so a stub with
// that one method is the whole collaborator. Bun's own `Server` type carries a
// large surface this function never touches.
const peer = (address: string | null): Parameters<typeof clientAddressOf>[1] =>
  ({ requestIP: () => (address === null ? null : { address, family: "IPv4", port: 1 }) }) as unknown as Parameters<typeof clientAddressOf>[1];

const forwarded = (value?: string): Request =>
  new Request("http://x/auth/login", { method: "POST", headers: value === undefined ? {} : { "X-Forwarded-For": value } });

test("without TRUST_PROXY the peer address is used and X-Forwarded-For is ignored", () => {
  expect(clientAddressOf(forwarded("203.0.113.9"), peer("198.51.100.1"), false)).toBe("198.51.100.1");
  expect(clientAddressOf(forwarded(), peer("198.51.100.1"), false)).toBe("198.51.100.1");
});

test("with TRUST_PROXY the last X-Forwarded-For entry is used", () => {
  expect(clientAddressOf(forwarded("203.0.113.9"), peer("198.51.100.1"), true)).toBe("203.0.113.9");
  // An appending proxy leaves what the caller sent in front of its own entry.
  // Reading the first would let that caller pick its own bucket per request.
  expect(clientAddressOf(forwarded("attacker-chosen, 203.0.113.9"), peer("198.51.100.1"), true)).toBe("203.0.113.9");
  expect(clientAddressOf(forwarded("a, b,  203.0.113.9  "), peer("198.51.100.1"), true)).toBe("203.0.113.9");
});

test("with TRUST_PROXY and no usable header, the peer stands in", () => {
  // The caller reached this process without passing the proxy, so its peer IS
  // the caller. Answering `undefined` would exempt it from the window instead.
  expect(clientAddressOf(forwarded(), peer("198.51.100.1"), true)).toBe("198.51.100.1");
  expect(clientAddressOf(forwarded("   "), peer("198.51.100.1"), true)).toBe("198.51.100.1");
});

test("no server and no trusted header means no address at all", () => {
  // How every existing suite invokes the handler `createServer` returns.
  expect(clientAddressOf(forwarded("203.0.113.9"), undefined, false)).toBeUndefined();
  expect(clientAddressOf(forwarded(), undefined, true)).toBeUndefined();
  expect(clientAddressOf(forwarded(), peer(null), false)).toBeUndefined();
});
