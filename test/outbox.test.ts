/**
 * Outbox: idempotency key (pure), atomic enqueue in the commit tx, and the
 * claim / deliver / mark split — delivery, retry, dead-letter, stale-claim
 * reclaim, once-only marking, and the real handler writeback + ActionOutcome +
 * terminal suppression. DB-backed parts skip when DATABASE_URL is unset — a skip
 * is visible, a false green is not.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema, createInstance } from "../src/engine/store.js";
import { executeManualTransition, ConcurrencyConflict } from "../src/engine/transition.js";
import { drainOutbox, MAX_ATTEMPTS, type DeliverFn } from "../src/engine/outbox.js";
import { createRegistry, register } from "../src/engine/registry.js";
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
const actOut = (id: string, type: string, field: string, src: string): Action =>
  ({ id: `action_${id}`, type, config: {}, output: { [field]: { lang: "cel", src } } }) as unknown as Action;

// Registry with one handler; unused by the okDeliver/boom seams.
const reg = createRegistry();
register(reg, "setter", { handler: async () => ({ val: 7 }) });

const okDeliver: DeliverFn = async () => ({});
const boom: DeliverFn = async () => {
  throw new Error("delivery failed");
};

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

// step_a --path_ab--> step_b (onEntry setter, writes field_val = result.val). When
// `terminal`, step_b completes the instance (exercises suppression); otherwise it
// stays running with an unused exit so the writeback applies.
const outputBody = (terminal: boolean): ProcessBody =>
  ({
    fields: [],
    workflow: {
      initialStep: "step_a",
      steps: [
        { id: "step_a", key: "a", label: "A", type: "task", paths: [{ id: "path_ab", key: "ab", to: "step_b", trigger: "manual" }] },
        terminal
          ? { id: "step_b", key: "b", label: "B", type: "task", terminal: true, onEntry: [actOut("set", "setter", "field_val", "result.val")] }
          : { id: "step_b", key: "b", label: "B", type: "task", onEntry: [actOut("set", "setter", "field_val", "result.val")], paths: [{ id: "path_bc", key: "bc", to: "step_c", trigger: "manual" }] },
        ...(terminal ? [] : [{ id: "step_c", key: "c", label: "C", type: "task", terminal: true }]),
      ],
    },
  }) as unknown as ProcessBody;

// Non-terminal target whose onEntry action type is not registered -> dead-letter.
const ghostBody = (): ProcessBody =>
  ({
    fields: [],
    workflow: {
      initialStep: "step_a",
      steps: [
        { id: "step_a", key: "a", label: "A", type: "task", paths: [{ id: "path_ab", key: "ab", to: "step_b", trigger: "manual" }] },
        { id: "step_b", key: "b", label: "B", type: "task", onEntry: [actOut("g", "ghost", "field_val", "result.val")], paths: [{ id: "path_bc", key: "bc", to: "step_c", trigger: "manual" }] },
        { id: "step_c", key: "c", label: "C", type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

const createFrom = (body: ProcessBody) => createInstance(body, { processId: "proc_1" as Instance["processId"], version: 1 });
const create = () => createFrom(threeActionBody());

const rows = async (id: string): Promise<Record<string, unknown>[]> =>
  (await sql`SELECT * FROM outbox WHERE instance_id = ${id} ORDER BY action_id`) as Record<string, unknown>[];
const countAll = async (id: string): Promise<number> =>
  ((await sql`SELECT count(*)::int AS n FROM outbox WHERE instance_id = ${id}`) as { n: number }[])[0].n;
const makeDue = async (id: string): Promise<void> => {
  await sql`UPDATE outbox SET next_attempt_at = now() WHERE instance_id = ${id}`;
};
const instData = async (id: string): Promise<Record<string, unknown>> => {
  const r = (await sql`SELECT body FROM instances WHERE instance_id = ${id}`) as { body: unknown }[];
  const b = (typeof r[0].body === "string" ? JSON.parse(r[0].body as string) : r[0].body) as Instance;
  return b.data as Record<string, unknown>;
};
const outcomes = async (id: string): Promise<Record<string, unknown>[]> => {
  const r = (await sql`SELECT entry FROM history_entries WHERE instance_id = ${id} ORDER BY transition_seq`) as { entry: unknown }[];
  return r.flatMap((row) => {
    const e = (typeof row.entry === "string" ? JSON.parse(row.entry as string) : row.entry) as { actions?: Record<string, unknown>[] };
    return e.actions ?? [];
  });
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
  expect(r.find((x) => x.action_id === "action_p1")!.idempotency_key).toBe(
    idempotencyKey(inst.instanceId, 1, "action_p1"),
  );
});

test.skipIf(!DB)("a transition rejected as a concurrency conflict enqueues nothing", async () => {
  const body = threeActionBody();
  const inst = await create();
  await executeManualTransition(inst, "path_ab", body, actor); // commits seq 1, enqueues 3
  const before = await countAll(inst.instanceId);
  await rejectsWith(executeManualTransition(inst, "path_ab", body, actor), ConcurrencyConflict);
  expect(await countAll(inst.instanceId)).toBe(before); // no extra rows from the losing attempt
});

// --- worker delivery ---

test.skipIf(!DB)("pending rows are delivered once and not redelivered", async () => {
  const body = threeActionBody();
  const inst = await create();
  await executeManualTransition(inst, "path_ab", body, actor);

  expect(await drainOutbox(sql, reg, okDeliver)).toBe(3); // all three delivered
  const r = await rows(inst.instanceId);
  expect(r.every((x) => x.status === "delivered" && x.delivered_at !== null)).toBe(true);
  expect(await drainOutbox(sql, reg, okDeliver)).toBe(0); // second poll redelivers nothing
});

test.skipIf(!DB)("undelivered rows survive until a later drain (crash-before-worker)", async () => {
  const body = threeActionBody();
  const inst = await create();
  await executeManualTransition(inst, "path_ab", body, actor);
  const r0 = await rows(inst.instanceId);
  expect(r0.every((x) => x.status === "pending")).toBe(true);
  expect(await drainOutbox(sql, reg, okDeliver)).toBe(3);
});

// --- claim / deliver / mark split ---

test.skipIf(!DB)("the claim commits before the handler runs, so the handler holds no row lock", async () => {
  const body = threeActionBody();
  const inst = await create();
  await executeManualTransition(inst, "path_ab", body, actor); // 3 pending

  let claimedWhenInvoked = -1;
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  let signal!: () => void;
  const invoked = new Promise<void>((r) => (signal = r));

  const slow: DeliverFn = async () => {
    // Capture on the first invocation only: if the claim committed before any
    // handler ran, all three rows are already 'claimed' at that point. (Later
    // rows would see fewer, as earlier ones get marked delivered post-release.)
    if (claimedWhenInvoked === -1) {
      const c = (await sql`SELECT count(*)::int AS n FROM outbox WHERE instance_id = ${inst.instanceId} AND status = 'claimed'`) as { n: number }[];
      claimedWhenInvoked = c[0].n;
      signal();
      await held;
    }
    return {};
  };

  const draining = drainOutbox(sql, reg, slow);
  await invoked;
  release();
  await draining;
  expect(claimedWhenInvoked).toBe(3); // claim was committed before the first handler ran
});

test.skipIf(!DB)("a stale claim past its lease is reclaimed and delivered", async () => {
  const body = threeActionBody();
  const inst = await create();
  await executeManualTransition(inst, "path_ab", body, actor);
  // Crashed worker: rows claimed long ago, never marked.
  await sql`UPDATE outbox SET status = 'claimed', claimed_at = now() - interval '1 hour' WHERE instance_id = ${inst.instanceId}`;

  expect(await drainOutbox(sql, reg, okDeliver)).toBe(3); // reclaimed and delivered
  const r = await rows(inst.instanceId);
  expect(r.every((x) => x.status === "delivered")).toBe(true);
});

test.skipIf(!DB)("two concurrent drains never claim the same row (tx1 claim contention)", async () => {
  const body = threeActionBody();
  const inst = await create();
  await executeManualTransition(inst, "path_ab", body, actor); // 3 pending

  const [a, b] = await Promise.all([drainOutbox(sql, reg, okDeliver), drainOutbox(sql, reg, okDeliver)]);
  expect(a + b).toBe(3); // each row delivered exactly once across both workers
  const r = await rows(inst.instanceId);
  expect(r).toHaveLength(3);
  expect(r.every((x) => x.status === "delivered")).toBe(true);
});

test.skipIf(!DB)("the delivered mark is once-only: a late CAS on a delivered row applies nothing", async () => {
  const body = outputBody(false);
  const inst = await createFrom(body);
  await executeManualTransition(inst, "path_ab", body, actor);
  expect(await drainOutbox(sql, reg)).toBe(1);

  const key = idempotencyKey(inst.instanceId, 1, "action_set");
  // A reclaimed-then-late peer's CAS: the row is already 'delivered'.
  const late = (await sql`UPDATE outbox SET status = 'delivered', delivered_at = now()
    WHERE idempotency_key = ${key} AND status = 'claimed' RETURNING idempotency_key`) as unknown[];
  expect(late).toHaveLength(0);
  expect(await outcomes(inst.instanceId)).toHaveLength(1); // no second outcome
});

// --- retry + dead-letter ---

test.skipIf(!DB)("a failed delivery retries later: attempts++, backed off, returned to pending", async () => {
  const body = threeActionBody();
  const inst = await create();
  await executeManualTransition(inst, "path_ab", body, actor);

  await drainOutbox(sql, reg, boom); // all fail (transient)
  const r1 = await rows(inst.instanceId);
  expect(r1.every((x) => x.attempts === 1 && x.status === "pending")).toBe(true);
  expect(r1.every((x) => new Date(x.next_attempt_at as string).getTime() > Date.now())).toBe(true); // backed off

  await drainOutbox(sql, reg, boom); // immediate re-drain: rows not due yet
  const r2 = await rows(inst.instanceId);
  expect(r2.every((x) => x.attempts === 1)).toBe(true); // not reclaimed
});

test.skipIf(!DB)("a row that keeps failing exhausts attempts and dead-letters", async () => {
  const body = threeActionBody();
  const inst = await create();
  await executeManualTransition(inst, "path_ab", body, actor);

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    await makeDue(inst.instanceId); // bypass backoff to drive escalation
    await drainOutbox(sql, reg, boom);
  }
  const r = await rows(inst.instanceId);
  expect(r.every((x) => x.status === "dead-letter" && x.attempts === MAX_ATTEMPTS)).toBe(true);

  await makeDue(inst.instanceId);
  expect(await drainOutbox(sql, reg, okDeliver)).toBe(0); // dead-letter rows are excluded
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
  expect(r).toHaveLength(1);
  expect(r[0].action_id).toBe("action_a");
});

// --- writeback, ActionOutcome, terminal suppression ---

test.skipIf(!DB)("a mapped output lands in data and the entry records a succeeded ActionOutcome", async () => {
  const body = outputBody(false);
  const inst = await createFrom(body);
  await executeManualTransition(inst, "path_ab", body, actor);

  expect(await drainOutbox(sql, reg)).toBe(1);
  expect((await instData(inst.instanceId)).field_val).toBe(7); // writeback landed
  const o = await outcomes(inst.instanceId);
  expect(o).toHaveLength(1);
  expect(o[0]).toMatchObject({ status: "succeeded", resolvedHandler: "setter", attempts: 1, actionId: "action_set" });
  expect(o[0].suppressed).toBeUndefined();
});

test.skipIf(!DB)("an unregistered type dead-letters, records a dead-letter outcome, writes no data", async () => {
  const body = ghostBody();
  const inst = await createFrom(body);
  await executeManualTransition(inst, "path_ab", body, actor);

  expect(await drainOutbox(sql, reg)).toBe(0); // permanent failure, nothing delivered
  const r = await rows(inst.instanceId);
  expect(r.every((x) => x.status === "dead-letter" && x.attempts === 1)).toBe(true);
  const o = await outcomes(inst.instanceId);
  expect(o).toHaveLength(1);
  expect(o[0].status).toBe("dead-letter");
  expect((await instData(inst.instanceId)).field_val).toBeUndefined();
});

test.skipIf(!DB)("a writeback to a completed instance is suppressed (no data, outcome marked)", async () => {
  const body = outputBody(true);
  const inst = await createFrom(body);
  await executeManualTransition(inst, "path_ab", body, actor); // step_b terminal -> completed

  expect(await drainOutbox(sql, reg)).toBe(1);
  expect((await instData(inst.instanceId)).field_val).toBeUndefined(); // suppressed
  const o = await outcomes(inst.instanceId);
  expect(o).toHaveLength(1);
  expect(o[0]).toMatchObject({ status: "succeeded", suppressed: true });
});

test.skipIf(!DB)("a writeback to a faulted instance is suppressed (no data, outcome marked)", async () => {
  const body = outputBody(false); // step_b non-terminal -> running, setter enqueued on entry
  const inst = await createFrom(body);
  await executeManualTransition(inst, "path_ab", body, actor);
  // Instance faults (e.g. an automatic cascade loop) before the action is delivered.
  await sql`UPDATE instances SET body = jsonb_set(body, '{status}', '"faulted"'::jsonb) WHERE instance_id = ${inst.instanceId}`;

  expect(await drainOutbox(sql, reg)).toBe(1);
  expect((await instData(inst.instanceId)).field_val).toBeUndefined(); // suppressed: not running
  const o = await outcomes(inst.instanceId);
  expect(o).toHaveLength(1);
  expect(o[0]).toMatchObject({ status: "succeeded", suppressed: true });
});

test.skipIf(!DB)("double invocation is tolerated: a reclaimed row is delivered exactly once", async () => {
  const body = outputBody(false);
  const inst = await createFrom(body);
  await executeManualTransition(inst, "path_ab", body, actor);
  // Crashed worker mid-delivery: the row sits claimed with an expired lease.
  const key = idempotencyKey(inst.instanceId, 1, "action_set");
  await sql`UPDATE outbox SET status = 'claimed', claimed_at = now() - interval '1 hour' WHERE idempotency_key = ${key}`;

  expect(await drainOutbox(sql, reg)).toBe(1); // reclaimed + delivered
  expect(await drainOutbox(sql, reg)).toBe(0); // redelivery attempt: no-op
  expect((await instData(inst.instanceId)).field_val).toBe(7); // written once
  expect(await outcomes(inst.instanceId)).toHaveLength(1); // recorded once
});
