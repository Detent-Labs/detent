/**
 * Outbox: idempotency key (pure), atomic enqueue in the commit tx, and worker
 * delivery / retry / dead-letter. DB-backed parts skip when DATABASE_URL is
 * unset — a skip is visible, a false green is not.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema, createInstance } from "../src/engine/store.js";
import { executeManualTransition, ConcurrencyConflict } from "../src/engine/transition.js";
import { drainOutbox, MAX_ATTEMPTS, type OutboxRow } from "../src/engine/outbox.js";
import { idempotencyKey } from "../src/engine/idempotency.js";
import type { ProcessBody, Instance, Action } from "../src/schema/definition.js";
import type { Actor } from "../src/cel/eval.js";

const DB = !!process.env.DATABASE_URL;
const actor: Actor = { id: "user_1", roles: [] };

async function rejectsWith(p: Promise<unknown>, ctor: new (...a: never[]) => Error): Promise<void> {
  let err: unknown;
  try {
    await p;
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(ctor);
}

const act = (m: string): Action => ({ id: `action_${m}`, type: m, config: {} }) as unknown as Action;

// step_a (onExit x1) --path_ab (onPath p1)--> step_b terminal (onEntry e1): 3 actions.
const threeActionBody = (): ProcessBody =>
  ({
    fields: [],
    workflow: {
      initialStep: "step_a",
      steps: [
        {
          id: "step_a", key: "a", label: "A", type: "task",
          onExit: [act("x1")],
          paths: [{ id: "path_ab", key: "ab", to: "step_b", trigger: "manual", onPath: [act("p1")] }],
        },
        { id: "step_b", key: "b", label: "B", type: "task", terminal: true, onEntry: [act("e1")] },
      ],
    },
  }) as unknown as ProcessBody;

const create = () => createInstance(threeActionBody(), { processId: "proc_1" as Instance["processId"], version: 1 });

const rows = async (id: string): Promise<Record<string, unknown>[]> =>
  (await sql`SELECT * FROM outbox WHERE instance_id = ${id} ORDER BY action_id`) as Record<string, unknown>[];
const countAll = async (id: string): Promise<number> =>
  ((await sql`SELECT count(*)::int AS n FROM outbox WHERE instance_id = ${id}`) as { n: number }[])[0].n;
const makeDue = async (id: string): Promise<void> => {
  await sql`UPDATE outbox SET next_attempt_at = now() WHERE instance_id = ${id}`;
};
const boom = async (_r: OutboxRow): Promise<void> => {
  throw new Error("delivery failed");
};

// --- pure: idempotency key (no DB) ---

test("idempotencyKey is a deterministic valid UUIDv5, distinct per actionId", () => {
  const k1 = idempotencyKey("inst_x", 1, "action_a");
  const k2 = idempotencyKey("inst_x", 1, "action_a");
  expect(k1).toBe(k2); // deterministic
  expect(k1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/); // v5, RFC variant
  expect(idempotencyKey("inst_x", 1, "action_b")).not.toBe(k1); // different action
  expect(idempotencyKey("inst_x", 2, "action_a")).not.toBe(k1); // different seq
  expect(idempotencyKey("inst_y", 1, "action_a")).not.toBe(k1); // different instance
});

beforeAll(async () => {
  if (DB) {
    await initSchema();
    await initSchema(); // idempotent: running twice must not throw
  }
});
// drainOutbox is a global worker (drains the whole table), so each test starts
// from an empty outbox to keep delivered-count assertions exact.
beforeEach(async () => {
  if (DB) await sql`TRUNCATE outbox`;
});

// --- enqueue in the commit tx ---

test.skipIf(!DB)("a committed transition enqueues one pending row per ordered action", async () => {
  const body = threeActionBody();
  const inst = await create();
  await executeManualTransition(inst, "path_ab", body, actor);

  const r = await rows(inst.instanceId);
  expect(r.map((x) => x.action_id)).toEqual(["action_e1", "action_p1", "action_x1"]); // 3, ordered by id
  expect(r.every((x) => x.status === "pending" && x.transition_seq === 1)).toBe(true);
  // Keys match the deterministic formula.
  expect(r.find((x) => x.action_id === "action_p1")!.idempotency_key).toBe(
    idempotencyKey(inst.instanceId, 1, "action_p1"),
  );
});

test.skipIf(!DB)("a transition rejected as a concurrency conflict enqueues nothing", async () => {
  const body = threeActionBody();
  const inst = await create();
  await executeManualTransition(inst, "path_ab", body, actor); // commits seq 1, enqueues 3
  const before = await countAll(inst.instanceId);
  // Reuse the stale seq-0 snapshot -> conflict, no partial write.
  await rejectsWith(executeManualTransition(inst, "path_ab", body, actor), ConcurrencyConflict);
  expect(await countAll(inst.instanceId)).toBe(before); // no extra rows from the losing attempt
});

// --- worker delivery ---

test.skipIf(!DB)("pending rows are delivered once and not redelivered", async () => {
  const body = threeActionBody();
  const inst = await create();
  await executeManualTransition(inst, "path_ab", body, actor);

  expect(await drainOutbox()).toBe(3); // all three delivered
  const r = await rows(inst.instanceId);
  expect(r.every((x) => x.status === "delivered" && x.delivered_at !== null)).toBe(true);
  expect(await drainOutbox()).toBe(0); // second poll redelivers nothing
});

test.skipIf(!DB)("undelivered rows survive until a later drain (crash-before-worker)", async () => {
  const body = threeActionBody();
  const inst = await create();
  await executeManualTransition(inst, "path_ab", body, actor);
  // Simulate the worker never having run: rows sit pending, then a fresh drain delivers.
  const r0 = await rows(inst.instanceId);
  expect(r0.every((x) => x.status === "pending")).toBe(true);
  expect(await drainOutbox()).toBe(3);
});

// --- retry + dead-letter ---

test.skipIf(!DB)("a failed delivery retries later: attempts++, backed off, not reclaimed immediately", async () => {
  const body = threeActionBody();
  const inst = await create();
  await executeManualTransition(inst, "path_ab", body, actor);

  await drainOutbox(sql, boom); // all fail
  const r1 = await rows(inst.instanceId);
  expect(r1.every((x) => x.attempts === 1 && x.status === "pending")).toBe(true);
  expect(r1.every((x) => new Date(x.next_attempt_at as string).getTime() > Date.now())).toBe(true); // backed off

  await drainOutbox(sql, boom); // immediate re-drain: rows not due yet
  const r2 = await rows(inst.instanceId);
  expect(r2.every((x) => x.attempts === 1)).toBe(true); // not reclaimed
});

test.skipIf(!DB)("a row that keeps failing exhausts attempts and dead-letters", async () => {
  const body = threeActionBody();
  const inst = await create();
  await executeManualTransition(inst, "path_ab", body, actor);

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    await makeDue(inst.instanceId); // bypass backoff to drive escalation
    await drainOutbox(sql, boom);
  }
  const r = await rows(inst.instanceId);
  expect(r.every((x) => x.status === "dead-letter" && x.attempts === MAX_ATTEMPTS)).toBe(true);

  // Success deliver for the final probe: a re-claimed dead-letter row would
  // deliver and return 1, so 0 genuinely proves dead-letter rows are excluded.
  await makeDue(inst.instanceId);
  expect(await drainOutbox(sql, async () => {})).toBe(0);
});

test.skipIf(!DB)("re-enqueuing an existing idempotency_key is rejected, original row untouched", async () => {
  const key = idempotencyKey("inst_dup", 1, "action_a");
  const ins = (aid: string) =>
    sql`INSERT INTO outbox (idempotency_key, instance_id, transition_seq, action_id, action)
      VALUES (${key}, ${"inst_dup"}, 1, ${aid}, ${JSON.stringify(act(aid))}::jsonb)`;
  await ins("action_a"); // first wins
  let threw = false;
  try {
    await ins("action_b"); // same key -> unique/PK violation
  } catch {
    threw = true;
  }
  expect(threw).toBe(true);
  const r = (await sql`SELECT action_id FROM outbox WHERE idempotency_key = ${key}`) as { action_id: string }[];
  expect(r).toHaveLength(1); // no duplicate row
  expect(r[0].action_id).toBe("action_a"); // original not overwritten
});

test.skipIf(!DB)("a concurrent drain skips rows locked by another worker (SKIP LOCKED)", async () => {
  const body = threeActionBody();
  const inst = await create();
  await executeManualTransition(inst, "path_ab", body, actor); // 3 pending rows

  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  let signalClaimed!: () => void;
  const claimed = new Promise<void>((r) => (signalClaimed = r));

  // Worker A claims all due rows (its SELECT FOR UPDATE locks them) then holds
  // the transaction open in the first deliver until released.
  const aDone = drainOutbox(sql, async () => {
    signalClaimed();
    await held;
  });
  await claimed; // A now holds the row locks

  try {
    // Worker B drains concurrently; SKIP LOCKED must make it claim none.
    expect(await drainOutbox(sql, async () => {})).toBe(0);
  } finally {
    release(); // always release so A's tx cannot hang the suite
  }
  expect(await aDone).toBe(3); // A ultimately delivers all three
});
