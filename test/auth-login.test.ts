/**
 * `POST /auth/login` (`src/auth/login.ts`), exercised through a real
 * `createServer` instance wired to the JWT resolver — proves the issued
 * token actually authenticates a subsequent route, not just that `jwt.ts`
 * verifies a hand-signed token in isolation (see test/auth-jwt.test.ts).
 */
import { test, expect, beforeAll, beforeEach, spyOn } from "bun:test";
import { SQL } from "bun";
import { sql, initSchema, withTransaction } from "../src/engine/store.js";
import { createUser } from "../src/auth/users.js";
import { jwtResolver } from "../src/auth/jwt.js";
import { handleLogin, checkAndRecordAttempt, MAX_ATTEMPTS, WINDOW_MS, MAX_ADDRESS_ATTEMPTS } from "../src/auth/login.js";
import { createServer, resolveAuthResolver, clientAddressOf } from "../src/http/server.js";
import { PUBLISH_ROLE, ADMIN_ROLE } from "../src/auth/authorize.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import type { ProcessBody } from "../src/schema/definition.js";
import { clearInstanceAudit } from "./audit-cleanup.js";

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
        { id: "step_a", key: "a", label: { en: "A" }, type: "task", paths: [{ id: "path_ab", key: "ab", label: "Ab", to: "step_b", trigger: "manual" }] },
        { id: "step_b", key: "b", label: { en: "B" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE auth_users, login_attempts, outbox, instances, history_entries, instance_events, definitions`;
  if (DB) await clearInstanceAudit();
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
  const result = await handleLogin(loginRequest("login@example.com", "correct-horse"), SECRET, sql);
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

  const named = await handleLogin(loginRequest("login-named@example.com", "correct-horse"), SECRET, sql);
  expect(named.status).toBe(200);
  expect((named.body as { actor: { displayName: string } }).actor.displayName).toBe("Rita Alvarez");

  // The fallback is the account's email, so the browser never has to render a
  // blank name for an account nobody has named yet.
  const unnamed = await handleLogin(loginRequest("login-unnamed@example.com", "correct-horse"), SECRET, sql);
  expect(unnamed.status).toBe(200);
  expect((unnamed.body as { actor: { displayName: string } }).actor.displayName).toBe("login-unnamed@example.com");
});

test.skipIf(!DB)("the returned token authenticates a subsequent request", async () => {
  await createUser("login2@example.com", "correct-horse", ["employee", PUBLISH_ROLE]);
  const loginResult = await handleLogin(loginRequest("login2@example.com", "correct-horse"), SECRET, sql);
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
  const loginResult = await handleLogin(loginRequest("login-disable@example.com", "correct-horse"), SECRET, sql);
  const { token } = loginResult.body as { token: string };

  const reg = createRegistry();
  const dataSourceReg = createDataSourceRegistry();
  const resolver = resolveAuthResolver({ AUTH_JWT_SECRET: SECRET });
  const fetch = createServer(dataSourceReg, reg, sql, resolver);

  // A real account, not a hand-signed subject: the admin's own token now has
  // to resolve in the directory too.
  await createUser("login-disable-admin@example.com", "correct-horse", [ADMIN_ROLE]);
  const adminLogin = await handleLogin(loginRequest("login-disable-admin@example.com", "correct-horse"), SECRET, sql);
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
  const reLogin = await handleLogin(loginRequest("login-disable@example.com", "correct-horse"), SECRET, sql);
  expect(reLogin.status).toBe(401);
});

// See jwt-authentication's "A request already past the resolver keeps its
// rights" scenario: the check runs once, ahead of the route handler, so the
// disabling request itself still completes under the rights it resolved
// before the disable committed.
test.skipIf(!DB)("an admin's own disabling request still answers 200, and only the next request gets 401", async () => {
  const { userId } = await createUser("login-self-disable@example.com", "correct-horse", [ADMIN_ROLE]);
  const { token } = (await handleLogin(loginRequest("login-self-disable@example.com", "correct-horse"), SECRET, sql)).body as { token: string };

  const fetch = createServer(createDataSourceRegistry(), createRegistry(), sql, resolveAuthResolver({ AUTH_JWT_SECRET: SECRET }));

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
  const { token } = (await handleLogin(loginRequest("login-deleted@example.com", "correct-horse"), SECRET, sql)).body as { token: string };

  const fetch = createServer(createDataSourceRegistry(), createRegistry(), sql, resolveAuthResolver({ AUTH_JWT_SECRET: SECRET }));
  expect((await fetch(new Request("http://x/instances?scope=mine", { headers: { Authorization: `Bearer ${token}` } }))).status).toBe(200);

  await sql`DELETE FROM auth_users WHERE user_id = ${userId}`;

  const after = await fetch(new Request("http://x/instances?scope=mine", { headers: { Authorization: `Bearer ${token}` } }));
  expect(after.status).toBe(401);
});

test.skipIf(!DB)("re-enabling an account restores its live session, since nothing caches the answer", async () => {
  const { userId } = await createUser("login-reenable@example.com", "correct-horse", ["employee"]);
  const { token } = (await handleLogin(loginRequest("login-reenable@example.com", "correct-horse"), SECRET, sql)).body as { token: string };

  const fetch = createServer(createDataSourceRegistry(), createRegistry(), sql, resolveAuthResolver({ AUTH_JWT_SECRET: SECRET }));
  const request = (): Request => new Request("http://x/instances?scope=mine", { headers: { Authorization: `Bearer ${token}` } });

  await sql`UPDATE auth_users SET disabled = true WHERE user_id = ${userId}`;
  expect((await fetch(request())).status).toBe(401);

  await sql`UPDATE auth_users SET disabled = false WHERE user_id = ${userId}`;
  expect((await fetch(request())).status).toBe(200);
});

test.skipIf(!DB)("wrong password and unknown email return an identical generic 401", async () => {
  await createUser("login3@example.com", "correct-horse", []);
  const wrongPw = await handleLogin(loginRequest("login3@example.com", "wrong-password"), SECRET, sql);
  const unknown = await handleLogin(loginRequest("nobody@example.com", "anything"), SECRET, sql);
  expect(wrongPw.status).toBe(401);
  expect(unknown.status).toBe(401);
  expect(wrongPw.body).toEqual(unknown.body);
});

test.skipIf(!DB)("a disabled user's login returns the same generic 401", async () => {
  await createUser("login4@example.com", "correct-horse", []);
  await sql`UPDATE auth_users SET disabled = true WHERE email = ${"login4@example.com"}`;
  const result = await handleLogin(loginRequest("login4@example.com", "correct-horse"), SECRET, sql);
  expect(result.status).toBe(401);
});

test.skipIf(!DB)("a malformed JSON body maps to 400", async () => {
  const req = new Request("http://x/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: "{not json" });
  const result = await handleLogin(req, SECRET, sql);
  expect(result.status).toBe(400);
});

// ============================================================
// The windows in Postgres
// ============================================================

type WindowRow = { attempts: number; window_start: Date };

const windowRow = async (scope: "email" | "address", key: string, db: SQL = sql): Promise<WindowRow | undefined> =>
  ((await db`SELECT attempts, window_start FROM login_attempts WHERE scope = ${scope} AND key = ${key}`) as WindowRow[])[0];

/** Moves a window's start back past `WINDOW_MS` by `UPDATE`, in place of an injected clock. */
const endWindow = async (scope: "email" | "address", key: string): Promise<void> => {
  await sql`UPDATE login_attempts SET window_start = now() - ${WINDOW_MS + 1000}::double precision * interval '1 millisecond' WHERE scope = ${scope} AND key = ${key}`;
};

const rowCount = async (db: SQL = sql): Promise<number> => ((await db`SELECT count(*)::int AS n FROM login_attempts`) as { n: number }[])[0]!.n;

test.skipIf(!DB)("a second schema build leaves the login_attempts table and its rows unchanged", async () => {
  await checkAndRecordAttempt(sql, "email", "schema@example.com", MAX_ATTEMPTS);
  const before = await windowRow("email", "schema@example.com");
  await initSchema();
  expect(await windowRow("email", "schema@example.com")).toEqual(before);
  const indexes = (await sql`SELECT indexname FROM pg_indexes WHERE tablename = 'login_attempts' ORDER BY indexname`) as { indexname: string }[];
  expect(indexes.map((i) => i.indexname)).toEqual(["login_attempts_pkey", "login_attempts_window_idx"]);
});

test.skipIf(!DB)("checkAndRecordAttempt passes tries 1 to MAX_ATTEMPTS and limits the next one", async () => {
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    expect(await checkAndRecordAttempt(sql, "email", "a@example.com", MAX_ATTEMPTS)).toBe("ok");
  }
  expect(await checkAndRecordAttempt(sql, "email", "a@example.com", MAX_ATTEMPTS)).toBe("limited");
});

test.skipIf(!DB)("the count stops at one above the threshold, and a refused try leaves window_start alone", async () => {
  await checkAndRecordAttempt(sql, "email", "cap@example.com", MAX_ATTEMPTS);
  const started = (await windowRow("email", "cap@example.com"))!.window_start;
  for (let i = 0; i < MAX_ATTEMPTS + 15; i++) await checkAndRecordAttempt(sql, "email", "cap@example.com", MAX_ATTEMPTS);
  const row = (await windowRow("email", "cap@example.com"))!;
  expect(row.attempts).toBe(MAX_ATTEMPTS + 1);
  expect(row.window_start.getTime()).toBe(started.getTime());
});

test.skipIf(!DB)("an ended window restarts at one and takes a new start", async () => {
  for (let i = 0; i < MAX_ATTEMPTS + 1; i++) await checkAndRecordAttempt(sql, "email", "roll@example.com", MAX_ATTEMPTS);
  expect(await checkAndRecordAttempt(sql, "email", "roll@example.com", MAX_ATTEMPTS)).toBe("limited");
  await endWindow("email", "roll@example.com");
  const ended = (await windowRow("email", "roll@example.com"))!.window_start;

  expect(await checkAndRecordAttempt(sql, "email", "roll@example.com", MAX_ATTEMPTS)).toBe("ok");
  const row = (await windowRow("email", "roll@example.com"))!;
  expect(row.attempts).toBe(1);
  expect(row.window_start.getTime()).toBeGreaterThan(ended.getTime());
});

test.skipIf(!DB)("checkAndRecordAttempt takes its threshold from its parameter, and the two scopes count apart", async () => {
  // The address window passes MAX_ADDRESS_ATTEMPTS, which is above MAX_ATTEMPTS:
  // a count that limits the email window must not limit this one.
  for (let i = 0; i < MAX_ADDRESS_ATTEMPTS; i++) {
    expect(await checkAndRecordAttempt(sql, "address", "203.0.113.7", MAX_ADDRESS_ATTEMPTS)).toBe("ok");
  }
  expect(await checkAndRecordAttempt(sql, "address", "203.0.113.7", MAX_ADDRESS_ATTEMPTS)).toBe("limited");
  expect(MAX_ADDRESS_ATTEMPTS).toBeGreaterThan(MAX_ATTEMPTS);

  // The same string under the other scope is another window.
  expect(await checkAndRecordAttempt(sql, "email", "203.0.113.7", MAX_ATTEMPTS)).toBe("ok");
  expect((await windowRow("email", "203.0.113.7"))!.attempts).toBe(1);
});

test.skipIf(!DB)("an ended window's row is gone after another email's try", async () => {
  await checkAndRecordAttempt(sql, "email", "ended@example.com", MAX_ATTEMPTS);
  await checkAndRecordAttempt(sql, "email", "live@example.com", MAX_ATTEMPTS);
  await endWindow("email", "ended@example.com");

  expect((await handleLogin(loginRequest("other@example.com", "wrong-password"), SECRET, sql)).status).toBe(401);

  expect(await windowRow("email", "ended@example.com")).toBeUndefined();
  expect(await windowRow("email", "live@example.com")).toBeDefined(); // a live window stays
});

test.skipIf(!DB)("a flood of distinct emails leaves no row once its windows end and one more login arrives", async () => {
  for (let i = 0; i < 200; i++) await checkAndRecordAttempt(sql, "email", `flood${i}@example.com`, MAX_ATTEMPTS);
  await sql`UPDATE login_attempts SET window_start = now() - ${WINDOW_MS + 1000}::double precision * interval '1 millisecond'`;
  expect(await rowCount()).toBe(200);

  await handleLogin(loginRequest("victim@example.com", "wrong-password"), SECRET, sql);

  // Only the new try's own row remains.
  expect(await rowCount()).toBe(1);
  expect((await windowRow("email", "victim@example.com"))!.attempts).toBe(1);
});

test.skipIf(!DB)("a locked expired row does not block the cleanup, and stays", async () => {
  await checkAndRecordAttempt(sql, "email", "locked@example.com", MAX_ATTEMPTS);
  await checkAndRecordAttempt(sql, "email", "free@example.com", MAX_ATTEMPTS);
  await endWindow("email", "locked@example.com");
  await endWindow("email", "free@example.com");

  await withTransaction(sql, async (tx) => {
    await tx`SELECT 1 FROM login_attempts WHERE scope = 'email' AND key = 'locked@example.com' FOR UPDATE`;
    // A cleanup that waited for the lock would hang here until the test times out.
    const res = await handleLogin(loginRequest("bystander@example.com", "wrong-password"), SECRET, sql);
    expect(res.status).toBe(401);
    expect(await windowRow("email", "free@example.com")).toBeUndefined();
    expect(await windowRow("email", "locked@example.com")).toBeDefined();
  });
});

test.skipIf(!DB)("a success clears the email row and leaves the address row", async () => {
  await createUser("clear@example.com", "correct-horse", []);
  const address = "198.51.100.20";
  expect((await handleLogin(loginRequest("clear@example.com", "wrong-password"), SECRET, sql, address)).status).toBe(401);
  expect((await windowRow("email", "clear@example.com"))!.attempts).toBe(1);

  expect((await handleLogin(loginRequest("clear@example.com", "correct-horse"), SECRET, sql, address)).status).toBe(200);

  expect(await windowRow("email", "clear@example.com")).toBeUndefined();
  expect((await windowRow("address", address))!.attempts).toBe(2);
});

test.skipIf(!DB)("a request past its address threshold adds no email row", async () => {
  for (let i = 0; i < MAX_ADDRESS_ATTEMPTS + 1; i++) await checkAndRecordAttempt(sql, "address", "198.51.100.30", MAX_ADDRESS_ATTEMPTS);
  const res = await handleLogin(loginRequest("never-recorded@example.com", "wrong-password"), SECRET, sql, "198.51.100.30");
  expect(res.status).toBe(429);
  expect(await windowRow("email", "never-recorded@example.com")).toBeUndefined();
});

test.skipIf(!DB)("an undefined address writes no address row", async () => {
  await handleLogin(loginRequest("no-addr-row@example.com", "wrong-password"), SECRET, sql);
  expect(((await sql`SELECT count(*)::int AS n FROM login_attempts WHERE scope = 'address'`) as { n: number }[])[0]!.n).toBe(0);
});

// Tenancy is database-per-tenant, so a second tenant here is a second database
// on the same server. `beta` holds its own `login_attempts` table.
async function betaDatabase(): Promise<SQL> {
  const url = new URL(process.env.DATABASE_URL as string);
  const name = `${url.pathname.replace(/^\//, "")}_login_beta`;
  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = new SQL(adminUrl.toString());
  try {
    const found = (await admin`SELECT 1 FROM pg_database WHERE datname = ${name}`) as unknown[];
    // The identifier cannot be a bind parameter; `name` derives from DATABASE_URL.
    if (found.length === 0) await admin.unsafe(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.close();
  }
  const betaUrl = new URL(url);
  betaUrl.pathname = `/${name}`;
  const beta = new SQL(betaUrl.toString());
  await initSchema(beta);
  await beta`TRUNCATE auth_users, login_attempts`;
  return beta;
}

test.skipIf(!DB)(
  "two tenants with one shared email keep separate windows, in both directions",
  async () => {
    const beta = await betaDatabase();
    try {
      await createUser("eve@corp.example", "acme-password", [], null, sql);
      await createUser("eve@corp.example", "beta-password", [], null, beta);
      const fetch = createServer(
        createDataSourceRegistry(),
        createRegistry(),
        sql,
        resolveAuthResolver({ AUTH_JWT_SECRET: SECRET }),
        "*",
        SECRET,
        undefined,
        undefined,
        async (req) => (req.headers.get("x-test-tenant") === "beta" ? beta : sql),
      );
      const login = async (tenant: "acme" | "beta", password: string): Promise<number> =>
        (
          await fetch(
            new Request("http://x/auth/login", {
              method: "POST",
              headers: { "content-type": "application/json", "x-test-tenant": tenant },
              body: JSON.stringify({ email: "eve@corp.example", password }),
            }),
          )
        ).status;

      // beta locks out ...
      for (let i = 0; i < MAX_ATTEMPTS; i++) expect(await login("beta", "wrong-password")).toBe(401);
      expect(await login("beta", "beta-password")).toBe(429);

      // ... and acme, with the same email, still reaches verifyLogin.
      expect(await login("acme", "wrong-password")).toBe(401);
      expect(await login("acme", "acme-password")).toBe(200);

      // acme's success clears acme's row only: beta stays locked.
      expect(await login("beta", "wrong-password")).toBe(429);
      expect((await windowRow("email", "eve@corp.example", beta))!.attempts).toBe(MAX_ATTEMPTS + 1);
      expect(await windowRow("email", "eve@corp.example")).toBeUndefined();
    } finally {
      await beta.close();
    }
  },
  60_000,
);

test.skipIf(!DB)(
  "two server instances on one database share one count, and 20 simultaneous tries let at most MAX_ATTEMPTS through",
  async () => {
    await createUser("shared@example.com", "correct-horse", []);
    const build = () => createServer(createDataSourceRegistry(), createRegistry(), sql, resolveAuthResolver({ AUTH_JWT_SECRET: SECRET }), "*", SECRET);
    const first = build();
    const attempt = (fetch: ReturnType<typeof build>, password = "wrong-password"): Promise<Response> =>
      fetch(
        new Request("http://x/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: "shared@example.com", password }),
        }),
      );

    // The second instance stands for a restart: it holds no memory of the first.
    for (let i = 0; i < MAX_ATTEMPTS; i++) expect((await attempt(first)).status).toBe(401);
    const second = build();
    expect((await attempt(second, "correct-horse")).status).toBe(429);

    // A fresh email, 20 tries at once over both instances. A 401 means the try
    // reached verifyLogin; every other one must be refused.
    await sql`TRUNCATE login_attempts`;
    const statuses = (await Promise.all(Array.from({ length: 20 }, (_, i) => attempt(i % 2 === 0 ? first : second)))).map((r) => r.status);
    expect(statuses.filter((s) => s === 401)).toHaveLength(MAX_ATTEMPTS);
    expect(statuses.filter((s) => s === 429)).toHaveLength(20 - MAX_ATTEMPTS);
  },
  60_000,
);

// No database needed: the handle records every statement and refuses the ones
// against `login_attempts`. A statement against `auth_users` is `verifyLogin`.
test.each([
  ["the cleanup", /DELETE FROM login_attempts/],
  ["the window upsert", /INSERT INTO login_attempts/],
])("a database error in %s answers 500 and never calls verifyLogin", async (_label, failing) => {
  const statements: string[] = [];
  const db = ((strings: TemplateStringsArray) => {
    const text = strings.join("?");
    statements.push(text);
    return failing.test(text) ? Promise.reject(new Error("connection terminated")) : Promise.resolve([]);
  }) as unknown as SQL;
  const errorSpy = spyOn(console, "error").mockImplementation(() => {});
  try {
    const fetch = createServer(createDataSourceRegistry(), createRegistry(), db, resolveAuthResolver({ AUTH_JWT_SECRET: SECRET }), "*", SECRET);
    const res = await fetch(
      new Request("http://x/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "down@example.com", password: "irrelevant" }),
      }),
    );
    expect(res.status).toBe(500);
    expect(statements.some((s) => s.includes("auth_users"))).toBe(false);
  } finally {
    errorSpy.mockRestore();
  }
});

test.skipIf(!DB)("an email under MAX_ATTEMPTS is not rate-limited", async () => {
  await createUser("login5@example.com", "correct-horse", []);
  for (let i = 0; i < MAX_ATTEMPTS - 1; i++) {
    const result = await handleLogin(loginRequest("login5@example.com", "wrong-password"), SECRET, sql);
    expect(result.status).toBe(401);
  }
});

test.skipIf(!DB)("after MAX_ATTEMPTS failed attempts, further attempts are rejected with 429 and verifyLogin is bypassed", async () => {
  await createUser("login6@example.com", "correct-horse", []);
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const result = await handleLogin(loginRequest("login6@example.com", "wrong-password"), SECRET, sql);
    expect(result.status).toBe(401);
  }
  // the correct password would normally succeed — 429 here proves the limiter, not verifyLogin, rejected it
  const limited = await handleLogin(loginRequest("login6@example.com", "correct-horse"), SECRET, sql);
  expect(limited.status).toBe(429);
  expect((limited.body as { error: { type: string } }).error.type).toBe("rate-limited");
});

test.skipIf(!DB)("a successful login resets the counter", async () => {
  await createUser("login7@example.com", "correct-horse", []);
  for (let i = 0; i < MAX_ATTEMPTS - 1; i++) {
    const result = await handleLogin(loginRequest("login7@example.com", "wrong-password"), SECRET, sql);
    expect(result.status).toBe(401);
  }
  const success = await handleLogin(loginRequest("login7@example.com", "correct-horse"), SECRET, sql);
  expect(success.status).toBe(200);

  // if the counter hadn't been cleared, this next attempt would already be at/over MAX_ATTEMPTS and get 429
  const afterReset = await handleLogin(loginRequest("login7@example.com", "wrong-password"), SECRET, sql);
  expect(afterReset.status).toBe(401);
});

test.skipIf(!DB)("two different emails are rate-limited independently", async () => {
  await createUser("login8a@example.com", "correct-horse", []);
  await createUser("login8b@example.com", "correct-horse", []);
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const result = await handleLogin(loginRequest("login8a@example.com", "wrong-password"), SECRET, sql);
    expect(result.status).toBe(401);
  }
  const limitedA = await handleLogin(loginRequest("login8a@example.com", "wrong-password"), SECRET, sql);
  expect(limitedA.status).toBe(429);

  const unaffectedB = await handleLogin(loginRequest("login8b@example.com", "wrong-password"), SECRET, sql);
  expect(unaffectedB.status).toBe(401);
});

test.skipIf(!DB)("rate limiting is keyed by normalized email — case/whitespace variants share one limit", async () => {
  await createUser("login9@example.com", "correct-horse", []);
  const variants = ["login9@example.com", "LOGIN9@EXAMPLE.COM", " Login9@Example.com ", "login9@example.com", "LOGIN9@example.COM"];
  for (const email of variants) {
    const result = await handleLogin(loginRequest(email, "wrong-password"), SECRET, sql);
    expect(result.status).toBe(401);
  }
  const limited = await handleLogin(loginRequest(" login9@example.com", "wrong-password"), SECRET, sql);
  expect(limited.status).toBe(429);
});

test.skipIf(!DB)("an account whose stored email contains uppercase letters can still log in (normalization is tracker-only)", async () => {
  await createUser("Login10@Example.com", "correct-horse", ["employee"]);
  const result = await handleLogin(loginRequest("Login10@Example.com", "correct-horse"), SECRET, sql);
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
    expect((await handleLogin(loginRequest("no-address@example.com", "wrong-password"), SECRET, sql)).status).toBe(401);
  }
  expect((await handleLogin(loginRequest("no-address@example.com", "wrong-password"), SECRET, sql)).status).toBe(429);
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
