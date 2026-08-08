/**
 * The `/admin/*` HTTP surface (src/http/admin-routes.ts): 401 without a
 * credential, 403 without `system:admin`, success with it, plus retry/discard's
 * 404 (no such row) and 409 (present but not a dead letter), the users
 * routes' 404 (no such userId) and the roles route's 400/409, and
 * migrations/run's 409 (no registered plan) and request error (non-integer
 * version). DB-backed — skips when DATABASE_URL is unset.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, createInstance } from "../src/engine/store.js";
import { DB, initDb, authedReq } from "./helpers/http-fixture.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import { createServer } from "../src/http/server.js";
import { devHeaderResolver } from "../src/auth/resolve.js";
import { ADMIN_ROLE } from "../src/auth/authorize.js";
import { createUser, verifyLogin, DISPLAY_NAME_MAX_LENGTH } from "../src/auth/users.js";
import { publishBody, createDefinitionStore } from "../src/engine/definitions.js";
import { registerMigrationPlan } from "../src/engine/migration.js";
import type { Actor } from "../src/cel/eval.js";
import type { ProcessBody, Instance, MigrationSpec } from "../src/schema/definition.js";

const reg = createRegistry();
const dataSourceReg = createDataSourceRegistry();
const fetch = createServer(dataSourceReg, reg, sql, devHeaderResolver);

beforeAll(initDb);
beforeEach(async () => {
  if (DB) await sql`TRUNCATE outbox, instances, history_entries, instance_events, definitions, auth_users, migration_plans`;
});

const admin: Actor = { id: "user_admin", roles: [ADMIN_ROLE] };
const bystander: Actor = { id: "user_bystander", roles: [] };

const insertRow = async (opts: { key: string; instanceId?: string; status: string; attempts?: number }): Promise<void> => {
  await sql`INSERT INTO outbox (idempotency_key, instance_id, transition_seq, action_id, action, status, attempts)
    VALUES (${opts.key}, ${opts.instanceId ?? "inst_fixture"}, 1, ${"action_for_" + opts.key},
      ${{ id: "action_for_" + opts.key, type: "noop", config: {} }}, ${opts.status}, ${opts.attempts ?? 0})`;
};

// ---- migration fixtures (mirrors test/migration.test.ts's minimal shape) -----

let migrationN = 0;
const migrationPid = () => `proc_http_admin_migration_${++migrationN}` as Instance["processId"];

const migrationWaitBody = (key: string): ProcessBody =>
  ({
    key,
    label: { en: key },
    baseLocale: "en",
    fields: [],
    workflow: {
      initialStep: "step_wait",
      steps: [
        { id: "step_wait", key: "wait", label: { en: "Wait" }, type: "task", paths: [{ id: "path_done", key: "done", to: "step_done", trigger: "manual" }] },
        { id: "step_done", key: "done", label: { en: "Done" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

/** Publishes `count` distinct trivial versions (1..count) of the same process, label-stamped so each lands on its own version. */
const publishMigrationVersions = async (p: Instance["processId"], count: number): Promise<void> => {
  for (let i = 1; i <= count; i++) {
    const body = structuredClone(migrationWaitBody("http_admin_migration")) as Record<string, unknown>;
    body.label = { en: `http_admin_migration #${i}` };
    await publishBody(p, body as unknown as ProcessBody, reg, dataSourceReg);
  }
};

const createRunningInstance = async (p: Instance["processId"], version: number): Promise<Instance> => {
  const body = (await createDefinitionStore(sql).resolveBody(p, version))!;
  return createInstance(body, { processId: p, version }, sql);
};

/** `instances.version` is not a column — the pin lives inside the jsonb `body`. */
const loadInstance = async (instanceId: string): Promise<Instance> => {
  const r = (await sql`SELECT body FROM instances WHERE instance_id = ${instanceId}`) as { body: unknown }[];
  return JSON.parse(typeof r[0]!.body === "string" ? (r[0]!.body as string) : JSON.stringify(r[0]!.body)) as Instance;
};

// ============================================================
// GET /admin/outbox
// ============================================================

test.skipIf(!DB)("GET /admin/outbox with no resolvable credential maps to 401", async () => {
  const res = await fetch(new Request("http://x/admin/outbox"));
  expect(res.status).toBe(401);
});

test.skipIf(!DB)("GET /admin/outbox without system:admin maps to 403", async () => {
  const res = await fetch(authedReq("http://x/admin/outbox", "GET", bystander));
  expect(res.status).toBe(403);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("authorization");
});

test.skipIf(!DB)("GET /admin/outbox with system:admin succeeds, carrying the page and per-status counts", async () => {
  await insertRow({ key: "k1", status: "pending" });
  await insertRow({ key: "k2", status: "dead-letter" });

  const res = await fetch(authedReq("http://x/admin/outbox", "GET", admin));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { items: { idempotencyKey: string }[]; counts: Record<string, number> };
  expect(body.items.map((r) => r.idempotencyKey).sort()).toEqual(["k1", "k2"]);
  expect(body.counts).toEqual({ pending: 1, "dead-letter": 1 });
});

test.skipIf(!DB)("GET /admin/outbox?status=dead-letter filters", async () => {
  await insertRow({ key: "k1", status: "pending" });
  await insertRow({ key: "k2", status: "dead-letter" });

  const res = await fetch(authedReq("http://x/admin/outbox?status=dead-letter", "GET", admin));
  const body = (await res.json()) as { items: { idempotencyKey: string }[] };
  expect(body.items.map((r) => r.idempotencyKey)).toEqual(["k2"]);
});

// ============================================================
// POST /admin/outbox/:idempotencyKey/retry
// ============================================================

test.skipIf(!DB)("POST /admin/outbox/:key/retry with no resolvable credential maps to 401", async () => {
  const res = await fetch(new Request("http://x/admin/outbox/some_key/retry", { method: "POST" }));
  expect(res.status).toBe(401);
});

test.skipIf(!DB)("POST /admin/outbox/:key/retry without system:admin maps to 403 and performs no update", async () => {
  await insertRow({ key: "retry_403", status: "dead-letter" });
  const res = await fetch(authedReq("http://x/admin/outbox/retry_403/retry", "POST", bystander));
  expect(res.status).toBe(403);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("authorization");

  const row = (await sql`SELECT status FROM outbox WHERE idempotency_key = 'retry_403'`) as { status: string }[];
  expect(row[0]!.status).toBe("dead-letter"); // unchanged
});

