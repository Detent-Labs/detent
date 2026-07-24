/**
 * Outbox: idempotency key (pure), atomic enqueue in the commit tx, and the
 * claim / deliver / mark split — delivery, retry, dead-letter, stale-claim
 * reclaim, once-only marking, and the real handler writeback + ActionOutcome +
 * terminal suppression. DB-backed parts skip when DATABASE_URL is unset — a skip
 * is visible, a false green is not.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema, createInstance } from "../src/engine/store.js";
import { executeManualTransition, fireTimer, ConcurrencyConflict } from "../src/engine/transition.js";
import { drainOutbox, MAX_ATTEMPTS, type DeliverFn } from "../src/engine/outbox.js";
import { createRegistry, register } from "../src/engine/registry.js";
import { publishBody, createDefinitionStore } from "../src/engine/definitions.js";
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
    baseLocale: "en",
    fields: [],
    workflow: {
      initialStep: "step_a",
      steps: [
        {
          id: "step_a", key: "a", label: { en: "A" }, type: "task",
          onExit: [act("x1")],
          paths: [{ id: "path_ab", key: "ab", to: "step_b", trigger: "manual", onPath: [act("p1")] }],
        },
        { id: "step_b", key: "b", label: { en: "B" }, type: "task", terminal: true, onEntry: [act("e1")] },
      ],
    },
  }) as unknown as ProcessBody;

// step_a --path_ab--> step_b (onEntry setter, writes field_val = result.val). When
// `terminal`, step_b completes the instance (exercises suppression); otherwise it
// stays running with an unused exit so the writeback applies.
const outputBody = (terminal: boolean): ProcessBody =>
  ({
    baseLocale: "en",
    fields: [],
    workflow: {
      initialStep: "step_a",
      steps: [
        { id: "step_a", key: "a", label: { en: "A" }, type: "task", paths: [{ id: "path_ab", key: "ab", to: "step_b", trigger: "manual" }] },
        terminal
          ? { id: "step_b", key: "b", label: { en: "B" }, type: "task", terminal: true, onEntry: [actOut("set", "setter", "field_val", "result.val")] }
          : { id: "step_b", key: "b", label: { en: "B" }, type: "task", onEntry: [actOut("set", "setter", "field_val", "result.val")], paths: [{ id: "path_bc", key: "bc", to: "step_c", trigger: "manual" }] },
        ...(terminal ? [] : [{ id: "step_c", key: "c", label: { en: "C" }, type: "task", terminal: true }]),
      ],
    },
  }) as unknown as ProcessBody;

// Non-terminal target whose onEntry action type is not registered -> dead-letter.
const ghostBody = (): ProcessBody =>
  ({
    baseLocale: "en",
    fields: [],
    workflow: {
      initialStep: "step_a",
      steps: [
        { id: "step_a", key: "a", label: { en: "A" }, type: "task", paths: [{ id: "path_ab", key: "ab", to: "step_b", trigger: "manual" }] },
        { id: "step_b", key: "b", label: { en: "B" }, type: "task", onEntry: [actOut("g", "ghost", "field_val", "result.val")], paths: [{ id: "path_bc", key: "bc", to: "step_c", trigger: "manual" }] },
        { id: "step_c", key: "c", label: { en: "C" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

// A reminder timer (actions, no targetPath): fires without advancing transitionSeq,
// so its actions share the seq of whatever record the instance last rested at.
const reminder = { id: "timer_r1", duration: "PT1H", onFire: { actions: [act("rem")] } };

// step_a --path_ab(manual)--> step_wait (onEntry e1, reminder timer, manual exit).
// The transition's own action and the reminder's both sit at seq 1, against two
// different records: the HistoryEntry and the timer.fired event.
const sharedSeqBody = (): ProcessBody =>
  ({
    baseLocale: "en",
    fields: [],
    workflow: {
      initialStep: "step_a",
      steps: [
        { id: "step_a", key: "a", label: { en: "A" }, type: "task", paths: [{ id: "path_ab", key: "ab", to: "step_wait", trigger: "manual" }] },
        { id: "step_wait", key: "wait", label: { en: "Wait" }, type: "task", onEntry: [act("e1")], timers: [reminder],
          paths: [{ id: "path_wd", key: "wd", to: "step_done", trigger: "manual" }] },
        { id: "step_done", key: "done", label: { en: "Done" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

// The reminder sits on the initial step, so the instance rests at seq 0 with no
// HistoryEntry at all — creation writes none.
const initialReminderBody = (): ProcessBody =>
  ({
    baseLocale: "en",
    fields: [],
    workflow: {
      initialStep: "step_wait",
      steps: [
        { id: "step_wait", key: "wait", label: { en: "Wait" }, type: "task", timers: [reminder],
          paths: [{ id: "path_wd", key: "wd", to: "step_done", trigger: "manual" }] },
        { id: "step_done", key: "done", label: { en: "Done" }, type: "task", terminal: true },
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
type EventRow = { kind: string; actions: Record<string, unknown>[] };
const events = async (id: string): Promise<EventRow[]> => {
  const r = (await sql`SELECT kind, event FROM instance_events WHERE instance_id = ${id} ORDER BY id`) as { kind: string; event: unknown }[];
  return r.map((row) => {
    const e = (typeof row.event === "string" ? JSON.parse(row.event as string) : row.event) as { actions?: Record<string, unknown>[] };
    return { kind: row.kind, actions: e.actions ?? [] };
  });
};
const historyCount = async (id: string): Promise<number> =>
  ((await sql`SELECT count(*)::int AS n FROM history_entries WHERE instance_id = ${id}`) as { n: number }[])[0].n;

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

// --- outcome routing: the enqueuing record, carried on the row ----------------

test.skipIf(!DB)("a reminder and a transition sharing one seq each record onto their own record", async () => {
  const body = sharedSeqBody();
  const inst = await createFrom(body);
  const parked = await executeManualTransition(inst, "path_ab", body, actor); // seq 1: entry action + HistoryEntry
  await fireTimer(parked, "timer_r1", body); // same seq 1, no bump: reminder action + timer.fired event

  const r = await rows(inst.instanceId);
  expect(r.map((x) => x.action_id)).toEqual(["action_e1", "action_rem"]);
  expect(r.every((x) => x.transition_seq === 1)).toBe(true); // one seq, two enqueuing records
  expect(r.find((x) => x.action_id === "action_e1")!.event_id).toBeNull(); // transition: located by (instance, seq)
  expect(r.find((x) => x.action_id === "action_rem")!.event_id).not.toBeNull(); // reminder: names its event

  expect(await drainOutbox(sql, reg, okDeliver)).toBe(2);

  // Deriving the target from (instance_id, transition_seq) would put both here.
  const h = await outcomes(inst.instanceId);
  expect(h).toHaveLength(1);
  expect(h[0]).toMatchObject({ actionId: "action_e1", status: "succeeded" });

  const ev = await events(inst.instanceId);
  expect(ev).toHaveLength(1);
  expect(ev[0].kind).toBe("timer.fired");
  expect(ev[0].actions).toHaveLength(1);
  expect(ev[0].actions[0]).toMatchObject({ actionId: "action_rem", status: "succeeded", attempts: 1 });
});

test.skipIf(!DB)("a reminder on the step an instance was created on records its outcome (seq 0, no entry)", async () => {
  const body = initialReminderBody();
  const inst = await createFrom(body); // rests at seq 0; createInstance writes no HistoryEntry
  expect(inst.transitionSeq).toBe(0);
  await fireTimer(inst, "timer_r1", body);
  expect(await historyCount(inst.instanceId)).toBe(0); // nothing for the pair to match

  expect(await drainOutbox(sql, reg, okDeliver)).toBe(1);

  // The pre-routing derivation updated zero rows, raised nothing, and dropped the
  // outcome: a delivery that succeeded left no audit trace at all.
  const ev = await events(inst.instanceId);
  expect(ev).toHaveLength(1);
  expect(ev[0].kind).toBe("timer.fired");
  expect(ev[0].actions).toHaveLength(1);
  expect(ev[0].actions[0]).toMatchObject({ actionId: "action_rem", status: "succeeded", attempts: 1 });
});

test.skipIf(!DB)("a reclaimed reminder row routes to the same event and appends once", async () => {
  const body = initialReminderBody();
  const inst = await createFrom(body);
  await fireTimer(inst, "timer_r1", body);
  // Crashed worker mid-delivery: the row sits claimed with an expired lease.
  await sql`UPDATE outbox SET status = 'claimed', claimed_at = now() - interval '1 hour' WHERE instance_id = ${inst.instanceId}`;

  expect(await drainOutbox(sql, reg, okDeliver)).toBe(1); // reclaimed + delivered
  expect(await drainOutbox(sql, reg, okDeliver)).toBe(0); // redelivery attempt: no-op
  const ev = await events(inst.instanceId);
  expect(ev[0].actions).toHaveLength(1); // recorded once, on the event
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

// --- poison-row isolation: one row's mark transaction throwing does not starve ----

test.skipIf(!DB)("a row whose mark transaction throws does not starve the batch", async () => {
  const body = outputBody(false); // step_b non-terminal, instance stays running
  const mk = () => createInstance(body, { processId: "proc_1" as Instance["processId"], version: 1 });
  const good = await mk();
  const bad = await mk();
  await executeManualTransition(good, "path_ab", body, actor); // enqueues action_set, parks running
  await executeManualTransition(bad, "path_ab", body, actor);

  // The bad row returns a patch whose fieldId makes the tx2 jsonb path literal
  // malformed ({data,x}} — a bad array literal), so its mark transaction throws;
  // the good row returns an empty patch and marks cleanly.
  const seam: DeliverFn = async (row) => (row.instance_id === bad.instanceId ? { "x}": 1 } : {});

  // The poison row's tx2 throw is isolated: the good row still delivers.
  expect(await drainOutbox(sql, reg, seam)).toBe(1);
  const rows = (await sql`SELECT instance_id, status FROM outbox`) as { instance_id: string; status: string }[];
  const byInst = Object.fromEntries(rows.map((r) => [r.instance_id, r.status]));
  expect(byInst[good.instanceId]).toBe("delivered");
  expect(byInst[bad.instanceId]).toBe("claimed"); // left for lease reclaim, not lost
});

// --- field_version lamination stamp (reconcile-migration-writebacks) ----------

test.skipIf(!DB)("a transition-enqueued row is stamped with the instance's version", async () => {
  const body = threeActionBody();
  const inst = await create(); // version 1
  await executeManualTransition(inst, "path_ab", body, actor);
  const r = await rows(inst.instanceId);
  expect(r.every((x) => x.field_version === 1)).toBe(true);
});

test.skipIf(!DB)("a timer-fire-enqueued row is stamped with the instance's version", async () => {
  const body = sharedSeqBody();
  const inst = await createFrom(body);
  const parked = await executeManualTransition(inst, "path_ab", body, actor);
  await fireTimer(parked, "timer_r1", body);
  const r = await rows(inst.instanceId);
  const reminderRow = r.find((x) => x.action_id === "action_rem")!;
  expect(reminderRow.field_version).toBe(1);
});

test.skipIf(!DB)("the backfill sets field_version from the instance's current version for a pre-existing row", async () => {
  const body = threeActionBody();
  const inst = await create(); // version 1
  await executeManualTransition(inst, "path_ab", body, actor);
  // Simulate a row that predates the column: clear field_version directly.
  await sql`UPDATE outbox SET field_version = NULL WHERE instance_id = ${inst.instanceId}`;
  await initSchema(); // idempotent; re-runs the backfill
  const r = await rows(inst.instanceId);
  expect(r.every((x) => x.field_version === 1)).toBe(true);
});

test.skipIf(!DB)("a creation-time subprocess-spawn row is stamped with the instance's version", async () => {
  const childPid = "proc_child_fv" as Instance["processId"];
  const childBody: ProcessBody = {
    key: "child", baseLocale: "en", label: { en: "Child" },
    contract: { outcomes: ["done"] }, fields: [],
    workflow: { initialStep: "step_c", steps: [
      { id: "step_c", key: "c", label: { en: "C" }, type: "task", terminal: true, outcome: "done" },
    ] },
  } as unknown as ProcessBody;
  const childVersion = (await publishBody(childPid, childBody, reg)).version;

  const parentPid = "proc_parent_fv" as Instance["processId"];
  const parentBody: ProcessBody = {
    key: "parent", baseLocale: "en", label: { en: "Parent" }, fields: [],
    workflow: { initialStep: "step_p_sub", steps: [
      { id: "step_p_sub", key: "p_sub", label: { en: "Sub" }, type: "subprocess",
        subprocess: { processId: childPid, versionBinding: "pinned", pinnedVersion: childVersion, inputMapping: {}, outputMapping: {} },
        paths: [{ id: "path_done", key: "done", to: "step_done", trigger: "automatic", priority: 1 }] },
      { id: "step_done", key: "done", label: { en: "Done" }, type: "task", terminal: true },
    ] },
  } as unknown as ProcessBody;
  const pv = await publishBody(parentPid, parentBody, reg);
  const compiled = (await createDefinitionStore(sql).resolveBody(parentPid, pv.version))!;
  const inst = await createInstance(compiled, { processId: parentPid, version: pv.version });

  const r = await rows(inst.instanceId);
  expect(r).toHaveLength(1); // the spawn row
  expect(r[0].field_version).toBe(pv.version);
});

// --- delivery-side version fold ------------------------------------------------

test.skipIf(!DB)("a stale writeback (instance migrated after enqueue) is suppressed, not misapplied under the old field id", async () => {
  const body = outputBody(false);
  const inst = await createFrom(body);
  await executeManualTransition(inst, "path_ab", body, actor); // enqueues action_set, field_version = 1

  // Simulate a migration having since moved the instance to version 2 without
  // touching this row (the residual race: a lease-expired-but-not-actually-dead
  // worker's claim survives past a migration that judged it abandoned).
  await sql`UPDATE instances SET body = jsonb_set(body, '{version}', '2'::jsonb) WHERE instance_id = ${inst.instanceId}`;

  expect(await drainOutbox(sql, reg)).toBe(1); // the outbox row's own CAS is unaffected
  expect((await instData(inst.instanceId)).field_val).toBeUndefined(); // not written under the stale field id
  const o = await outcomes(inst.instanceId);
  expect(o).toHaveLength(1);
  expect(o[0]).toMatchObject({ status: "succeeded", suppressed: true });
});

test.skipIf(!DB)("a writeback whose instance has not migrated still delivers normally (version fold matches)", async () => {
  const body = outputBody(false);
  const inst = await createFrom(body);
  await executeManualTransition(inst, "path_ab", body, actor);
  expect(await drainOutbox(sql, reg)).toBe(1);
  expect((await instData(inst.instanceId)).field_val).toBe(7);
  const o = await outcomes(inst.instanceId);
  expect(o[0]).toMatchObject({ status: "succeeded" });
  expect(o[0].suppressed).toBeUndefined();
});
