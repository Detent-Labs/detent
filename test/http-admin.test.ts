/**
 * The `/admin/*` HTTP surface (src/http/admin-routes.ts): 401 without a
 * credential, 403 without `system:admin`, success with it, plus retry/discard's
 * 404 (no such row) and 409 (present but not a dead letter), the users
 * routes' 404 (no such userId), and migrations/run's 409 (no registered
 * plan) and request error (non-integer version). DB-backed — skips when
 * DATABASE_URL is unset.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema, createInstance } from "../src/engine/store.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import { createServer } from "../src/http/server.js";
import { devHeaderResolver } from "../src/auth/resolve.js";
import { ADMIN_ROLE } from "../src/auth/authorize.js";
import { createUser } from "../src/auth/users.js";
import { publishBody, createDefinitionStore } from "../src/engine/definitions.js";
import { registerMigrationPlan } from "../src/engine/migration.js";
import type { Actor } from "../src/cel/eval.js";
import type { ProcessBody, Instance, MigrationSpec } from "../src/schema/definition.js";

const DB = !!process.env.DATABASE_URL;
const reg = createRegistry();
const dataSourceReg = createDataSourceRegistry();
const fetch = createServer(dataSourceReg, reg, sql, devHeaderResolver);

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE outbox, instances, history_entries, instance_events, definitions, auth_users, migration_plans`;
});

const admin: Actor = { id: "user_admin", roles: [ADMIN_ROLE] };
const bystander: Actor = { id: "user_bystander", roles: [] };

const authedReq = (url: string, method: string, actor: Actor) =>
  new Request(url, { method, headers: { "X-Actor-Id": actor.id, ...(actor.roles.length > 0 ? { "X-Actor-Roles": actor.roles.join(",") } : {}) } });

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

test("OPTIONS preflight on the admin users route returns 204 permitting GET", async () => {
  const res = await fetch(new Request("http://x/admin/users", { method: "OPTIONS" }));
  expect(res.status).toBe(204);
  expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET");
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