test.skipIf(!DB)("POST /admin/outbox/:key/retry on a dead letter succeeds with the updated row", async () => {
  await insertRow({ key: "retry_ok", status: "dead-letter", attempts: 5 });
  const res = await fetch(authedReq("http://x/admin/outbox/retry_ok/retry", "POST", admin));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { status: string; attempts: number };
  expect(body.status).toBe("pending");
  expect(body.attempts).toBe(0);
});

test.skipIf(!DB)("POST /admin/outbox/:key/retry on an unknown key maps to 404", async () => {
  const res = await fetch(authedReq("http://x/admin/outbox/does_not_exist/retry", "POST", admin));
  expect(res.status).toBe(404);
});

test.skipIf(!DB)("POST /admin/outbox/:key/retry on a row that is not a dead letter maps to 409", async () => {
  await insertRow({ key: "retry_409", status: "pending" });
  const res = await fetch(authedReq("http://x/admin/outbox/retry_409/retry", "POST", admin));
  expect(res.status).toBe(409);
});

// ============================================================
// POST /admin/outbox/:idempotencyKey/discard
// ============================================================

test.skipIf(!DB)("POST /admin/outbox/:key/discard with no resolvable credential maps to 401", async () => {
  const res = await fetch(new Request("http://x/admin/outbox/some_key/discard", { method: "POST" }));
  expect(res.status).toBe(401);
});

test.skipIf(!DB)("POST /admin/outbox/:key/discard without system:admin maps to 403 and performs no update", async () => {
  await insertRow({ key: "discard_403", status: "dead-letter" });
  const res = await fetch(authedReq("http://x/admin/outbox/discard_403/discard", "POST", bystander));
  expect(res.status).toBe(403);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("authorization");

  const row = (await sql`SELECT status FROM outbox WHERE idempotency_key = 'discard_403'`) as { status: string }[];
  expect(row[0]!.status).toBe("dead-letter"); // unchanged
});

test.skipIf(!DB)("POST /admin/outbox/:key/discard on a dead letter succeeds with the updated row", async () => {
  await insertRow({ key: "discard_ok", status: "dead-letter" });
  const res = await fetch(authedReq("http://x/admin/outbox/discard_ok/discard", "POST", admin));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { status: string };
  expect(body.status).toBe("discarded");
});

test.skipIf(!DB)("POST /admin/outbox/:key/discard on an unknown key maps to 404", async () => {
  const res = await fetch(authedReq("http://x/admin/outbox/does_not_exist/discard", "POST", admin));
  expect(res.status).toBe(404);
});

test.skipIf(!DB)("POST /admin/outbox/:key/discard on a row that is not a dead letter maps to 409", async () => {
  await insertRow({ key: "discard_409", status: "delivered" });
  const res = await fetch(authedReq("http://x/admin/outbox/discard_409/discard", "POST", admin));
  expect(res.status).toBe(409);
});

// ============================================================
// GET /admin/timers
// ============================================================

test.skipIf(!DB)("GET /admin/timers with no resolvable credential maps to 401", async () => {
  const res = await fetch(new Request("http://x/admin/timers"));
  expect(res.status).toBe(401);
});

test.skipIf(!DB)("GET /admin/timers without system:admin maps to 403", async () => {
  const res = await fetch(authedReq("http://x/admin/timers", "GET", bystander));
  expect(res.status).toBe(403);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("authorization");
});

test.skipIf(!DB)("GET /admin/timers with system:admin succeeds", async () => {
  const res = await fetch(authedReq("http://x/admin/timers", "GET", admin));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { items: unknown[] };
  expect(body.items).toEqual([]);
});

// ============================================================
// GET /admin/users
// ============================================================

test.skipIf(!DB)("GET /admin/users with no resolvable credential maps to 401", async () => {
  const res = await fetch(new Request("http://x/admin/users"));
  expect(res.status).toBe(401);
});

test.skipIf(!DB)("GET /admin/users without system:admin maps to 403", async () => {
  const res = await fetch(authedReq("http://x/admin/users", "GET", bystander));
  expect(res.status).toBe(403);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("authorization");
});

test.skipIf(!DB)("GET /admin/users with system:admin lists users without password_hash", async () => {
  const { userId } = await createUser("u1@example.com", "pw", ["employee"]);
  const res = await fetch(authedReq("http://x/admin/users", "GET", admin));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { items: Record<string, unknown>[] };
  expect(body.items).toHaveLength(1);
  expect(body.items[0]!.userId).toBe(userId);
  expect(body.items[0]!.email).toBe("u1@example.com");
  expect(body.items[0]!.roles).toEqual(["employee"]);
  expect(body.items[0]!.disabled).toBe(false);
  expect(body.items[0]).not.toHaveProperty("password_hash");
});

test.skipIf(!DB)("GET /admin/users pages with limit plus cursor, dropping and repeating no row", async () => {
  const emails = ["p1@example.com", "p2@example.com", "p3@example.com", "p4@example.com", "p5@example.com"];
  await sql`
    INSERT INTO auth_users (user_id, email, password_hash)
    SELECT id, email, 'not-a-real-hash'
    FROM UNNEST(${sql.array(emails.map((_, i) => `user_page_${i}`), "TEXT")}::text[], ${sql.array(emails, "TEXT")}::text[]) AS t(id, email)
  `;

  const seen: string[] = [];
  let url = "http://x/admin/users?limit=2";
  for (;;) {
    const res = await fetch(authedReq(url, "GET", admin));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { email: string }[]; cursor?: string };
    seen.push(...body.items.map((u) => u.email));
    if (!body.cursor) break;
    url = `http://x/admin/users?limit=2&cursor=${encodeURIComponent(body.cursor)}`;
  }
  expect(seen).toEqual(emails);
});

test.skipIf(!DB)("GET /admin/users refuses a limit that is not a positive integer", async () => {
  const res = await fetch(authedReq("http://x/admin/users?limit=0", "GET", admin));
  expect(res.status).toBe(400);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("request-shape");
});

// ============================================================
// POST /admin/users
// ============================================================

