/**
 * The `/admin/*` HTTP surface (src/http/admin-routes.ts): 401 without a
 * credential, 403 without `system:admin`, success with it, plus retry/discard's
 * 404 (no such row) and 409 (present but not a dead letter). DB-backed —
 * skips when DATABASE_URL is unset.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema } from "../src/engine/store.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import { createServer } from "../src/http/server.js";
import { ADMIN_ROLE } from "../src/auth/authorize.js";
import type { Actor } from "../src/cel/eval.js";

const DB = !!process.env.DATABASE_URL;
const reg = createRegistry();
const dataSourceReg = createDataSourceRegistry();
const fetch = createServer(dataSourceReg, reg);

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE outbox, instances, history_entries, instance_events, definitions`;
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
