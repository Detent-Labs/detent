/**
 * src/engine/admin-queries.ts: outbox listing/counts/paging, the requeue and
 * discard dead-letter repairs, pending-timer listing, and the `discarded`
 * status's inertness to `drainOutbox` and `migrateInstances`. DB-backed —
 * skips when DATABASE_URL is unset.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema, createInstance } from "../src/engine/store.js";
import { publishBody, createDefinitionStore } from "../src/engine/definitions.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import { drainOutbox } from "../src/engine/outbox.js";
import { registerMigrationPlan, migrateInstances } from "../src/engine/migration.js";
import {
  listOutbox,
  countOutboxByStatus,
  listPendingTimers,
  requeueOutboxRow,
  discardOutboxRow,
  getOutboxRow,
  getTimerLagStats,
  countInstancesByStatus,
} from "../src/engine/admin-queries.js";
import { RequestShapeError } from "../src/errors.js";
import type { ProcessBody, Instance, MigrationSpec } from "../src/schema/definition.js";
import { clearInstanceAudit } from "./audit-cleanup.js";

const DB = !!process.env.DATABASE_URL;
const reg = createRegistry();
reg.set("noop", { handler: async () => ({}) });
const dataSourceReg = createDataSourceRegistry();

let n = 0;
const pid = () => `proc_admin_q_${++n}` as Instance["processId"];

/** A minimal one-wait-state body, label-stamped so two publishes land on distinct versions. */
const waitBody = (label: string): ProcessBody =>
  ({
    key: "admin_q_wait",
    label: { en: label },
    baseLocale: "en",
    fields: [],
    workflow: {
      initialStep: "step_wait",
      steps: [
        { id: "step_wait", key: "wait", label: { en: "Wait" }, type: "task", paths: [{ id: "path_done", key: "done", label: "Done", to: "step_done", trigger: "manual" }] },
        { id: "step_done", key: "done", label: { en: "Done" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

/** Directly inserts an outbox row, bypassing enqueue-on-transition, so listing/repair tests control shape and status precisely. */
const insertRow = async (opts: {
  key: string;
  instanceId?: string;
  status: string;
  actionType?: string;
  config?: unknown;
  attempts?: number;
  createdAt?: Date;
  nextAttemptAt?: Date;
  fieldVersion?: number;
  transitionSeq?: number;
  lastError?: string | null;
}): Promise<void> => {
  await sql`INSERT INTO outbox (idempotency_key, instance_id, transition_seq, action_id, action, status, attempts, field_version, created_at, next_attempt_at, last_error)
    VALUES (
      ${opts.key}, ${opts.instanceId ?? "inst_fixture"}, ${opts.transitionSeq ?? 1}, ${"action_for_" + opts.key},
      ${{ id: "action_for_" + opts.key, type: opts.actionType ?? "noop", config: opts.config ?? {} }},
      ${opts.status}, ${opts.attempts ?? 0}, ${opts.fieldVersion ?? 1},
      ${opts.createdAt ?? new Date()}, ${opts.nextAttemptAt ?? new Date()}, ${opts.lastError ?? null}
    )`;
};

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE outbox, instances, history_entries, instance_events, definitions, migration_plans`;
  if (DB) await clearInstanceAudit();
});

// ============================================================
// listOutbox
// ============================================================

test.skipIf(!DB)("listOutbox filters by a single status", async () => {
  await insertRow({ key: "k1", status: "pending" });
  await insertRow({ key: "k2", status: "dead-letter" });
  await insertRow({ key: "k3", status: "delivered" });

  const page = await listOutbox({ status: ["dead-letter"] }, {}, sql);
  expect(page.items.map((r) => r.idempotencyKey)).toEqual(["k2"]);
});

test.skipIf(!DB)("listOutbox with several statuses widens the filter", async () => {
  await insertRow({ key: "k1", status: "pending" });
  await insertRow({ key: "k2", status: "dead-letter" });
  await insertRow({ key: "k3", status: "delivered" });

  const page = await listOutbox({ status: ["pending", "dead-letter"] }, {}, sql);
  expect(page.items.map((r) => r.idempotencyKey).sort()).toEqual(["k1", "k2"]);
});

test.skipIf(!DB)("listOutbox with no filter is unfiltered", async () => {
  await insertRow({ key: "k1", status: "pending" });
  await insertRow({ key: "k2", status: "dead-letter" });

  const page = await listOutbox({}, {}, sql);
  expect(page.items.map((r) => r.idempotencyKey).sort()).toEqual(["k1", "k2"]);
});

test.skipIf(!DB)("listOutbox never returns the action's config, only its type", async () => {
  await insertRow({ key: "k1", status: "pending", actionType: "http.request", config: { secret: "sssh" } });

  const page = await listOutbox({}, {}, sql);
  const row = page.items.find((r) => r.idempotencyKey === "k1")!;
  expect(row.type).toBe("http.request");
  expect((row as unknown as Record<string, unknown>).config).toBeUndefined();
});

test.skipIf(!DB)("listOutbox pages through more rows than the limit", async () => {
  const base = Date.now();
  for (let i = 0; i < 5; i++) {
    await insertRow({ key: `page_${i}`, status: "pending", createdAt: new Date(base + i * 1000) });
  }

  const seen = new Set<string>();
  let cursor: string | undefined;
  for (let i = 0; i < 3; i++) {
    const page = await listOutbox({}, { limit: 2, cursor }, sql);
    for (const item of page.items) seen.add(item.idempotencyKey);
    cursor = page.cursor;
    if (!cursor) break;
  }
  expect(seen.size).toBe(5);
  expect(cursor).toBeUndefined();
});

// Deterministic, not a timing race: forces both rows into one millisecond,
// at different microsecond offsets, via a raw UPDATE after insertion. See
// fix-instance-list-cursor-precision's design.md — listOutbox orders
// descending, the same direction as listInstances, so the pre-fix symptom
// is a silently dropped row, not a duplicate.
test.skipIf(!DB)("listOutbox pages correctly when two rows share a millisecond", async () => {
  await insertRow({ key: "same_ms_older", status: "pending" });
  await insertRow({ key: "same_ms_newer", status: "pending" });
  await sql`UPDATE outbox SET created_at = '2026-01-01 00:00:00.100001+00' WHERE idempotency_key = 'same_ms_older'`;
  await sql`UPDATE outbox SET created_at = '2026-01-01 00:00:00.100999+00' WHERE idempotency_key = 'same_ms_newer'`;

  const page1 = await listOutbox({}, { limit: 1 }, sql);
  expect(page1.items.map((it) => it.idempotencyKey)).toEqual(["same_ms_newer"]);
  expect(page1.cursor).toBeDefined();

  const page2 = await listOutbox({}, { limit: 1, cursor: page1.cursor }, sql);
  expect(page2.items.map((it) => it.idempotencyKey)).toEqual(["same_ms_older"]);
});

test.skipIf(!DB)("listOutbox with a malformed cursor raises RequestShapeError, not an uncaught SyntaxError or Postgres cast error", async () => {
  let raised: unknown;
  try {
    await listOutbox({}, { cursor: "%%%" }, sql);
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(RequestShapeError);
});

test.skipIf(!DB)("listOutbox with a well-formed but wrong-arity cursor raises RequestShapeError", async () => {
  const wrongArity = Buffer.from(JSON.stringify(["only-one"])).toString("base64url");
  let raised: unknown;
  try {
    await listOutbox({}, { cursor: wrongArity }, sql);
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(RequestShapeError);
});

test.skipIf(!DB)("listPendingTimers with a malformed cursor raises RequestShapeError, the same extracted helper listOutbox uses", async () => {
  let raised: unknown;
  try {
    await listPendingTimers({ cursor: "%%%" }, sql);
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(RequestShapeError);
});

// ============================================================
// countOutboxByStatus
// ============================================================

test.skipIf(!DB)("countOutboxByStatus reports a count per present status, absent statuses simply absent", async () => {
  await insertRow({ key: "c1", status: "pending" });
  await insertRow({ key: "c2", status: "pending" });
  await insertRow({ key: "c3", status: "pending" });
  await insertRow({ key: "c4", status: "dead-letter" });

  const counts = await countOutboxByStatus(sql);
  expect(counts).toEqual({ pending: 3, "dead-letter": 1 });
  expect(counts.delivered).toBeUndefined();
});

// ============================================================
// getTimerLagStats
// ============================================================

test.skipIf(!DB)("getTimerLagStats reports zero when nothing is overdue", async () => {
  const stats = await getTimerLagStats(sql);
  expect(stats).toEqual({ overdueCount: 0, maxLagSeconds: 0 });
});

test.skipIf(!DB)("getTimerLagStats counts overdue running instances and reports the oldest lag, excluding non-running and future timers", async () => {
  const P = pid();
  const v = await publishBody(P, waitBody("lag"), reg, dataSourceReg);
  const body = (await createDefinitionStore(sql).resolveBody(P, v.version))!;

  const oldest = await createInstance(body, { processId: P, version: v.version }, sql);
  const newer = await createInstance(body, { processId: P, version: v.version }, sql);
  const future = await createInstance(body, { processId: P, version: v.version }, sql);
  const notRunning = await createInstance(body, { processId: P, version: v.version }, sql);

  await sql`UPDATE instances SET next_timer_at = now() - interval '2 hours' WHERE instance_id = ${oldest.instanceId}`;
  await sql`UPDATE instances SET next_timer_at = now() - interval '1 hour' WHERE instance_id = ${newer.instanceId}`;
  await sql`UPDATE instances SET next_timer_at = now() + interval '1 hour' WHERE instance_id = ${future.instanceId}`;
  await sql`UPDATE instances SET next_timer_at = now() - interval '3 hours', body = jsonb_set(body, '{status}', '"completed"'::jsonb)
    WHERE instance_id = ${notRunning.instanceId}`;

  const stats = await getTimerLagStats(sql);
  expect(stats.overdueCount).toBe(2);
  expect(stats.maxLagSeconds).toBeGreaterThanOrEqual(2 * 3600 - 5);
});

// ============================================================
// countInstancesByStatus
// ============================================================

test.skipIf(!DB)("countInstancesByStatus reports a count per present status, absent statuses simply absent", async () => {
  const P = pid();
  const v = await publishBody(P, waitBody("status_counts"), reg, dataSourceReg);
  const body = (await createDefinitionStore(sql).resolveBody(P, v.version))!;

  await createInstance(body, { processId: P, version: v.version }, sql);
  await createInstance(body, { processId: P, version: v.version }, sql);
  const faulted = await createInstance(body, { processId: P, version: v.version }, sql);
  await sql`UPDATE instances SET body = jsonb_set(body, '{status}', '"faulted"'::jsonb) WHERE instance_id = ${faulted.instanceId}`;

  const counts = await countInstancesByStatus(sql);
  expect(counts.running).toBe(2);
  expect(counts.faulted).toBe(1);
  expect(counts.completed).toBeUndefined();
});

// ============================================================
// requeueOutboxRow / discardOutboxRow
// ============================================================

test.skipIf(!DB)("requeueOutboxRow resets a dead letter and the next drain claims it", async () => {
  await insertRow({ key: "req1", status: "dead-letter", attempts: 5, nextAttemptAt: new Date(Date.now() + 3_600_000) });

  const updated = await requeueOutboxRow("req1", sql);
  expect(updated).not.toBeNull();
  expect(updated!.status).toBe("pending");
  expect(updated!.attempts).toBe(0);
  expect(new Date(updated!.nextAttemptAt).getTime()).toBeLessThanOrEqual(Date.now());

  const delivered = await drainOutbox(sql, reg, async () => ({}));
  expect(delivered).toBe(1);
});

test.skipIf(!DB)("discardOutboxRow discards a dead letter without deleting the row", async () => {
  await insertRow({ key: "disc1", status: "dead-letter" });

  const updated = await discardOutboxRow("disc1", sql);
  expect(updated!.status).toBe("discarded");
  const row = await getOutboxRow("disc1", sql);
  expect(row).not.toBeNull();
  expect(row!.status).toBe("discarded");
});

test.skipIf(!DB)("requeueOutboxRow and discardOutboxRow are no-ops on a row that is not a dead letter", async () => {
  await insertRow({ key: "nd1", status: "pending" });

  expect(await requeueOutboxRow("nd1", sql)).toBeNull();
  expect(await discardOutboxRow("nd1", sql)).toBeNull();
  const row = await getOutboxRow("nd1", sql);
  expect(row!.status).toBe("pending"); // unchanged
});

test.skipIf(!DB)("requeueOutboxRow and discardOutboxRow are no-ops on a missing row", async () => {
  expect(await requeueOutboxRow("does_not_exist", sql)).toBeNull();
  expect(await discardOutboxRow("does_not_exist", sql)).toBeNull();
  expect(await getOutboxRow("does_not_exist", sql)).toBeNull();
});

// ============================================================
// listPendingTimers
// ============================================================

test.skipIf(!DB)("listPendingTimers orders ascending, excluding non-running and null-timer instances", async () => {
  const P = pid();
  const v = await publishBody(P, waitBody("timers"), reg, dataSourceReg);
  const body = (await createDefinitionStore(sql).resolveBody(P, v.version))!;

  const overdue = await createInstance(body, { processId: P, version: v.version }, sql);
  const future = await createInstance(body, { processId: P, version: v.version }, sql);
  const noTimer = await createInstance(body, { processId: P, version: v.version }, sql);
  const notRunning = await createInstance(body, { processId: P, version: v.version }, sql);

  await sql`UPDATE instances SET next_timer_at = now() - interval '1 hour' WHERE instance_id = ${overdue.instanceId}`;
  await sql`UPDATE instances SET next_timer_at = now() + interval '1 hour' WHERE instance_id = ${future.instanceId}`;
  // noTimer: next_timer_at left NULL.
  await sql`UPDATE instances SET next_timer_at = now() - interval '1 hour', body = jsonb_set(body, '{status}', '"completed"'::jsonb)
    WHERE instance_id = ${notRunning.instanceId}`;

  const page = await listPendingTimers({}, sql);
  const ids = page.items.map((i) => i.instanceId);
  expect(ids).toEqual([overdue.instanceId, future.instanceId]);
  expect(ids).not.toContain(noTimer.instanceId);
  expect(ids).not.toContain(notRunning.instanceId);
});

// Deterministic, not a timing race: forces both instances' next_timer_at
// into one millisecond, at different microsecond offsets. See
// fix-instance-list-cursor-precision's design.md — listPendingTimers
// orders ascending, the same direction as listComments, so the pre-fix
// symptom is a duplicated boundary row, not a dropped one.
test.skipIf(!DB)("listPendingTimers pages correctly when two timers share a millisecond", async () => {
  const P = pid();
  const v = await publishBody(P, waitBody("timers_ms"), reg, dataSourceReg);
  const body = (await createDefinitionStore(sql).resolveBody(P, v.version))!;

  const older = await createInstance(body, { processId: P, version: v.version }, sql);
  const newer = await createInstance(body, { processId: P, version: v.version }, sql);
  await sql`UPDATE instances SET next_timer_at = '2026-01-01 00:00:00.100001+00' WHERE instance_id = ${older.instanceId}`;
  await sql`UPDATE instances SET next_timer_at = '2026-01-01 00:00:00.100999+00' WHERE instance_id = ${newer.instanceId}`;

  const page1 = await listPendingTimers({ limit: 1 }, sql);
  expect(page1.items.map((it) => it.instanceId)).toEqual([older.instanceId]);
  expect(page1.cursor).toBeDefined();

  const page2 = await listPendingTimers({ limit: 1, cursor: page1.cursor }, sql);
  expect(page2.items.map((it) => it.instanceId)).toEqual([newer.instanceId]);
});

// ============================================================
// `discarded` inertness (spec's "A discarded row is never delivered" /
// "does not block or break a migration")
// ============================================================

test.skipIf(!DB)("a discarded row is not claimed by drainOutbox, and its instance migrates (not skipped pending-actions) while the row's field_version bumps with the rest", async () => {
  const P = pid();
  const v1 = await publishBody(P, waitBody("v1"), reg, dataSourceReg);
  const v2 = await publishBody(P, waitBody("v2"), reg, dataSourceReg);
  await registerMigrationPlan(P, v1.version, v2.version, {} as MigrationSpec);

  const body1 = (await createDefinitionStore(sql).resolveBody(P, v1.version))!;
  const inst = await createInstance(body1, { processId: P, version: v1.version }, sql);

  await insertRow({
    key: `disc_inert_${inst.instanceId}`,
    instanceId: inst.instanceId,
    status: "dead-letter",
    transitionSeq: inst.transitionSeq,
    fieldVersion: v1.version,
  });
  await discardOutboxRow(`disc_inert_${inst.instanceId}`, sql);

  // Never claimed: drainOutbox's due-scan only picks up 'pending' and
  // lease-expired 'claimed' rows.
  expect(await drainOutbox(sql, reg, async () => ({}))).toBe(0);
  const stillDiscarded = await getOutboxRow(`disc_inert_${inst.instanceId}`, sql);
  expect(stillDiscarded!.status).toBe("discarded");

  const res = await migrateInstances(P, v1.version, v2.version, sql);
  expect(res.migrated).toEqual([inst.instanceId]);
  expect(res.skipped).toHaveLength(0);

  const migratedRow = await getOutboxRow(`disc_inert_${inst.instanceId}`, sql);
  expect(migratedRow!.status).toBe("discarded"); // still discarded

  // field_version isn't part of the operator-facing OutboxRow projection —
  // read it directly to confirm the row was bumped in lock-step with the rest.
  const [{ field_version }] = (await sql`SELECT field_version FROM outbox WHERE idempotency_key = ${`disc_inert_${inst.instanceId}`}`) as {
    field_version: number;
  }[];
  expect(field_version).toBe(v2.version);
});