test.skipIf(!DB)("POST /admin/users with no resolvable credential maps to 401", async () => {
  const res = await fetch(new Request("http://x/admin/users", { method: "POST" }));
  expect(res.status).toBe(401);
});

test.skipIf(!DB)("POST /admin/users without system:admin maps to 403 and writes no row", async () => {
  const res = await fetch(authedReq("http://x/admin/users", "POST", bystander, { email: "new@example.com", password: "pw" }));
  expect(res.status).toBe(403);
  const rows = (await sql`SELECT count(*)::int AS n FROM auth_users`) as { n: number }[];
  expect(rows[0]!.n).toBe(0);
});

test.skipIf(!DB)("POST /admin/users creates the account, answers 201, and that account can log in", async () => {
  const res = await fetch(authedReq("http://x/admin/users", "POST", admin, { email: "jane@example.com", password: "temp-pw-1", roles: ["finance:approver"] }));
  expect(res.status).toBe(201);
  const body = (await res.json()) as { userId: string; email: string; roles: string[]; disabled: boolean };
  expect(body.email).toBe("jane@example.com");
  expect(body.roles).toEqual(["finance:approver"]);
  expect(body.disabled).toBe(false);
  expect(body).not.toHaveProperty("password_hash");
  expect(await verifyLogin("jane@example.com", "temp-pw-1")).toMatchObject({ userId: body.userId });
});

test.skipIf(!DB)("POST /admin/users with no roles field creates the account with an empty set", async () => {
  const res = await fetch(authedReq("http://x/admin/users", "POST", admin, { email: "norole@example.com", password: "pw" }));
  expect(res.status).toBe(201);
  const body = (await res.json()) as { roles: string[] };
  expect(body.roles).toEqual([]);
});

// The create route stores no display name: `PATCH /admin/users/:id/name` is
// the one route that writes that column. The resolved name is the email until
// somebody sets one.
test.skipIf(!DB)("POST /admin/users leaves display_name NULL and resolves displayName to the email", async () => {
  const res = await fetch(authedReq("http://x/admin/users", "POST", admin, { email: "noname@example.com", password: "pw" }));
  expect(res.status).toBe(201);
  const body = (await res.json()) as { userId: string; displayName: string };
  expect(body.displayName).toBe("noname@example.com");
  const rows = (await sql`SELECT display_name FROM auth_users WHERE user_id = ${body.userId}`) as { display_name: string | null }[];
  expect(rows[0]!.display_name).toBeNull();
});

test.skipIf(!DB)("POST /admin/users maps a duplicate email to 409 and writes no second row", async () => {
  await createUser("taken@example.com", "pw", []);
  const res = await fetch(authedReq("http://x/admin/users", "POST", admin, { email: "taken@example.com", password: "other-pw" }));
  expect(res.status).toBe(409);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("email-in-use");
  const rows = (await sql`SELECT count(*)::int AS n FROM auth_users WHERE email = 'taken@example.com'`) as { n: number }[];
  expect(rows[0]!.n).toBe(1);
});

test.skipIf(!DB)("POST /admin/users refuses a missing or blank email or password with 400", async () => {
  const bodies = [
    {},
    { email: "a@example.com" },
    { password: "pw" },
    { email: "", password: "pw" },
    { email: "   ", password: "pw" },
    { email: "a@example.com", password: "" },
    { email: "a@example.com", password: "   " },
    { email: 7, password: "pw" },
  ];
  for (const body of bodies) {
    const res = await fetch(authedReq("http://x/admin/users", "POST", admin, body));
    expect(res.status).toBe(400);
  }
  const rows = (await sql`SELECT count(*)::int AS n FROM auth_users`) as { n: number }[];
  expect(rows[0]!.n).toBe(0);
});

test.skipIf(!DB)("POST /admin/users refuses an out-of-bounds role set with 400 and writes no row", async () => {
  const overLong = { email: "r1@example.com", password: "pw", roles: ["x".repeat(65)] };
  const overMany = { email: "r2@example.com", password: "pw", roles: Array.from({ length: 65 }, (_, i) => `role-${i}`) };
  for (const body of [overLong, overMany]) {
    const res = await fetch(authedReq("http://x/admin/users", "POST", admin, body));
    expect(res.status).toBe(400);
  }
  const rows = (await sql`SELECT count(*)::int AS n FROM auth_users`) as { n: number }[];
  expect(rows[0]!.n).toBe(0);
});

test.skipIf(!DB)("POST /admin/users trims and deduplicates roles, like the roles route", async () => {
  const res = await fetch(authedReq("http://x/admin/users", "POST", admin, { email: "dedup@example.com", password: "pw", roles: [" a ", "b", "a"] }));
  expect(res.status).toBe(201);
  const body = (await res.json()) as { roles: string[] };
  expect(body.roles).toEqual(["a", "b"]);
});

// ============================================================
// POST /admin/users/:id/password
// ============================================================

test.skipIf(!DB)("POST /admin/users/:id/password with no resolvable credential maps to 401", async () => {
  const res = await fetch(new Request("http://x/admin/users/user_x/password", { method: "POST" }));
  expect(res.status).toBe(401);
});

test.skipIf(!DB)("POST /admin/users/:id/password without system:admin maps to 403 and leaves the hash alone", async () => {
  const { userId } = await createUser("keep@example.com", "old-pw", []);
  const res = await fetch(authedReq(`http://x/admin/users/${userId}/password`, "POST", bystander, { password: "new-pw" }));
  expect(res.status).toBe(403);
  expect(await verifyLogin("keep@example.com", "old-pw")).toBeDefined();
});

test.skipIf(!DB)("POST /admin/users/:id/password answers 200, the new password logs in, and the old one stops", async () => {
  const { userId } = await createUser("reset@example.com", "old-pw", ["employee"]);
  const res = await fetch(authedReq(`http://x/admin/users/${userId}/password`, "POST", admin, { password: "new-pw" }));
  expect(res.status).toBe(200);
  const body = (await res.json()) as Record<string, unknown>;
  expect(body.userId).toBe(userId);
  expect(body.email).toBe("reset@example.com");
  expect(body.roles).toEqual(["employee"]);
  expect(body.disabled).toBe(false);
  expect(body).not.toHaveProperty("password_hash");
  expect(await verifyLogin("reset@example.com", "new-pw")).toMatchObject({ userId });
  expect(await verifyLogin("reset@example.com", "old-pw")).toBeUndefined();
});

test.skipIf(!DB)("POST /admin/users/:id/password maps an unknown userId to 404", async () => {
  const res = await fetch(authedReq("http://x/admin/users/user_does_not_exist/password", "POST", admin, { password: "new-pw" }));
  expect(res.status).toBe(404);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("not-found");
});

test.skipIf(!DB)("POST /admin/users/:id/password refuses a missing or blank password with 400 and leaves the hash alone", async () => {
  const { userId } = await createUser("blank@example.com", "old-pw", []);
  for (const body of [{}, { password: "" }, { password: "   " }, { password: 7 }]) {
    const res = await fetch(authedReq(`http://x/admin/users/${userId}/password`, "POST", admin, body));
    expect(res.status).toBe(400);
  }
  expect(await verifyLogin("blank@example.com", "old-pw")).toBeDefined();
});

// ============================================================
// POST /admin/users/:id/disable and /enable
// ============================================================

test.skipIf(!DB)("POST /admin/users/:id/disable with no resolvable credential maps to 401", async () => {
  const res = await fetch(new Request("http://x/admin/users/user_x/disable", { method: "POST" }));
  expect(res.status).toBe(401);
});

test.skipIf(!DB)("POST /admin/users/:id/disable without system:admin maps to 403 and performs no update", async () => {
  const { userId } = await createUser("u2@example.com", "pw", []);
  const res = await fetch(authedReq(`http://x/admin/users/${userId}/disable`, "POST", bystander));
  expect(res.status).toBe(403);
  const row = (await sql`SELECT disabled FROM auth_users WHERE user_id = ${userId}`) as { disabled: boolean }[];
  expect(row[0]!.disabled).toBe(false);
});

test.skipIf(!DB)("POST /admin/users/:id/disable succeeds and the user cannot log in afterwards", async () => {
  const { userId } = await createUser("u3@example.com", "correct-horse", []);
  const res = await fetch(authedReq(`http://x/admin/users/${userId}/disable`, "POST", admin));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { disabled: boolean };
  expect(body.disabled).toBe(true);
  const row = (await sql`SELECT disabled FROM auth_users WHERE user_id = ${userId}`) as { disabled: boolean }[];
  expect(row[0]!.disabled).toBe(true);
});

test.skipIf(!DB)("POST /admin/users/:id/disable on an unknown id maps to 404", async () => {
  const res = await fetch(authedReq("http://x/admin/users/user_does_not_exist/disable", "POST", admin));
  expect(res.status).toBe(404);
});

test.skipIf(!DB)("POST /admin/users/:id/enable succeeds and clears disabled", async () => {
  const { userId } = await createUser("u4@example.com", "pw", []);
  await sql`UPDATE auth_users SET disabled = true WHERE user_id = ${userId}`;
  const res = await fetch(authedReq(`http://x/admin/users/${userId}/enable`, "POST", admin));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { disabled: boolean };
  expect(body.disabled).toBe(false);
});

test.skipIf(!DB)("POST /admin/users/:id/enable on an unknown id maps to 404", async () => {
  const res = await fetch(authedReq("http://x/admin/users/user_does_not_exist/enable", "POST", admin));
  expect(res.status).toBe(404);
});

// ============================================================
// PATCH /admin/users/:id/roles
// ============================================================

const rolesReq = (userId: string, body: unknown, actor: Actor) =>
  new Request(`http://x/admin/users/${userId}/roles`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "X-Actor-Id": actor.id,
      ...(actor.roles.length > 0 ? { "X-Actor-Roles": actor.roles.join(",") } : {}),
    },
    body: JSON.stringify(body),
  });

const storedRoles = async (userId: string): Promise<string[]> => {
  const rows = (await sql`SELECT roles FROM auth_users WHERE user_id = ${userId}`) as { roles: string[] }[];
  return rows[0]!.roles;
};

test.skipIf(!DB)("PATCH /admin/users/:id/roles with system:admin replaces the whole set", async () => {
  const { userId } = await createUser("r1@example.com", "pw", ["a", "b"]);
  const res = await fetch(rolesReq(userId, { roles: ["a", "finance:approver"] }, admin));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { roles: string[] };
  expect(body.roles).toEqual(["a", "finance:approver"]);
  expect(await storedRoles(userId)).toEqual(["a", "finance:approver"]);
});

test.skipIf(!DB)("PATCH /admin/users/:id/roles removes a role the request omits", async () => {
  const { userId } = await createUser("r2@example.com", "pw", ["a", "b"]);
  const res = await fetch(rolesReq(userId, { roles: ["a"] }, admin));
  expect(res.status).toBe(200);
  expect(await storedRoles(userId)).toEqual(["a"]);
});

test.skipIf(!DB)("PATCH /admin/users/:id/roles refuses each malformed body with 400 and no write", async () => {
  const { userId } = await createUser("r3@example.com", "pw", ["keep"]);
  const bodies: unknown[] = [
    {},
    { roles: "finance:approver" },
    { roles: ["a", 1] },
    { roles: ["a", "   "] },
    { roles: ["a", "x".repeat(65)] },
    { roles: Array.from({ length: 65 }, (_, i) => `role${i}`) },
  ];
  for (const body of bodies) {
    const res = await fetch(rolesReq(userId, body, admin));
    expect(res.status).toBe(400);
  }
  expect(await storedRoles(userId)).toEqual(["keep"]);
});

test.skipIf(!DB)("PATCH /admin/users/:id/roles trims and deduplicates, first occurrence winning", async () => {
  const { userId } = await createUser("r4@example.com", "pw", []);
  const res = await fetch(rolesReq(userId, { roles: [" a ", "b", "a"] }, admin));
  expect(res.status).toBe(200);
  expect(await storedRoles(userId)).toEqual(["a", "b"]);
});

test.skipIf(!DB)("PATCH /admin/users/:id/roles accepts a role string no system:* shape matches", async () => {
  const { userId } = await createUser("r5@example.com", "pw", []);
  const odd = "Abteilung Süd / Freigabe-2";
  const res = await fetch(rolesReq(userId, { roles: [odd] }, admin));
  expect(res.status).toBe(200);
  expect(await storedRoles(userId)).toEqual([odd]);
});

test.skipIf(!DB)("PATCH /admin/users/:id/roles on an unknown id maps to 404", async () => {
  const res = await fetch(rolesReq("user_does_not_exist", { roles: ["a"] }, admin));
  expect(res.status).toBe(404);
});

test.skipIf(!DB)("PATCH /admin/users/:id/roles without system:admin maps to 403 and performs no update", async () => {
  const { userId } = await createUser("r6@example.com", "pw", ["keep"]);
  const res = await fetch(rolesReq(userId, { roles: ["changed"] }, bystander));
  expect(res.status).toBe(403);
  expect(await storedRoles(userId)).toEqual(["keep"]);
});

test.skipIf(!DB)("PATCH /admin/users/:id/roles refuses to strip system:admin from the calling actor", async () => {
  const { userId } = await createUser("r7@example.com", "pw", [ADMIN_ROLE, "a"]);
  const self: Actor = { id: userId, roles: [ADMIN_ROLE] };
  const res = await fetch(rolesReq(userId, { roles: ["a"] }, self));
  expect(res.status).toBe(409);
  expect(await storedRoles(userId)).toEqual([ADMIN_ROLE, "a"]);
});

test.skipIf(!DB)("PATCH /admin/users/:id/roles lets the calling actor change its own other roles", async () => {
  const { userId } = await createUser("r8@example.com", "pw", [ADMIN_ROLE, "a"]);
  const self: Actor = { id: userId, roles: [ADMIN_ROLE] };
  const res = await fetch(rolesReq(userId, { roles: [ADMIN_ROLE, "b"] }, self));
  expect(res.status).toBe(200);
  expect(await storedRoles(userId)).toEqual([ADMIN_ROLE, "b"]);
});

test.skipIf(!DB)("PATCH /admin/users/:id/roles lets one admin strip another admin's role", async () => {
  const { userId } = await createUser("r9@example.com", "pw", [ADMIN_ROLE]);
  const res = await fetch(rolesReq(userId, { roles: ["a"] }, admin));
  expect(res.status).toBe(200);
  expect(await storedRoles(userId)).toEqual(["a"]);
});

// ============================================================
// PATCH /admin/users/:id/manager
// ============================================================

const managerReq = (userId: string, body: unknown, actor: Actor) =>
  new Request(`http://x/admin/users/${userId}/manager`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "X-Actor-Id": actor.id,
      ...(actor.roles.length > 0 ? { "X-Actor-Roles": actor.roles.join(",") } : {}),
    },
    body: JSON.stringify(body),
  });

const storedManager = async (userId: string): Promise<string | null> => {
  const rows = (await sql`SELECT manager_user_id FROM auth_users WHERE user_id = ${userId}`) as { manager_user_id: string | null }[];
  return rows[0]!.manager_user_id;
};

test.skipIf(!DB)("PATCH /admin/users/:id/manager with system:admin sets the manager", async () => {
  const boss = await createUser("m-boss@example.com", "pw", []);
  const staff = await createUser("m-staff@example.com", "pw", []);
  const res = await fetch(managerReq(staff.userId, { managerUserId: boss.userId }, admin));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { managerUserId: string };
  expect(body.managerUserId).toBe(boss.userId);
  expect(await storedManager(staff.userId)).toBe(boss.userId);
});

test.skipIf(!DB)("PATCH /admin/users/:id/manager with null clears the manager", async () => {
  const boss = await createUser("m-boss2@example.com", "pw", []);
  const staff = await createUser("m-staff2@example.com", "pw", []);
  await fetch(managerReq(staff.userId, { managerUserId: boss.userId }, admin));
  const res = await fetch(managerReq(staff.userId, { managerUserId: null }, admin));
  expect(res.status).toBe(200);
  expect(await storedManager(staff.userId)).toBeNull();
});

test.skipIf(!DB)("PATCH /admin/users/:id/manager naming no account is 400 with no write", async () => {
  const staff = await createUser("m-staff3@example.com", "pw", []);
  const res = await fetch(managerReq(staff.userId, { managerUserId: "user_does_not_exist" }, admin));
  expect(res.status).toBe(400);
  expect(await storedManager(staff.userId)).toBeNull();
});

test.skipIf(!DB)("PATCH /admin/users/:id/manager refuses a self-pointer with 400 and no write", async () => {
  const staff = await createUser("m-staff4@example.com", "pw", []);
  const res = await fetch(managerReq(staff.userId, { managerUserId: staff.userId }, admin));
  expect(res.status).toBe(400);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("self-manager");
  expect(await storedManager(staff.userId)).toBeNull();
});

test.skipIf(!DB)("PATCH /admin/users/:id/manager accepts a two-account cycle", async () => {
  // Nothing walks the pointer, so a cycle has no effect and is not refused.
  const a = await createUser("m-cyc-a@example.com", "pw", []);
  const b = await createUser("m-cyc-b@example.com", "pw", []);
  expect((await fetch(managerReq(a.userId, { managerUserId: b.userId }, admin))).status).toBe(200);
  expect((await fetch(managerReq(b.userId, { managerUserId: a.userId }, admin))).status).toBe(200);
  expect(await storedManager(a.userId)).toBe(b.userId);
  expect(await storedManager(b.userId)).toBe(a.userId);
});

test.skipIf(!DB)("PATCH /admin/users/:id/manager refuses a malformed body with 400 and no write", async () => {
  const boss = await createUser("m-boss5@example.com", "pw", []);
  const staff = await createUser("m-staff5@example.com", "pw", []);
  await fetch(managerReq(staff.userId, { managerUserId: boss.userId }, admin));
  for (const body of [{}, { managerUserId: 7 }, { managerUserId: "   " }, { managerUserId: [] }]) {
    const res = await fetch(managerReq(staff.userId, body, admin));
    expect(res.status).toBe(400);
  }
  expect(await storedManager(staff.userId)).toBe(boss.userId);
});

test.skipIf(!DB)("PATCH /admin/users/:id/manager on an unknown id maps to 404", async () => {
  const boss = await createUser("m-boss6@example.com", "pw", []);
  const res = await fetch(managerReq("user_does_not_exist", { managerUserId: boss.userId }, admin));
  expect(res.status).toBe(404);
});

test.skipIf(!DB)("PATCH /admin/users/:id/manager without system:admin maps to 403 and performs no update", async () => {
  const boss = await createUser("m-boss7@example.com", "pw", []);
  const staff = await createUser("m-staff7@example.com", "pw", []);
  const res = await fetch(managerReq(staff.userId, { managerUserId: boss.userId }, bystander));
  expect(res.status).toBe(403);
  expect(await storedManager(staff.userId)).toBeNull();
});

test.skipIf(!DB)("GET /admin/users carries each account's manager", async () => {
  const boss = await createUser("m-boss8@example.com", "pw", []);
  const staff = await createUser("m-staff8@example.com", "pw", []);
  await fetch(managerReq(staff.userId, { managerUserId: boss.userId }, admin));
  const res = await fetch(authedReq("http://x/admin/users", "GET", admin));
  expect(res.status).toBe(200);
  const { items } = (await res.json()) as { items: { userId: string; managerUserId?: string }[] };
  expect(items.find((u) => u.userId === staff.userId)!.managerUserId).toBe(boss.userId);
  expect(items.find((u) => u.userId === boss.userId)!.managerUserId).toBeUndefined();
});

// `admin.id` backs no auth_users row here, the shape an external issuer produces.
test.skipIf(!DB)("PATCH /admin/users/:id/roles decides the self-strip guard ahead of the unknown-user 404", async () => {
  const res = await fetch(rolesReq(admin.id, { roles: ["a"] }, admin));
  expect(res.status).toBe(409);
});

test.skipIf(!DB)("PATCH /admin/users/:id/roles returns its 409 in the existing error envelope", async () => {
  const res = await fetch(rolesReq(admin.id, { roles: ["a"] }, admin));
  expect(res.status).toBe(409);
  const body = (await res.json()) as { error: { type: string; message: string } };
  expect(body.error.type).toBe("self-role-strip");
  expect(typeof body.error.message).toBe("string");
});

// ============================================================
// PATCH /admin/users/:id/name
// ============================================================

const nameReq = (userId: string, body: unknown, actor: Actor) =>
  new Request(`http://x/admin/users/${userId}/name`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "X-Actor-Id": actor.id,
      ...(actor.roles.length > 0 ? { "X-Actor-Roles": actor.roles.join(",") } : {}),
    },
    body: JSON.stringify(body),
  });

const storedName = async (userId: string): Promise<string | null> => {
  const rows = (await sql`SELECT display_name FROM auth_users WHERE user_id = ${userId}`) as { display_name: string | null }[];
  return rows[0]!.display_name;
};

test.skipIf(!DB)("PATCH /admin/users/:id/name with system:admin sets the display name", async () => {
  const { userId } = await createUser("n1@example.com", "pw", []);
  const res = await fetch(nameReq(userId, { displayName: "Rita Alvarez" }, admin));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { displayName: string };
  expect(body.displayName).toBe("Rita Alvarez");
  expect(await storedName(userId)).toBe("Rita Alvarez");
});

test.skipIf(!DB)("PATCH /admin/users/:id/name with null clears it and the returned row falls back to the email", async () => {
  const { userId } = await createUser("n2@example.com", "pw", [], "Rita Alvarez");
  const res = await fetch(nameReq(userId, { displayName: null }, admin));
  expect(res.status).toBe(200);
  expect(((await res.json()) as { displayName: string }).displayName).toBe("n2@example.com");
  expect(await storedName(userId)).toBeNull();
});

test.skipIf(!DB)("PATCH /admin/users/:id/name trims surrounding whitespace before storage", async () => {
  const { userId } = await createUser("n3@example.com", "pw", []);
  const res = await fetch(nameReq(userId, { displayName: "  Rita Alvarez  " }, admin));
  expect(res.status).toBe(200);
  expect(await storedName(userId)).toBe("Rita Alvarez");
});

test.skipIf(!DB)("PATCH /admin/users/:id/name refuses each malformed or empty body with 400 and no write", async () => {
  // The route rejects an empty-after-trim value rather than normalizing it to
  // NULL the way `setDisplayName` does — telling the caller beats a silent clear.
  const { userId } = await createUser("n4@example.com", "pw", [], "Keep Me");
  for (const body of [{}, { displayName: 7 }, { displayName: [] }, { displayName: "" }, { displayName: "   " }]) {
    const res = await fetch(nameReq(userId, body, admin));
    expect(res.status).toBe(400);
  }
  expect(await storedName(userId)).toBe("Keep Me");
});

test.skipIf(!DB)("PATCH /admin/users/:id/name refuses a name over the bound with 400 and no write, and accepts one at it", async () => {
  const { userId } = await createUser("n5@example.com", "pw", [], "Keep Me");
  const tooLong = await fetch(nameReq(userId, { displayName: "x".repeat(DISPLAY_NAME_MAX_LENGTH + 1) }, admin));
  expect(tooLong.status).toBe(400);
  expect(await storedName(userId)).toBe("Keep Me");

  const atBound = "x".repeat(DISPLAY_NAME_MAX_LENGTH);
  expect((await fetch(nameReq(userId, { displayName: atBound }, admin))).status).toBe(200);
  expect(await storedName(userId)).toBe(atBound);
});

test.skipIf(!DB)("PATCH /admin/users/:id/name on an unknown id maps to 404", async () => {
  const res = await fetch(nameReq("user_does_not_exist", { displayName: "Rita Alvarez" }, admin));
  expect(res.status).toBe(404);
});

test.skipIf(!DB)("PATCH /admin/users/:id/name without system:admin maps to 403 and performs no update", async () => {
  const { userId } = await createUser("n6@example.com", "pw", []);
  const res = await fetch(nameReq(userId, { displayName: "Rita Alvarez" }, bystander));
  expect(res.status).toBe(403);
  expect(await storedName(userId)).toBeNull();
});

test.skipIf(!DB)("GET /admin/users carries each account's resolved display name", async () => {
  const named = await createUser("n7@example.com", "pw", [], "Rita Alvarez");
  const unnamed = await createUser("n8@example.com", "pw", []);
  const res = await fetch(authedReq("http://x/admin/users", "GET", admin));
  expect(res.status).toBe(200);
  const { items } = (await res.json()) as { items: { userId: string; displayName: string }[] };
  expect(items.find((u) => u.userId === named.userId)!.displayName).toBe("Rita Alvarez");
  expect(items.find((u) => u.userId === unnamed.userId)!.displayName).toBe("n8@example.com");
});

test.skipIf(!DB)("the roles, enable and manager routes each return the stored display name, not the email", async () => {
  // All three share `toSummary`; a column list missing `display_name` in one of
  // them answers with the email while the stored name says otherwise.
  const boss = await createUser("n9-boss@example.com", "pw", []);
  const { userId } = await createUser("n9@example.com", "pw", [], "Rita Alvarez");
  const responses = [
    await fetch(rolesReq(userId, { roles: ["employee"] }, admin)),
    await fetch(authedReq(`http://x/admin/users/${userId}/enable`, "POST", admin)),
    await fetch(managerReq(userId, { managerUserId: boss.userId }, admin)),
  ];
  for (const res of responses) {
    expect(res.status).toBe(200);
    expect(((await res.json()) as { displayName: string }).displayName).toBe("Rita Alvarez");
  }
});

// ============================================================
// POST /admin/migrations/run
// ============================================================

const runMigrationReq = (body: unknown, actor: Actor) =>
  new Request("http://x/admin/migrations/run", {
    method: "POST",
    headers: { "content-type": "application/json", "X-Actor-Id": actor.id, ...(actor.roles.length > 0 ? { "X-Actor-Roles": actor.roles.join(",") } : {}) },
    body: JSON.stringify(body),
  });

test.skipIf(!DB)("POST /admin/migrations/run with no resolvable credential maps to 401", async () => {
  const res = await fetch(new Request("http://x/admin/migrations/run", { method: "POST", body: "{}" }));
  expect(res.status).toBe(401);
});

test.skipIf(!DB)("POST /admin/migrations/run without system:admin maps to 403 and migrates nothing", async () => {
  const p = migrationPid();
  await publishMigrationVersions(p, 2);
  await registerMigrationPlan(p, 1, 2, {} as MigrationSpec, sql);
  const inst = await createRunningInstance(p, 1);

  const res = await fetch(runMigrationReq({ processId: p, fromVersion: 1, toVersion: 2 }, bystander));
  expect(res.status).toBe(403);

  expect((await loadInstance(inst.instanceId)).version).toBe(1);
});

test.skipIf(!DB)("POST /admin/migrations/run on a registered plan migrates the running instance", async () => {
  const p = migrationPid();
  await publishMigrationVersions(p, 2);
  await registerMigrationPlan(p, 1, 2, {} as MigrationSpec, sql);
  const inst = await createRunningInstance(p, 1);

  const res = await fetch(runMigrationReq({ processId: p, fromVersion: 1, toVersion: 2 }, admin));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { migrated: string[]; skipped: string[]; conflicted: string[]; failed: string[] };
  expect(body.migrated).toEqual([inst.instanceId]);
  expect(body.skipped).toEqual([]);
  expect(body.conflicted).toEqual([]);
  expect(body.failed).toEqual([]);

  expect((await loadInstance(inst.instanceId)).version).toBe(2);
});

test.skipIf(!DB)("POST /admin/migrations/run with no registered plan maps to 409", async () => {
  const p = migrationPid();
  await publishMigrationVersions(p, 2);

  const res = await fetch(runMigrationReq({ processId: p, fromVersion: 1, toVersion: 2 }, admin));
  expect(res.status).toBe(409);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("migration-plan");
});

test.skipIf(!DB)("POST /admin/migrations/run with a non-integer fromVersion maps to a request error", async () => {
  const p = migrationPid();
  const res = await fetch(runMigrationReq({ processId: p, fromVersion: "not-a-number", toVersion: 2 }, admin));
  expect(res.status).toBe(400);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("request-shape");
});

// ============================================================
// CORS preflight
// ============================================================

test("OPTIONS preflight on the admin outbox route returns 204 permitting GET", async () => {
  const res = await fetch(new Request("http://x/admin/outbox", { method: "OPTIONS" }));
  expect(res.status).toBe(204);
  expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET");
});

test("OPTIONS preflight on the admin outbox retry route returns 204 permitting POST", async () => {
  const res = await fetch(new Request("http://x/admin/outbox/key_x/retry", { method: "OPTIONS" }));
  expect(res.status).toBe(204);
  expect(res.headers.get("Access-Control-Allow-Methods")).toBe("POST");
});

test("OPTIONS preflight on the admin outbox discard route returns 204 permitting POST", async () => {
  const res = await fetch(new Request("http://x/admin/outbox/key_x/discard", { method: "OPTIONS" }));
  expect(res.status).toBe(204);
  expect(res.headers.get("Access-Control-Allow-Methods")).toBe("POST");
});

test("OPTIONS preflight on the admin timers route returns 204 permitting GET", async () => {
  const res = await fetch(new Request("http://x/admin/timers", { method: "OPTIONS" }));
  expect(res.status).toBe(204);
  expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET");
});

// Two routes share this path now: the list and the create. `server.ts` derives
// the preflight answer from the route table, so the header names both without
// a second entry anywhere.
test("OPTIONS preflight on the admin users route returns 204 permitting GET and POST", async () => {
  const res = await fetch(new Request("http://x/admin/users", { method: "OPTIONS" }));
  expect(res.status).toBe(204);
  expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST");
});

// Without this the admin screen's password reset fails in a browser and
// nowhere else: the POST never leaves, because its preflight has no handler.
test("OPTIONS preflight on the admin users password route returns 204 permitting POST", async () => {
  const res = await fetch(new Request("http://x/admin/users/user_x/password", { method: "OPTIONS" }));
  expect(res.status).toBe(204);
  expect(res.headers.get("Access-Control-Allow-Methods")).toBe("POST");
});

test("OPTIONS preflight on the admin users disable route returns 204 permitting POST", async () => {
  const res = await fetch(new Request("http://x/admin/users/user_x/disable", { method: "OPTIONS" }));
  expect(res.status).toBe(204);
  expect(res.headers.get("Access-Control-Allow-Methods")).toBe("POST");
});

test("OPTIONS preflight on the admin users enable route returns 204 permitting POST", async () => {
  const res = await fetch(new Request("http://x/admin/users/user_x/enable", { method: "OPTIONS" }));
  expect(res.status).toBe(204);
  expect(res.headers.get("Access-Control-Allow-Methods")).toBe("POST");
});

// `POST /admin/users` and `POST /admin/users/:id/password` left this list in
// `admin-user-onboarding`: both answer for real now, behind `system:admin`.
// What stays absent is anything unauthenticated (`/auth/register`) and the
// writes no route carries at all — a replaced collection, an email change.
test.skipIf(!DB)("no route registers a caller, replaces the collection, or changes an email", async () => {
  const absent = [
    ["PUT", "http://x/admin/users"],
    ["PATCH", "http://x/admin/users/user_x/password"],
    ["POST", "http://x/admin/users/user_x/email"],
    ["POST", "http://x/auth/register"],
  ] as const;
  for (const [method, url] of absent) {
    const res = await fetch(authedReq(url, method, admin));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { type: string; message: string } };
    expect(body.error.type).toBe("not-found");
    expect(body.error.message).toStartWith("no route:");
  }
});

test("OPTIONS preflight on the admin users roles route returns 204 permitting PATCH", async () => {
  const res = await fetch(new Request("http://x/admin/users/user_x/roles", { method: "OPTIONS" }));
  expect(res.status).toBe(204);
  expect(res.headers.get("Access-Control-Allow-Methods")).toBe("PATCH");
});

// Without this the admin screen's manager save fails in a browser and nowhere
// else: the PATCH never leaves, because its preflight has no handler.
test("OPTIONS preflight on the admin users manager route returns 204 permitting PATCH", async () => {
  const res = await fetch(new Request("http://x/admin/users/user_x/manager", { method: "OPTIONS" }));
  expect(res.status).toBe(204);
  expect(res.headers.get("Access-Control-Allow-Methods")).toBe("PATCH");
});

// Nothing in packages/web calls this route yet: the admin area's client
// (areas/admin/api/client.ts) covers the list, disable, enable, roles and
// manager and stops there. The preflight still matters, because the first
// caller added would hit the same browser-only failure the manager route's
// preflight covers — the PATCH never leaves, since its preflight has no
// handler, while a test calling the route directly keeps passing.
test("OPTIONS preflight on the admin users name route returns 204 permitting PATCH", async () => {
  const res = await fetch(new Request("http://x/admin/users/user_x/name", { method: "OPTIONS" }));
  expect(res.status).toBe(204);
  expect(res.headers.get("Access-Control-Allow-Methods")).toBe("PATCH");
});

test("OPTIONS preflight on the admin migrations run route returns 204 permitting POST", async () => {
  const res = await fetch(new Request("http://x/admin/migrations/run", { method: "OPTIONS" }));
  expect(res.status).toBe(204);
  expect(res.headers.get("Access-Control-Allow-Methods")).toBe("POST");
});

test("OPTIONS preflight on the admin instance redact route returns 204 permitting POST", async () => {
  const res = await fetch(new Request("http://x/admin/instances/inst_x/redact", { method: "OPTIONS" }));
  expect(res.status).toBe(204);
  expect(res.headers.get("Access-Control-Allow-Methods")).toBe("POST");
});

// ============================================================
// POST /admin/instances/:id/redact
// ============================================================

const redactReq = (instanceId: string, actor: Actor) =>
  new Request(`http://x/admin/instances/${instanceId}/redact`, {
    method: "POST",
    headers: { "X-Actor-Id": actor.id, ...(actor.roles.length > 0 ? { "X-Actor-Roles": actor.roles.join(",") } : {}) },
  });

const setInstanceStatus = (id: string, status: string) => sql`UPDATE instances SET body = body || ${{ status }}::jsonb WHERE instance_id = ${id}`;

test.skipIf(!DB)("POST /admin/instances/:id/redact with no resolvable credential maps to 401", async () => {
  const res = await fetch(new Request("http://x/admin/instances/inst_x/redact", { method: "POST" }));
  expect(res.status).toBe(401);
});

test.skipIf(!DB)("POST /admin/instances/:id/redact without system:admin maps to 403 and redacts nothing", async () => {
  const p = migrationPid();
  await publishMigrationVersions(p, 1);
  const inst = await createRunningInstance(p, 1);
  await setInstanceStatus(inst.instanceId, "completed");

  const res = await fetch(redactReq(inst.instanceId, bystander));
  expect(res.status).toBe(403);
  expect((await loadInstance(inst.instanceId)).redactedAt).toBeUndefined();
});

test.skipIf(!DB)("POST /admin/instances/:id/redact on a completed instance succeeds and clears data", async () => {
  const p = migrationPid();
  await publishMigrationVersions(p, 1);
  const inst = await createRunningInstance(p, 1);
  await setInstanceStatus(inst.instanceId, "completed");

  const res = await fetch(redactReq(inst.instanceId, admin));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { data: Record<string, unknown> };
  expect(body.data).toEqual({});
  expect((await loadInstance(inst.instanceId)).redactedAt).toBeDefined();
});

test.skipIf(!DB)("POST /admin/instances/:id/redact works on cancelled and faulted instances too", async () => {
  for (const status of ["cancelled", "faulted"]) {
    const p = migrationPid();
    await publishMigrationVersions(p, 1);
    const inst = await createRunningInstance(p, 1);
    await setInstanceStatus(inst.instanceId, status);

    const res = await fetch(redactReq(inst.instanceId, admin));
    expect(res.status).toBe(200);
  }
});

test.skipIf(!DB)("POST /admin/instances/:id/redact on a running instance maps to 409 instance-running", async () => {
  const p = migrationPid();
  await publishMigrationVersions(p, 1);
  const inst = await createRunningInstance(p, 1);

  const res = await fetch(redactReq(inst.instanceId, admin));
  expect(res.status).toBe(409);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("instance-running");
  expect((await loadInstance(inst.instanceId)).redactedAt).toBeUndefined();
});

test.skipIf(!DB)("POST /admin/instances/:id/redact is idempotent on a re-call", async () => {
  const p = migrationPid();
  await publishMigrationVersions(p, 1);
  const inst = await createRunningInstance(p, 1);
  await setInstanceStatus(inst.instanceId, "cancelled");

  const first = await fetch(redactReq(inst.instanceId, admin));
  expect(first.status).toBe(200);
  const second = await fetch(redactReq(inst.instanceId, admin));
  expect(second.status).toBe(200);
});
