/**
 * Instance migration: the plan store (registration, freeze, validation, type
 * compatibility) and the operation (step/data remap, timer reconciliation, the
 * shared-seam consequences, locking, keyset termination, fault isolation,
 * idempotency, the audit shape, and the child-link repair). DB-backed cases hit
 * Postgres and skip when DATABASE_URL is unset — a skip is visible, a false green is
 * not.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema, createInstance } from "../src/engine/store.js";
import { publishBody, createDefinitionStore } from "../src/engine/definitions.js";
import { startInstance, executeManualTransition } from "../src/engine/transition.js";
import { drainOutbox } from "../src/engine/outbox.js";
import { registerSubprocessHandlers } from "../src/engine/subprocess.js";
import { createRegistry, register } from "../src/engine/registry.js";
import { subprocessChildId } from "../src/engine/idempotency.js";
import {
  registerMigrationPlan,
  resolveMigrationPlan,
  migrateInstances,
  findOrphanKeys,
  MigrationPlanError,
  type MigrationResult,
} from "../src/engine/migration.js";
import type { ProcessBody, Instance, MigrationSpec, InstanceEvent, HistoryEntry } from "../src/schema/definition.js";
import type { Registry as Reg } from "../src/engine/registry.js";
import type { Actor } from "../src/cel/eval.js";

const DB = !!process.env.DATABASE_URL;
const actor: Actor = { id: "user_1", roles: [] };
// The only non-core action type any fixture in this file declares (via the
// `action()` helper below) is "noop" — registered once here and threaded
// into every publishBody call.
const reg: Reg = createRegistry();
register(reg, "noop", { handler: async () => ({}) });

const cel = (src: string) => ({ lang: "cel", src });
const manualPath = (id: string, to: string) => ({ id, key: id, to, trigger: "manual" });
const autoPath = (id: string, to: string, priority: number, guardSrc?: string) =>
  ({ id, key: id, to, trigger: "automatic", priority, ...(guardSrc ? { guard: cel(guardSrc) } : {}) });

// ---- body builders -----------------------------------------------------------

type Field = { id: string; key: string; label: string; type: string };
const f = (key: string, type: string): Field => ({ id: `field_${key}`, key, label: key, type });

// A one-wait-state body: step_wait (manual -> step_done) then terminal step_done.
// The wait step's fields/timers and whether it is itself terminal or all-automatic
// are configurable, which is enough to exercise every migration shape.
function waitBody(opts: {
  key: string;
  fields: Field[];
  waitTimers?: unknown[];
  waitTerminal?: boolean;
  waitOnEntry?: unknown[];
  waitOnExit?: unknown[];
  waitAuto?: { id: string; to: string; priority: number; guard?: string }[];
}): ProcessBody {
  const wait: Record<string, unknown> = {
    id: "step_wait",
    key: "wait",
    label: "Wait",
    type: "task",
    ...(opts.waitTimers ? { timers: opts.waitTimers } : {}),
    ...(opts.waitOnEntry ? { onEntry: opts.waitOnEntry } : {}),
    ...(opts.waitOnExit ? { onExit: opts.waitOnExit } : {}),
  };
  if (opts.waitTerminal) {
    wait.terminal = true;
  } else if (opts.waitAuto) {
    wait.paths = opts.waitAuto.map((p) => autoPath(p.id, p.to, p.priority, p.guard));
  } else {
    wait.paths = [manualPath("path_done", "step_done")];
  }
  const steps: unknown[] = [wait];
  if (!opts.waitTerminal) steps.push({ id: "step_done", key: "done", label: "Done", type: "task", terminal: true });
  return { key: opts.key, label: opts.key, fields: opts.fields, workflow: { initialStep: "step_wait", steps } } as unknown as ProcessBody;
}

// ---- helpers -----------------------------------------------------------------

const loadInstance = async (id: string): Promise<Instance | undefined> => {
  const r = (await sql`SELECT body FROM instances WHERE instance_id = ${id}`) as { body: unknown }[];
  return r.length ? (JSON.parse(typeof r[0].body === "string" ? (r[0].body as string) : JSON.stringify(r[0].body)) as Instance) : undefined;
};
const dataField = (i: Instance | undefined, fieldId: string): unknown => (i!.data as Record<string, unknown>)[fieldId];
const historyOf = async (id: string): Promise<HistoryEntry[]> => {
  const r = (await sql`SELECT entry FROM history_entries WHERE instance_id = ${id} ORDER BY transition_seq`) as { entry: unknown }[];
  return r.map((x) => (typeof x.entry === "string" ? JSON.parse(x.entry) : x.entry) as HistoryEntry);
};
const eventsOf = async (id: string): Promise<InstanceEvent[]> => {
  const r = (await sql`SELECT event FROM instance_events WHERE instance_id = ${id} ORDER BY id`) as { event: unknown }[];
  return r.map((x) => (typeof x.event === "string" ? JSON.parse(x.event) : x.event) as InstanceEvent);
};
// A declarative noop action, referenced by id in the outbox after a commit.
const action = (id: string) => ({ id, type: "noop", config: {} });
const outboxActionIds = async (id: string): Promise<string[]> => {
  const r = (await sql`SELECT action_id FROM outbox WHERE instance_id = ${id}`) as { action_id: string }[];
  return r.map((x) => x.action_id);
};
const nextTimerAt = async (id: string): Promise<string | null> => {
  // timestamptz comes back from Bun.sql as a Date; normalise to the ISO form the
  // armed fireAt strings use so the two compare.
  const r = (await sql`SELECT next_timer_at FROM instances WHERE instance_id = ${id}`) as { next_timer_at: string | Date | null }[];
  const v = r[0]?.next_timer_at;
  return v ? new Date(v).toISOString() : null;
};

// Create a running instance pinned to a published version, at its initial step. The
// body is resolved from the store so its hash matches the published (compiled) pin.
const mkInstance = async (pid: Instance["processId"], version: number, data?: Record<string, unknown>): Promise<Instance> => {
  const body = (await createDefinitionStore(sql).resolveBody(pid, version))!;
  return createInstance(body, { processId: pid, version, ...(data ? { data: data as Instance["data"] } : {}) }, sql);
};

// Publish `body` as the next version, label-stamped so an otherwise-identical body
// still lands on its own version — publishBody is idempotent on hash, so two identical
// bodies would collapse to one version. Cloned first so a shared reference is never
// mutated. Returns the assigned version.
const publishV = async (p: Instance["processId"], body: ProcessBody, tag: string): Promise<number> => {
  const b = structuredClone(body) as Record<string, unknown>;
  b.label = `${(b.label ?? b.key) as string} #${tag}`;
  return (await publishBody(p, b as unknown as ProcessBody, reg)).version;
};
// Publish `count` distinct trivial versions (1..count).
const publishN = async (p: Instance["processId"], count: number): Promise<void> => {
  for (let i = 1; i <= count; i++) await publishV(p, waitBody({ key: "a", fields: [f("x", "string")] }), String(i));
};

// try/catch assertion, not `expect(...).rejects`: the async matcher wedges the
// Bun.sql pool under bun:test on this host, so await-then-assert is used instead.
async function expectReject(p: Promise<unknown>, match?: RegExp): Promise<void> {
  let err: unknown;
  try {
    await p;
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(MigrationPlanError);
  if (match) expect((err as Error).message).toMatch(match);
}

function engineRegistry(): { registry: Reg } {
  const store = createDefinitionStore(sql);
  const registry: Reg = new Map();
  registerSubprocessHandlers(registry, sql, store.resolveBody, store.resolveLatestByContract);
  return { registry };
}
async function drainAll(registry: Reg): Promise<void> {
  while ((await drainOutbox(sql, registry)) > 0) { /* keep draining */ }
}

// Unique process id per test so populations never bleed across cases even before the
// TRUNCATE (the scan is version-scoped, but distinct ids make intent obvious).
let n = 0;
const pid = () => `proc_mig_${++n}` as Instance["processId"];

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE outbox, instances, history_entries, instance_events, definitions, migration_plans`;
});

// =============================================================================
// 4.6 The plan store: registration, freeze, structural + type validation.
// =============================================================================

test.skipIf(!DB)("a plan is registered and retrieved by its version pair", async () => {
  const p = pid();
  await publishN(p, 2);
  await registerMigrationPlan(p as Instance["processId"], 1, 2, {} as MigrationSpec);
  const plan = await resolveMigrationPlan(p as Instance["processId"], 1, 2);
  expect(plan).toBeDefined();
  expect(plan!.appliedAt).toBeNull();
});

test.skipIf(!DB)("several source versions target one target version", async () => {
  const p = pid();
  for (let i = 0; i < 4; i++) await publishBody(p, waitBody({ key: "a", fields: [f("x", "string"), ...(i ? [f(`v${i}`, "string")] : [])] }), reg);
  for (const from of [1, 2, 3]) await registerMigrationPlan(p as Instance["processId"], from, 4, {} as MigrationSpec);
  for (const from of [1, 2, 3]) expect(await resolveMigrationPlan(p as Instance["processId"], from, 4)).toBeDefined();
});

test.skipIf(!DB)("a plan naming an unpublished version is refused", async () => {
  const p = pid();
  await publishBody(p, waitBody({ key: "a", fields: [f("x", "string")] }), reg);
  await expectReject(registerMigrationPlan(p as Instance["processId"], 1, 2, {} as MigrationSpec));
  expect(await resolveMigrationPlan(p as Instance["processId"], 1, 2)).toBeUndefined();
});

test.skipIf(!DB)("from === to is refused", async () => {
  const p = pid();
  await publishBody(p, waitBody({ key: "a", fields: [f("x", "string")] }), reg);
  await expectReject(registerMigrationPlan(p as Instance["processId"], 1, 1, {} as MigrationSpec));
});

test.skipIf(!DB)("an unused plan is replaced; an applied plan is frozen", async () => {
  const p = pid();
  await publishN(p, 2);
  await registerMigrationPlan(p as Instance["processId"], 1, 2, {} as MigrationSpec);
  // Unused: replaceable.
  await registerMigrationPlan(p as Instance["processId"], 1, 2, { transforms: {} } as MigrationSpec);
  // Apply (no instances -> empty run) then freeze.
  await migrateInstances(p as Instance["processId"], 1, 2, sql);
  expect((await resolveMigrationPlan(p as Instance["processId"], 1, 2))!.appliedAt).not.toBeNull();
  await expectReject(registerMigrationPlan(p as Instance["processId"], 1, 2, {} as MigrationSpec), /already applied/);
});

test.skipIf(!DB)("an invocation that migrates nothing still freezes the plan", async () => {
  const p = pid();
  await publishN(p, 2);
  await registerMigrationPlan(p as Instance["processId"], 1, 2, {} as MigrationSpec);
  await migrateInstances(p as Instance["processId"], 1, 2, sql); // no instances
  expect((await resolveMigrationPlan(p as Instance["processId"], 1, 2))!.appliedAt).not.toBeNull();
});

test.skipIf(!DB)("freezing is per key", async () => {
  const p = pid();
  await publishN(p, 4);
  await registerMigrationPlan(p as Instance["processId"], 1, 4, {} as MigrationSpec);
  await registerMigrationPlan(p as Instance["processId"], 2, 4, {} as MigrationSpec);
  await migrateInstances(p as Instance["processId"], 1, 4, sql); // applies (1->4) only
  // (2->4) unapplied, still replaceable.
  await registerMigrationPlan(p as Instance["processId"], 2, 4, { transforms: {} } as MigrationSpec);
});

test.skipIf(!DB)("a registration racing an invocation cannot leave the frozen spec disagreeing with what was applied", async () => {
  const p = pid();
  const v1 = waitBody({ key: "a", fields: [f("x", "string"), f("marker", "string")] });
  const v2 = waitBody({ key: "a", fields: [f("x", "string"), f("marker", "string")] });
  await publishV(p, v1, "1");
  await publishV(p, v2, "2");
  const specA = { transforms: { field_marker: cel('"A"') } } as unknown as MigrationSpec;
  const specB = { transforms: { field_marker: cel('"B"') } } as unknown as MigrationSpec;
  await registerMigrationPlan(p as Instance["processId"], 1, 2, specA);
  const inst = await mkInstance(p, 1, { field_x: "hi" });

  // Hold the migration_plans row, start migrateInstances (its read-and-freeze UPDATE
  // blocks on the lock, on its own connection), then queue a racing registration for
  // a different spec (also on its own connection) before releasing. Neither call is
  // awaited while the lock is held -- awaiting either here, on a different
  // connection than the one holding the lock, would deadlock the test itself, not
  // just exercise the race. Whichever statement actually commits first once the
  // lock is released governs both what gets frozen and what the instance is
  // migrated under -- the atomic UPDATE closes the old gap in which those two could
  // disagree.
  // Each racing call gets its outcome captured via .then's two callbacks right at
  // creation time, on the same microtask turn -- not via a later try/await, which
  // would leave the promise's rejection unobserved (and bun:test failing the test
  // for it) for the whole stretch between creation and that later await.
  type Settled<T> = { ok: true; v: T } | { ok: false; e: unknown };
  let migP: Promise<Settled<MigrationResult>>;
  let regP: Promise<Settled<void>>;
  await sql.begin(async (tx) => {
    await tx`SELECT 1 FROM migration_plans
      WHERE process_id = ${p} AND from_version = 1 AND to_version = 2 FOR UPDATE`;
    migP = migrateInstances(p as Instance["processId"], 1, 2, sql).then(
      (v) => ({ ok: true, v }) as Settled<MigrationResult>,
      (e) => ({ ok: false, e }) as Settled<MigrationResult>,
    );
    await new Promise((r) => setTimeout(r, 150)); // let migrateInstances reach its UPDATE and block
    regP = registerMigrationPlan(p as Instance["processId"], 1, 2, specB).then(
      () => ({ ok: true, v: undefined }) as Settled<void>,
      (e) => ({ ok: false, e }) as Settled<void>,
    );
    await new Promise((r) => setTimeout(r, 150)); // let it reach its own upsert and block too
    // Neither is awaited here -- awaiting either while still holding the lock (this
    // callback hasn't returned, so the transaction hasn't committed) would deadlock
    // the test, not just exercise the race. The .then above still attaches a handler
    // synchronously at creation, so neither settling later is ever "unhandled."
  });
  // The lock is released now (the transaction above committed); await both to their
  // conclusion, which the lock release unblocks.
  const migSettled = await migP!;
  const regSettled = await regP!;
  if (!migSettled.ok) throw migSettled.e;
  let registerRefused = false;
  if (!regSettled.ok) {
    expect(regSettled.e).toBeInstanceOf(MigrationPlanError);
    registerRefused = true;
  }

  const frozen = await resolveMigrationPlan(p as Instance["processId"], 1, 2);
  const after = await loadInstance(inst.instanceId);
  const frozenMarker = (frozen!.spec.transforms as Record<string, unknown> | undefined)?.field_marker
    ? ((frozen!.spec.transforms as Record<string, { src: string }>).field_marker.src === '"A"' ? "A" : "B")
    : undefined;
  // The instance was migrated under whichever spec ends up frozen -- never the
  // other one. registerMigrationPlan's request for the row lock is issued only
  // after it has already validated specB against both bodies, well after
  // migrateInstances's read-and-freeze UPDATE (the very first thing it does) has
  // started waiting on the same lock, so it loses the race deterministically.
  expect(registerRefused).toBe(true);
  expect(frozenMarker).toBe("A");
  expect(dataField(after, "field_marker")).toBe("A");
});

test.skipIf(!DB)("structural validation rejects out-of-body maps and the cancel-sink", async () => {
  const p = pid();
  await publishN(p, 2);
  const P = p as Instance["processId"];
  // stepMap value outside the target body.
  await expectReject(registerMigrationPlan(P, 1, 2, { stepMap: { step_wait: "step_nope" } } as unknown as MigrationSpec));
  // stepMap key outside the source body.
  await expectReject(registerMigrationPlan(P, 1, 2, { stepMap: { step_nope: "step_done" } } as unknown as MigrationSpec));
  // The reserved cancel-sink is refused as a target.
  await expectReject(registerMigrationPlan(P, 1, 2, { stepMap: { step_wait: "step_cancel_sink" } } as unknown as MigrationSpec), /cancel-sink/);
  await expectReject(
    registerMigrationPlan(P, 1, 2, { onUnmappable: "route-to-step", unmappableStep: "step_cancel_sink" } as unknown as MigrationSpec),
    /cancel-sink/,
  );
});

test.skipIf(!DB)("type compatibility rejects incompatible fieldMap and identity-carried type changes", async () => {
  const p = pid();
  await publishBody(p, waitBody({ key: "a", fields: [f("amount", "string"), f("note", "string")] }), reg);
  // v2: field_amount is now a number (identity-carried type change), plus a number target.
  await publishBody(p, waitBody({ key: "a", fields: [f("amount", "number"), f("note", "string"), f("total", "number")] }), reg);
  const P = p as Instance["processId"];
  // fieldMap moving a string into a number field.
  await expectReject(registerMigrationPlan(P, 1, 2, { fieldMap: { field_note: "field_total" } } as unknown as MigrationSpec), /incompatible/);
  // identity-carried field_amount changed string->number with no fieldMap entry.
  await expectReject(registerMigrationPlan(P, 1, 2, {} as MigrationSpec), /changes type/);
});

// =============================================================================
// 6.x The operation.
// =============================================================================

// A helper to publish v1/v2 and register a plan in one shot.
async function twoVersions(p: Instance["processId"], v1: ProcessBody, v2: ProcessBody, spec: MigrationSpec): Promise<void> {
  await publishV(p, v1, "1");
  await publishV(p, v2, "2");
  await registerMigrationPlan(p, 1, 2, spec);
}

test.skipIf(!DB)("6.x an identity migration records one entry and advances the sequence", async () => {
  const p = pid();
  const b = waitBody({ key: "a", fields: [f("x", "string")] });
  await twoVersions(p, b, b, {} as MigrationSpec);
  const inst = await mkInstance(p, 1, { field_x: "hi" });
  const res = await migrateInstances(p as Instance["processId"], 1, 2, sql);
  expect(res.migrated).toEqual([inst.instanceId]);
  const after = await loadInstance(inst.instanceId);
  expect(after!.version).toBe(2);
  expect(after!.transitionSeq).toBe(inst.transitionSeq + 1);
  expect(dataField(after, "field_x")).toBe("hi"); // carried
  const hist = await historyOf(inst.instanceId);
  expect(hist).toHaveLength(1);
  expect(hist[0].cause).toBe("migration");
  expect(hist[0].pathId).toBeNull();
  expect(hist[0].version).toBe(2);
  expect(hist[0].fromStepId).toBe(hist[0].toStepId); // identity
});

test.skipIf(!DB)("6.2 migration onto a terminal step yields completed", async () => {
  const p = pid();
  const v1 = waitBody({ key: "a", fields: [f("x", "string")] });
  const v2 = waitBody({ key: "a", fields: [f("x", "string")], waitTerminal: true });
  await twoVersions(p, v1, v2, {} as MigrationSpec);
  const inst = await mkInstance(p, 1);
  await migrateInstances(p as Instance["processId"], 1, 2, sql);
  const after = await loadInstance(inst.instanceId);
  expect(after!.status).toBe("completed");
});

test.skipIf(!DB)("6.2 a migrated instance whose guard now matches is advanced to rest", async () => {
  const p = pid();
  const v1 = waitBody({ key: "a", fields: [f("x", "string")] });
  // v2: step_wait is all-automatic, routing to step_done when x == 'go'.
  const v2 = waitBody({
    key: "a",
    fields: [f("x", "string")],
    waitAuto: [{ id: "path_go", to: "step_done", priority: 1, guard: "data.x == 'go'" }],
  });
  // A transform sets x = 'go' so the guard the migration lands on already matches.
  await twoVersions(p, v1, v2, { transforms: { field_x: cel("'go'") } } as unknown as MigrationSpec);
  const inst = await mkInstance(p, 1);
  await migrateInstances(p as Instance["processId"], 1, 2, sql);
  // Migration defers the cascade: it flags the instance for re-resolution rather than
  // cascading inline (the worker, exercised in resolution.test.ts, then advances it).
  const rs = (await sql`SELECT resolve_state FROM instances WHERE instance_id = ${inst.instanceId}`) as { resolve_state: string }[];
  expect(rs[0].resolve_state).toBe("pending");
  const after = await loadInstance(inst.instanceId);
  expect(dataField(after, "field_x")).toBe("go"); // transform ran, so the guard will match
});

test.skipIf(!DB)("6.7 data remapping: rename, swap, orphan retention, integer transform", async () => {
  const p = pid();
  const v1 = waitBody({ key: "a", fields: [f("a", "string"), f("b", "string"), f("gone", "string")] });
  // v2 declares a, b, and a plugin-typed `total` (dyn) so a CEL int result is accepted
  // there — a `number` field is CEL `double` and would reject an int literal. 'gone' is
  // not declared but its value is retained.
  const pluginTotal = { id: "field_total", key: "total", label: "total", type: { type: "counter", config: {} } };
  const v2 = waitBody({ key: "a", fields: [f("a", "string"), f("b", "string"), pluginTotal as unknown as Field] });
  // swap a<->b, and a transform writing a CEL integer into the dyn field.
  await twoVersions(p, v1, v2, {
    fieldMap: { field_a: "field_b", field_b: "field_a" },
    transforms: { field_total: cel("1 + 2") },
  } as unknown as MigrationSpec);
  const inst = await mkInstance(p, 1, { field_a: "A", field_b: "B", field_gone: "keepme" });
  await migrateInstances(p as Instance["processId"], 1, 2, sql);
  const after = await loadInstance(inst.instanceId);
  expect(dataField(after, "field_a")).toBe("B"); // swapped
  expect(dataField(after, "field_b")).toBe("A");
  expect(dataField(after, "field_gone")).toBe("keepme"); // orphan retained
  expect(dataField(after, "field_total")).toBe(3); // CEL int coerced bigint->number
  expect(typeof dataField(after, "field_total")).toBe("number"); // not a bigint
  expect(after!.version).toBe(2);
  // Every transform succeeded -> no migration.transform-dropped event.
  expect((await eventsOf(inst.instanceId)).filter((e) => e.kind === "migration.transform-dropped")).toHaveLength(0);
});

test.skipIf(!DB)("6.7 a raising transform leaves its field unwritten", async () => {
  const p = pid();
  const v1 = waitBody({ key: "a", fields: [f("x", "string")] });
  const v2 = waitBody({ key: "a", fields: [f("x", "string"), f("y", "string")] });
  await twoVersions(p, v1, v2, { transforms: { field_y: cel("data.x") } } as unknown as MigrationSpec);
  const inst = await mkInstance(p, 1); // x never written
  await migrateInstances(p as Instance["processId"], 1, 2, sql);
  const after = await loadInstance(inst.instanceId);
  expect("field_y" in (after!.data as object)).toBe(false); // absent, migration still happened
  expect(after!.version).toBe(2);
  const dropped = (await eventsOf(inst.instanceId)).find((e) => e.kind === "migration.transform-dropped");
  expect(dropped).toBeDefined();
  expect((dropped as unknown as { payload: { fieldId: string; reason: string } }).payload).toEqual({
    fieldId: "field_y",
    reason: "expression-raised",
  });
});

test.skipIf(!DB)("6.7 a transform yielding an out-of-range value leaves its field unwritten", async () => {
  const p = pid();
  const v1 = waitBody({ key: "a", fields: [f("x", "string")] });
  // A plugin-typed (dyn) target field, like "6.7 data remapping" above — a
  // "number" field is CEL `double` and would reject an int literal at plan
  // registration, before the migration ever runs.
  const pluginTotal = { id: "field_total", key: "total", label: "total", type: { type: "counter", config: {} } };
  const v2 = waitBody({ key: "a", fields: [f("x", "string"), pluginTotal as unknown as Field] });
  await twoVersions(p, v1, v2, { transforms: { field_total: cel("9223372036854775807") } } as unknown as MigrationSpec);
  const inst = await mkInstance(p, 1);
  await migrateInstances(p as Instance["processId"], 1, 2, sql);
  const after = await loadInstance(inst.instanceId);
  expect("field_total" in (after!.data as object)).toBe(false); // absent, migration still happened
  expect(after!.version).toBe(2);
  const dropped = (await eventsOf(inst.instanceId)).find((e) => e.kind === "migration.transform-dropped");
  expect(dropped).toBeDefined();
  expect((dropped as unknown as { payload: { fieldId: string; reason: string } }).payload).toEqual({
    fieldId: "field_total",
    reason: "value-out-of-range",
  });
});

test.skipIf(!DB)("6.x unmappable: reject-and-pin leaves the instance; route-to-step relocates it", async () => {
  const p = pid();
  // v1 has step_wait; v2 removes it (only step_a + step_done) so an instance on
  // step_wait is unmappable.
  const v1 = waitBody({ key: "a", fields: [f("x", "string")] });
  const v2: ProcessBody = {
    key: "a", label: "a", fields: [f("x", "string")],
    workflow: {
      initialStep: "step_a",
      steps: [
        { id: "step_a", key: "a", label: "A", type: "task", paths: [manualPath("path_ad", "step_done")] },
        { id: "step_done", key: "done", label: "Done", type: "task", terminal: true },
      ],
    },
  } as unknown as ProcessBody;
  // reject-and-pin (no onUnmappable).
  await twoVersions(p, v1, v2, {} as MigrationSpec);
  const inst = await mkInstance(p, 1, { field_x: "v" });
  const res = await migrateInstances(p as Instance["processId"], 1, 2, sql);
  expect(res.skipped).toEqual([inst.instanceId]);
  const after = await loadInstance(inst.instanceId);
  expect(after!.version).toBe(1); // untouched pin
  expect(after!.currentStepId as string).toBe("step_wait");
  const evts = await eventsOf(inst.instanceId);
  expect(evts.some((e) => e.kind === "migration.skipped" && e.payload.reason === "step-unmappable")).toBe(true);
});

test.skipIf(!DB)("6.x route-to-step relocates an unmappable instance", async () => {
  const p = pid();
  const v1 = waitBody({ key: "a", fields: [f("x", "string")] });
  const v2: ProcessBody = {
    key: "a", label: "a", fields: [f("x", "string")],
    workflow: {
      initialStep: "step_a",
      steps: [
        { id: "step_a", key: "a", label: "A", type: "task", paths: [manualPath("path_ad", "step_done")] },
        { id: "step_done", key: "done", label: "Done", type: "task", terminal: true },
      ],
    },
  } as unknown as ProcessBody;
  await twoVersions(p, v1, v2, { onUnmappable: "route-to-step", unmappableStep: "step_a" } as unknown as MigrationSpec);
  const inst = await mkInstance(p, 1, { field_x: "v" });
  const res = await migrateInstances(p as Instance["processId"], 1, 2, sql);
  expect(res.migrated).toEqual([inst.instanceId]);
  const after = await loadInstance(inst.instanceId);
  expect(after!.version).toBe(2);
  expect(after!.currentStepId as string).toBe("step_a");
  expect(dataField(after, "field_x")).toBe("v");
});

test.skipIf(!DB)("6.4 a skipped instance produces an event and no history entry", async () => {
  const p = pid();
  const v1 = waitBody({ key: "a", fields: [f("x", "string")] });
  const v2: ProcessBody = {
    key: "a", label: "a", fields: [f("x", "string")],
    workflow: { initialStep: "step_a", steps: [
      { id: "step_a", key: "a", label: "A", type: "task", paths: [manualPath("path_ad", "step_done")] },
      { id: "step_done", key: "done", label: "Done", type: "task", terminal: true },
    ] },
  } as unknown as ProcessBody;
  await twoVersions(p, v1, v2, {} as MigrationSpec);
  const inst = await mkInstance(p, 1);
  await migrateInstances(p as Instance["processId"], 1, 2, sql);
  expect(await historyOf(inst.instanceId)).toHaveLength(0);
  const evts = await eventsOf(inst.instanceId);
  expect(evts).toHaveLength(1);
  expect(evts[0].kind).toBe("migration.skipped");
  expect(evts[0].version).toBe(1); // source version
  expect(evts[0].transitionSeq).toBe(inst.transitionSeq); // unchanged
});

test.skipIf(!DB)("6.6 an instance with a pending action is skipped, then migrates once drained", async () => {
  const p = pid();
  const b = waitBody({ key: "a", fields: [f("x", "string")] });
  await twoVersions(p, b, b, {} as MigrationSpec);
  const inst = await mkInstance(p, 1);
  // A pending (undelivered) outbox row for this instance.
  await sql`INSERT INTO outbox (idempotency_key, instance_id, transition_seq, action_id, action)
    VALUES (${"idem_" + inst.instanceId}, ${inst.instanceId}, ${inst.transitionSeq}, ${"action_x"}, ${{ id: "action_x", type: "noop", config: {} }})`;
  const res1 = await migrateInstances(p as Instance["processId"], 1, 2, sql);
  expect(res1.skipped).toEqual([inst.instanceId]);
  const skipEv = (await eventsOf(inst.instanceId)).find((e) => e.kind === "migration.skipped");
  expect(skipEv && skipEv.payload.reason).toBe("pending-actions");
  // Deliver it, then a later invocation migrates.
  await sql`UPDATE outbox SET status = 'delivered' WHERE instance_id = ${inst.instanceId}`;
  const res2 = await migrateInstances(p as Instance["processId"], 1, 2, sql);
  expect(res2.migrated).toEqual([inst.instanceId]);
});

test.skipIf(!DB)("6.6 an instance with only delivered rows migrates immediately", async () => {
  const p = pid();
  const b = waitBody({ key: "a", fields: [f("x", "string")] });
  await twoVersions(p, b, b, {} as MigrationSpec);
  const inst = await mkInstance(p, 1);
  await sql`INSERT INTO outbox (idempotency_key, instance_id, transition_seq, action_id, action, status)
    VALUES (${"idem_" + inst.instanceId}, ${inst.instanceId}, ${inst.transitionSeq}, ${"action_x"}, ${{ id: "action_x", type: "noop", config: {} }}, 'delivered')`;
  const res = await migrateInstances(p as Instance["processId"], 1, 2, sql);
  expect(res.migrated).toEqual([inst.instanceId]);
});

test.skipIf(!DB)("6.8 timer reconciliation: surviving fireAt kept, withdrawn dropped, new armed, next_timer_at recomputed", async () => {
  const p = pid();
  const timerKeep = { id: "timer_keep", key: "keep", duration: "PT1H", onFire: { actions: [] } };
  const timerGone = { id: "timer_gone", key: "gone", duration: "PT10M", onFire: { actions: [] } };
  const timerNew = { id: "timer_new", key: "new", duration: "PT30M", onFire: { actions: [] } };
  const v1 = waitBody({ key: "a", fields: [f("x", "string")], waitTimers: [timerKeep, timerGone] });
  const v2 = waitBody({ key: "a", fields: [f("x", "string")], waitTimers: [timerKeep, timerNew] });
  await twoVersions(p, v1, v2, {} as MigrationSpec);
  const inst = await mkInstance(p, 1); // arms timer_keep (+1h) and timer_gone (+10m)
  const before = await loadInstance(inst.instanceId);
  const keepFireAt = (before!.timers ?? []).find((t) => (t.timerId as string) === "timer_keep")!.fireAt;
  await migrateInstances(p as Instance["processId"], 1, 2, sql);
  const after = await loadInstance(inst.instanceId);
  const ids = (after!.timers ?? []).map((t) => t.timerId as string).sort();
  expect(ids).toEqual(["timer_keep", "timer_new"]); // gone dropped, new armed
  const keepAfter = (after!.timers ?? []).find((t) => (t.timerId as string) === "timer_keep")!;
  expect(keepAfter.fireAt).toBe(keepFireAt); // byte-identical, not re-armed
  // next_timer_at is the min of {timer_keep(+1h), timer_new(+30m)} = timer_new.
  const nt = await nextTimerAt(inst.instanceId);
  const newFireAt = (after!.timers ?? []).find((t) => (t.timerId as string) === "timer_new")!.fireAt as string;
  expect(nt).toBe(newFireAt);
});

test.skipIf(!DB)("6.8 a fired timer that survives is neither resurrected nor dropped", async () => {
  const p = pid();
  const timerR = { id: "timer_r", key: "r", duration: "PT1H", onFire: { actions: [] } };
  const b = waitBody({ key: "a", fields: [f("x", "string")], waitTimers: [timerR] });
  await twoVersions(p, b, b, {} as MigrationSpec);
  const inst = await mkInstance(p, 1);
  // Mark the carried timer fired.
  await sql`UPDATE instances SET body = jsonb_set(body, '{timers,0,fired}', 'true'::jsonb) WHERE instance_id = ${inst.instanceId}`;
  await migrateInstances(p as Instance["processId"], 1, 2, sql);
  const after = await loadInstance(inst.instanceId);
  const t = (after!.timers ?? []).find((x) => (x.timerId as string) === "timer_r")!;
  expect(t.fired).toBe(true); // still fired, not re-armed
  expect((after!.timers ?? []).filter((x) => (x.timerId as string) === "timer_r")).toHaveLength(1);
});

test.skipIf(!DB)("6.8 a redeclared duration is detected and re-armed at the migration instant", async () => {
  const p = pid();
  const timerT1 = { id: "timer_t", key: "t", duration: "PT1H", onFire: { actions: [] } };
  const timerT2 = { id: "timer_t", key: "t", duration: "PT2H", onFire: { actions: [] } };
  const v1 = waitBody({ key: "a", fields: [f("x", "string")], waitTimers: [timerT1] });
  const v2 = waitBody({ key: "a", fields: [f("x", "string")], waitTimers: [timerT2] });
  await twoVersions(p, v1, v2, {} as MigrationSpec);
  const inst = await mkInstance(p, 1);
  const before = await loadInstance(inst.instanceId);
  const beforeFireAt = (before!.timers ?? []).find((t) => (t.timerId as string) === "timer_t")!.fireAt as string;
  await migrateInstances(p as Instance["processId"], 1, 2, sql);
  const after = await loadInstance(inst.instanceId);
  const t = (after!.timers ?? []).find((x) => (x.timerId as string) === "timer_t")! as unknown as {
    fireAt: string;
    provenance: { kind: string; duration: string; armedAt: string };
  };
  // Re-armed relative to the migration instant (now), which is later than the
  // original entry instant + PT1H, whereas the new PT2H fireAt is even later still —
  // so "later than the old fireAt" is a robust signal a re-arm happened, not a flaky one.
  expect(new Date(t.fireAt).getTime()).toBeGreaterThan(new Date(beforeFireAt).getTime());
  expect(t.provenance).toEqual({ kind: "duration", duration: "PT2H", armedAt: expect.any(String) });
});

test.skipIf(!DB)("6.8 a duration-to-deadline flip is detected and re-armed via deadline evaluation", async () => {
  const p = pid();
  const timerAsDuration = { id: "timer_t", key: "t", duration: "PT1H", onFire: { actions: [] } };
  const timerAsDeadline = { id: "timer_t", key: "t", deadline: cel("data.due"), onFire: { actions: [] } };
  const v1 = waitBody({ key: "a", fields: [f("x", "string"), f("due", "string")], waitTimers: [timerAsDuration] });
  const v2 = waitBody({ key: "a", fields: [f("x", "string"), f("due", "string")], waitTimers: [timerAsDeadline] });
  await twoVersions(p, v1, v2, {} as MigrationSpec);
  const inst = await mkInstance(p, 1, { field_due: "2030-01-01T00:00:00Z" });
  await migrateInstances(p as Instance["processId"], 1, 2, sql);
  const after = await loadInstance(inst.instanceId);
  const t = (after!.timers ?? []).find((x) => (x.timerId as string) === "timer_t")! as unknown as {
    fireAt: string;
    provenance: { kind: string; src: string; armedAt: string };
  };
  expect(t.fireAt).toBe("2030-01-01T00:00:00.000Z"); // evaluated, not kept from the old duration arm
  expect(t.provenance).toEqual({ kind: "deadline", src: "data.due", armedAt: expect.any(String) });
});

test.skipIf(!DB)("6.8 a deadline-to-duration flip is detected and re-armed relative to the migration instant", async () => {
  const p = pid();
  const timerAsDeadline = { id: "timer_t", key: "t", deadline: cel("data.due"), onFire: { actions: [] } };
  const timerAsDuration = { id: "timer_t", key: "t", duration: "PT1H", onFire: { actions: [] } };
  const v1 = waitBody({ key: "a", fields: [f("x", "string"), f("due", "string")], waitTimers: [timerAsDeadline] });
  const v2 = waitBody({ key: "a", fields: [f("x", "string"), f("due", "string")], waitTimers: [timerAsDuration] });
  await twoVersions(p, v1, v2, {} as MigrationSpec);
  const inst = await mkInstance(p, 1, { field_due: "2030-01-01T00:00:00Z" });
  const before = await loadInstance(inst.instanceId);
  const beforeFireAt = (before!.timers ?? []).find((t) => (t.timerId as string) === "timer_t")!.fireAt;
  expect(beforeFireAt).toBe("2030-01-01T00:00:00.000Z");
  await migrateInstances(p as Instance["processId"], 1, 2, sql);
  const after = await loadInstance(inst.instanceId);
  const t = (after!.timers ?? []).find((x) => (x.timerId as string) === "timer_t")! as unknown as {
    fireAt: string;
    provenance: { kind: string; duration: string; armedAt: string };
  };
  expect(t.fireAt).not.toBe(beforeFireAt); // no longer the far-future deadline instant
  expect(t.provenance).toEqual({ kind: "duration", duration: "PT1H", armedAt: expect.any(String) });
});

test.skipIf(!DB)("6.8 a changed deadline source is detected and re-armed", async () => {
  const p = pid();
  const timerV1 = { id: "timer_t", key: "t", deadline: cel("data.due"), onFire: { actions: [] } };
  const timerV2 = { id: "timer_t", key: "t", deadline: cel("data.due2"), onFire: { actions: [] } };
  const v1 = waitBody({ key: "a", fields: [f("x", "string"), f("due", "string"), f("due2", "string")], waitTimers: [timerV1] });
  const v2 = waitBody({ key: "a", fields: [f("x", "string"), f("due", "string"), f("due2", "string")], waitTimers: [timerV2] });
  await twoVersions(p, v1, v2, {} as MigrationSpec);
  const inst = await mkInstance(p, 1, { field_due: "2030-01-01T00:00:00Z", field_due2: "2031-06-15T00:00:00Z" });
  await migrateInstances(p as Instance["processId"], 1, 2, sql);
  const after = await loadInstance(inst.instanceId);
  const t = (after!.timers ?? []).find((x) => (x.timerId as string) === "timer_t")! as unknown as {
    fireAt: string;
    provenance: { kind: string; src: string; armedAt: string };
  };
  expect(t.fireAt).toBe("2031-06-15T00:00:00.000Z"); // re-evaluated against the new source
  expect(t.provenance).toEqual({ kind: "deadline", src: "data.due2", armedAt: expect.any(String) });
});

test.skipIf(!DB)("6.8 a fired timer is kept even if its declaration changed", async () => {
  const p = pid();
  const timerR1 = { id: "timer_r", key: "r", duration: "PT1H", onFire: { actions: [] } };
  const timerR2 = { id: "timer_r", key: "r", duration: "PT2H", onFire: { actions: [] } };
  const v1 = waitBody({ key: "a", fields: [f("x", "string")], waitTimers: [timerR1] });
  const v2 = waitBody({ key: "a", fields: [f("x", "string")], waitTimers: [timerR2] });
  await twoVersions(p, v1, v2, {} as MigrationSpec);
  const inst = await mkInstance(p, 1);
  const before = await loadInstance(inst.instanceId);
  const originalFireAt = (before!.timers ?? []).find((t) => (t.timerId as string) === "timer_r")!.fireAt;
  await sql`UPDATE instances SET body = jsonb_set(body, '{timers,0,fired}', 'true'::jsonb) WHERE instance_id = ${inst.instanceId}`;
  await migrateInstances(p as Instance["processId"], 1, 2, sql);
  const after = await loadInstance(inst.instanceId);
  const t = (after!.timers ?? []).find((x) => (x.timerId as string) === "timer_r")!;
  expect(t.fired).toBe(true);
  expect(t.fireAt).toBe(originalFireAt); // not re-armed despite the changed declaration
});

test.skipIf(!DB)("6.8 a carried timer with no provenance is trusted and kept even if the declaration changed", async () => {
  const p = pid();
  const timerL1 = { id: "timer_l", key: "l", duration: "PT1H", onFire: { actions: [] } };
  const timerL2 = { id: "timer_l", key: "l", duration: "PT9H", onFire: { actions: [] } };
  const v1 = waitBody({ key: "a", fields: [f("x", "string")], waitTimers: [timerL1] });
  const v2 = waitBody({ key: "a", fields: [f("x", "string")], waitTimers: [timerL2] });
  await twoVersions(p, v1, v2, {} as MigrationSpec);
  const inst = await mkInstance(p, 1);
  const before = await loadInstance(inst.instanceId);
  const originalFireAt = (before!.timers ?? []).find((t) => (t.timerId as string) === "timer_l")!.fireAt;
  // Simulate a pre-change instance whose TimerState predates the provenance field.
  await sql`UPDATE instances SET body = jsonb_set(body, '{timers,0}', (body->'timers'->0) - 'provenance')
    WHERE instance_id = ${inst.instanceId}`;
  await migrateInstances(p as Instance["processId"], 1, 2, sql);
  const after = await loadInstance(inst.instanceId);
  const t = (after!.timers ?? []).find((x) => (x.timerId as string) === "timer_l")!;
  expect(t.fireAt).toBe(originalFireAt); // no provenance to compare against -> trusted, kept
});

test.skipIf(!DB)("6.9 a full batch of skipped instances does not stall the scan", async () => {
  const p = pid();
  const v1 = waitBody({ key: "a", fields: [f("x", "string")] });
  // Unmappable v2 (removes step_wait) so every instance is skipped and stays on v1.
  const v2: ProcessBody = {
    key: "a", label: "a", fields: [f("x", "string")],
    workflow: { initialStep: "step_a", steps: [
      { id: "step_a", key: "a", label: "A", type: "task", paths: [manualPath("path_ad", "step_done")] },
      { id: "step_done", key: "done", label: "Done", type: "task", terminal: true },
    ] },
  } as unknown as ProcessBody;
  await twoVersions(p, v1, v2, {} as MigrationSpec);
  // More than a page would be ideal but slow; a handful proves termination since a
  // bare LIMIT would loop forever on the first page of unchanged skips.
  const ids: string[] = [];
  for (let i = 0; i < 5; i++) ids.push((await mkInstance(p, 1)).instanceId);
  const res = await migrateInstances(p as Instance["processId"], 1, 2, sql); // must terminate
  expect(res.skipped.sort()).toEqual(ids.sort());
});

test.skipIf(!DB)("6.10 one unreadable instance is failed and the rest migrate", async () => {
  const p = pid();
  const b = waitBody({ key: "a", fields: [f("x", "string")] });
  await twoVersions(p, b, b, {} as MigrationSpec);
  const ok = await mkInstance(p, 1);
  const bad = await mkInstance(p, 1);
  // Corrupt the bad row's body so instance.parse fails under the lock (bad currentStepId).
  await sql`UPDATE instances SET body = body || ${{ currentStepId: 12345 }}::jsonb WHERE instance_id = ${bad.instanceId}`;
  const res = await migrateInstances(p as Instance["processId"], 1, 2, sql);
  expect(res.migrated).toEqual([ok.instanceId].sort());
  expect(res.failed).toEqual([bad.instanceId]);
  expect(await eventsOf(bad.instanceId)).toHaveLength(0); // no event for a failed instance
});

test.skipIf(!DB)("6.11 a second full invocation appends no history", async () => {
  const p = pid();
  const b = waitBody({ key: "a", fields: [f("x", "string")] });
  await twoVersions(p, b, b, {} as MigrationSpec);
  const inst = await mkInstance(p, 1);
  await migrateInstances(p as Instance["processId"], 1, 2, sql);
  const res2 = await migrateInstances(p as Instance["processId"], 1, 2, sql);
  expect(res2.migrated).toHaveLength(0); // already on v2, outside selection
  expect(await historyOf(inst.instanceId)).toHaveLength(1);
});

test.skipIf(!DB)("6.12 completed, cancelled and faulted instances keep their pin and appear in no category", async () => {
  const p = pid();
  const b = waitBody({ key: "a", fields: [f("x", "string")] });
  await twoVersions(p, b, b, {} as MigrationSpec);
  const running = await mkInstance(p, 1);
  const done = await mkInstance(p, 1);
  await sql`UPDATE instances SET body = body || ${{ status: "completed" }}::jsonb WHERE instance_id = ${done.instanceId}`;
  const res = await migrateInstances(p as Instance["processId"], 1, 2, sql);
  expect(res.migrated).toEqual([running.instanceId]);
  expect(res.skipped.concat(res.failed, res.conflicted)).toHaveLength(0);
  const stillDone = await loadInstance(done.instanceId);
  expect(stillDone!.version).toBe(1);
  expect(stillDone!.status).toBe("completed");
});

test.skipIf(!DB)("6.x migration without a registered plan is refused", async () => {
  const p = pid();
  await publishN(p, 2);
  await mkInstance(p, 1);
  await expectReject(migrateInstances(p as Instance["processId"], 1, 2, sql));
});

test.skipIf(!DB)("6.5 a migration advances the sequence, and a writer holding the stale seq loses", async () => {
  const p = pid();
  const b = waitBody({ key: "a", fields: [f("x", "string")] });
  await twoVersions(p, b, b, {} as MigrationSpec);
  const inst = await mkInstance(p, 1);
  const startSeq = inst.transitionSeq;
  const res = await migrateInstances(p as Instance["processId"], 1, 2, sql);
  expect(res.migrated).toEqual([inst.instanceId]);
  const after = await loadInstance(inst.instanceId);
  // The sequence advance IS the OCC token — removing it makes the commit itself lose.
  expect(after!.transitionSeq).toBe(startSeq + 1);
  const hist = await historyOf(inst.instanceId);
  expect(hist[0].transitionSeq).toBe(startSeq + 1);
  // A transition that read the pre-migration sequence now commits against no row: the
  // instance is no longer pinned to the body it observed, so exactly one winner stands.
  const stale = (await sql`UPDATE instances SET body = jsonb_set(body, '{status}', '"cancelled"'::jsonb)
    WHERE instance_id = ${inst.instanceId} AND transition_seq = ${startSeq} RETURNING instance_id`) as unknown[];
  expect(stale).toHaveLength(0);
});

test.skipIf(!DB)("6.3 a concurrent writeback is preserved because the remap reads the locked row", async () => {
  const p = pid();
  const b = waitBody({ key: "a", fields: [f("x", "string"), f("written", "string")] });
  await twoVersions(p, b, b, {} as MigrationSpec);
  const inst = await mkInstance(p, 1, { field_x: "hi" });
  let migP: Promise<unknown> | undefined;
  // Hold the row lock, start the migration (it blocks on its own FOR UPDATE), then
  // write a field. A payload computed from the batch scan would have been snapshotted
  // before this write and would erase it on the wholesale data patch; the locked
  // re-read sees it.
  await sql.begin(async (tx) => {
    await tx`SELECT 1 FROM instances WHERE instance_id = ${inst.instanceId} FOR UPDATE`;
    migP = migrateInstances(p as Instance["processId"], 1, 2, sql);
    await new Promise((r) => setTimeout(r, 150)); // let the migration reach its FOR UPDATE
    await tx`UPDATE instances SET body = jsonb_set(body, '{data,field_written}', (${["W"]}::jsonb) -> 0)
      WHERE instance_id = ${inst.instanceId}`;
  });
  await migP;
  const after = await loadInstance(inst.instanceId);
  expect(after!.version).toBe(2);
  expect(dataField(after, "field_written")).toBe("W"); // not lost
});

// ---- subprocess interaction (spawn suppression + child link repair) ----------

// Child + parent bodies mirroring subprocess.test.ts, so migration can be observed
// against a live parent/child pair.
const CHILD_PID = () => `proc_child_${n}` as Instance["processId"];
function childWaitBody(): ProcessBody {
  return {
    key: "child", label: "Child",
    contract: { outcomes: ["done"] },
    fields: [],
    workflow: { initialStep: "step_c_wait", steps: [
      { id: "step_c_wait", key: "c_wait", label: "Wait", type: "task", paths: [manualPath("path_c_done", "step_c_done")] },
      { id: "step_c_done", key: "c_done", label: "Done", type: "task", terminal: true, outcome: "done" },
    ] },
  } as unknown as ProcessBody;
}
// Parent whose subprocess step id is stable across v1/v2 (identity migration).
function parentSubBody(childPid: string, childVersion: number): ProcessBody {
  return {
    key: "parent", label: "Parent",
    fields: [f("marker", "string")],
    workflow: { initialStep: "step_p_entry", steps: [
      { id: "step_p_entry", key: "p_entry", label: "Entry", type: "task", paths: [autoPath("path_p_sub", "step_p_sub", 1)] },
      { id: "step_p_sub", key: "p_sub", label: "Sub", type: "subprocess",
        subprocess: { processId: childPid, versionBinding: "pinned", pinnedVersion: childVersion, inputMapping: {}, outputMapping: {} },
        paths: [autoPath("path_p_done", "step_p_done", 1, 'child.outcome == "done"')] },
      { id: "step_p_done", key: "p_done", label: "Done", type: "task", terminal: true },
    ] },
  } as unknown as ProcessBody;
}

// A parent parked at a subprocess step with a *running* child, under a guard the
// child's "done" outcome never matches — so a delivered return leaves the parent
// parked (subprocess.outcome-unmatched) rather than advancing it. v2 relocates the
// subprocess step via stepMap. `settle()` drives the child to terminal and drains
// its return, turning the child settled while the parent stays parked.
async function parkedParentRunningChild() {
  const cpid = CHILD_PID();
  const p = pid();
  const { registry } = engineRegistry();
  const cv = await publishBody(cpid, childWaitBody(), reg);
  const v1 = parentSubBody(cpid, cv.version);
  (v1.workflow.steps as any[])[1].paths[0].guard = { lang: "cel", src: 'child.outcome == "never"' };
  const v2raw = parentSubBody(cpid, cv.version);
  (v2raw.workflow.steps as any[])[1].id = "step_p_sub2";
  (v2raw.workflow.steps as any[])[0].paths[0].to = "step_p_sub2";
  (v2raw.workflow.steps as any[])[1].paths[0].id = "path_p_done2";
  (v2raw.workflow.steps as any[])[1].paths[0].guard = { lang: "cel", src: 'child.outcome == "never"' };
  await publishBody(p, v1, reg);
  await publishBody(p, v2raw, reg);
  await registerMigrationPlan(p as Instance["processId"], 1, 2, { stepMap: { step_p_sub: "step_p_sub2" } } as unknown as MigrationSpec);
  const parent = await startInstance((await createDefinitionStore(sql).resolveBody(p as Instance["processId"], 1))!, { processId: p as Instance["processId"], version: 1 }, actor);
  await drainOutbox(sql, registry); // spawn child, running at step_c_wait, linked at step_p_sub
  const childId = subprocessChildId(parent.instanceId, parent.transitionSeq, "step_p_sub");
  const settle = async () => {
    const childBody = (await createDefinitionStore(sql).resolveBody(cpid, cv.version))!;
    await executeManualTransition((await loadInstance(childId))!, "path_c_done", childBody, actor);
    await drainAll(registry);
  };
  return { p, parentId: parent.instanceId, childId, settle };
}

test.skipIf(!DB)("6.2 an identity migration of a parked parent spawns no second child", async () => {
  const cpid = CHILD_PID();
  const p = pid();
  const { registry } = engineRegistry();
  const cv = await publishBody(cpid, childWaitBody(), reg);
  const v1 = parentSubBody(cpid, cv.version);
  await publishV(p, v1, "1");
  await publishV(p, v1, "2"); // distinct label -> version 2, identical structure
  await registerMigrationPlan(p as Instance["processId"], 1, 2, {} as MigrationSpec);
  const parent = await startInstance((await createDefinitionStore(sql).resolveBody(p as Instance["processId"], 1))!, { processId: p as Instance["processId"], version: 1 }, actor);
  expect(parent.currentStepId as string).toBe("step_p_sub");
  await drainOutbox(sql, registry); // spawn the (one) child
  const childId = subprocessChildId(parent.instanceId, parent.transitionSeq, "step_p_sub");
  expect(await loadInstance(childId)).toBeDefined();
  // Identity migration: same step id -> suppressSpawn, so no second child.
  await migrateInstances(p as Instance["processId"], 1, 2, sql);
  await drainAll(registry);
  const kids = Number(((await sql`SELECT count(*) AS n FROM instances WHERE body->'parent'->>'instanceId' = ${parent.instanceId}`) as { n: number }[])[0].n);
  expect(kids).toBe(1);
});

test.skipIf(!DB)("subprocess: a running child blocks the parent's relocation (child-in-flight)", async () => {
  const { p, parentId, childId } = await parkedParentRunningChild();
  // Relocating off a subprocess step with a live child is deferred, not committed.
  const res = await migrateInstances(p as Instance["processId"], 1, 2, sql);
  expect(res.skipped).toEqual([parentId]);
  const skipEv = (await eventsOf(parentId)).find((e) => e.kind === "migration.skipped");
  expect(skipEv && skipEv.payload.reason).toBe("child-in-flight");
  // Parent keeps its pin and step; the child's link is untouched.
  const parentAfter = await loadInstance(parentId);
  expect(parentAfter!.version).toBe(1);
  expect(parentAfter!.currentStepId as string).toBe("step_p_sub");
  expect((await loadInstance(childId))!.parent?.stepId as string).toBe("step_p_sub");
});

test.skipIf(!DB)("subprocess: a settled child does not block the relocation and is not repointed", async () => {
  const { p, parentId, childId, settle } = await parkedParentRunningChild();
  await settle(); // child terminal + return drained; parent stayed parked (outcome unmatched)
  expect((await loadInstance(parentId))!.currentStepId as string).toBe("step_p_sub");
  const res = await migrateInstances(p as Instance["processId"], 1, 2, sql);
  expect(res.migrated).toEqual([parentId]);
  expect((await loadInstance(parentId))!.currentStepId as string).toBe("step_p_sub2");
  // A settled child's parent.stepId is inert, so migration leaves it as-is.
  expect((await loadInstance(childId))!.parent?.stepId as string).toBe("step_p_sub");
});

// =============================================================================
// Coverage follow-ups (verify pass): scenarios implemented but previously untested.
// =============================================================================

// --- entry/exit action gating -------------------------------------------------

test.skipIf(!DB)("an identity migration runs neither onEntry nor onExit actions", async () => {
  const p = pid();
  const b = waitBody({ key: "a", fields: [f("x", "string")], waitOnEntry: [action("action_entry")], waitOnExit: [action("action_exit")] });
  await twoVersions(p, b, b, {} as MigrationSpec);
  const inst = await mkInstance(p, 1);
  await migrateInstances(p as Instance["processId"], 1, 2, sql);
  const ids = await outboxActionIds(inst.instanceId);
  expect(ids).not.toContain("action_entry"); // identity -> onEntry suppressed
  expect(ids).not.toContain("action_exit"); // onExit never runs on a migration
});

test.skipIf(!DB)("a relocation runs the target step's onEntry but never the source onExit", async () => {
  const p = pid();
  const v1 = waitBody({ key: "a", fields: [f("x", "string")], waitOnExit: [action("action_exit")] });
  // v2 keeps step_wait but stepMap relocates onto step_relo, which declares onEntry.
  const v2: ProcessBody = {
    key: "a", label: "a", fields: [f("x", "string")],
    workflow: { initialStep: "step_wait", steps: [
      { id: "step_wait", key: "wait", label: "W", type: "task", paths: [manualPath("path_done", "step_done")] },
      { id: "step_relo", key: "relo", label: "R", type: "task", onEntry: [action("action_entry")], paths: [manualPath("path_rd", "step_done")] },
      { id: "step_done", key: "done", label: "D", type: "task", terminal: true },
    ] },
  } as unknown as ProcessBody;
  await twoVersions(p, v1, v2, { stepMap: { step_wait: "step_relo" } } as unknown as MigrationSpec);
  const inst = await mkInstance(p, 1);
  await migrateInstances(p as Instance["processId"], 1, 2, sql);
  const ids = await outboxActionIds(inst.instanceId);
  expect(ids).toContain("action_entry"); // relocation runs the target's onEntry
  expect(ids).not.toContain("action_exit"); // source onExit still never runs
  expect((await loadInstance(inst.instanceId))!.currentStepId as string).toBe("step_relo");
});

// --- concurrency: the `none` branch (conflicted is unreachable under the lock) -

test.skipIf(!DB)("an instance migrated out from under the lock is reported in no category", async () => {
  // The row lock makes migrateOne always win its own OCC commit, so `conflicted` is
  // defensive/unreachable; the real race outcome is that a loser reads the
  // already-migrated row and returns `none` (in no category).
  const p = pid();
  const b = waitBody({ key: "a", fields: [f("x", "string")] });
  await twoVersions(p, b, b, {} as MigrationSpec);
  const inst = await mkInstance(p, 1);
  let migP: Promise<MigrationResult> | undefined;
  await sql.begin(async (tx) => {
    await tx`SELECT 1 FROM instances WHERE instance_id = ${inst.instanceId} FOR UPDATE`;
    migP = migrateInstances(p as Instance["processId"], 1, 2, sql); // scans, then blocks on FOR UPDATE
    await new Promise((r) => setTimeout(r, 150));
    // Make the row ineligible while the migration is parked on the lock: version off
    // the source. definitionHash is left as v1's so the pin check passes and the
    // eligibility check (version) is what fires.
    await tx`UPDATE instances SET body = body || ${{ version: 2 }}::jsonb WHERE instance_id = ${inst.instanceId}`;
  });
  const res = await migP!;
  const all = [...res.migrated, ...res.skipped, ...res.failed, ...res.conflicted];
  expect(all).not.toContain(inst.instanceId);
});

// --- deadline reconciliation at migration -------------------------------------

test.skipIf(!DB)("a newly declared deadline arms against the target catalog over post-remap data", async () => {
  const p = pid();
  const v1 = waitBody({ key: "a", fields: [f("src", "string")] });
  // v2 renames src->due and its step declares a deadline reading `data.due`.
  const dl = { id: "timer_dl", key: "dl", deadline: cel("data.due"), onFire: { actions: [] } };
  const v2 = waitBody({ key: "a", fields: [f("due", "string")], waitTimers: [dl] });
  await twoVersions(p, v1, v2, { fieldMap: { field_src: "field_due" }, transforms: {} } as unknown as MigrationSpec);
  const inst = await mkInstance(p, 1, { field_src: "2027-06-01T00:00:00Z" });
  await migrateInstances(p as Instance["processId"], 1, 2, sql);
  const after = await loadInstance(inst.instanceId);
  const armed = (after!.timers ?? []).find((t) => (t.timerId as string) === "timer_dl");
  expect(armed).toBeDefined(); // armed over the post-remap `due`, evaluated on the target catalog
  expect(armed!.fireAt).toBe(new Date("2027-06-01T00:00:00Z").toISOString());
});

test.skipIf(!DB)("a deadline that raises at migration is dropped as timer.unarmed without failing", async () => {
  const p = pid();
  const v1 = waitBody({ key: "a", fields: [f("x", "string")] });
  // v2 declares a deadline reading a field the instance never wrote -> raises at arming.
  const dl = { id: "timer_dl", key: "dl", deadline: cel("data.missing"), onFire: { actions: [] } };
  const v2 = waitBody({ key: "a", fields: [f("x", "string"), f("missing", "string")], waitTimers: [dl] });
  await twoVersions(p, v1, v2, {} as MigrationSpec);
  const inst = await mkInstance(p, 1);
  await migrateInstances(p as Instance["processId"], 1, 2, sql);
  const after = await loadInstance(inst.instanceId);
  expect(after!.version).toBe(2); // migration committed regardless
  expect((after!.timers ?? []).some((t) => (t.timerId as string) === "timer_dl")).toBe(false);
  const unarmed = (await eventsOf(inst.instanceId)).find((e) => e.kind === "timer.unarmed");
  expect(unarmed).toBeDefined();
  expect(unarmed!.version).toBe(2); // the dropped timer is declared by the target
  expect(unarmed!.transitionSeq).toBe(inst.transitionSeq + 1); // the committed sequence
});

// --- data-remap edge cases ----------------------------------------------------

test.skipIf(!DB)("rename into an occupied field is deterministic and a transform reads the snapshot", async () => {
  const p = pid();
  const v1 = waitBody({ key: "a", fields: [f("a", "string"), f("b", "string")] });
  const v2 = waitBody({ key: "a", fields: [f("a", "string"), f("b", "string"), f("c", "string")] });
  await twoVersions(p, v1, v2, {
    fieldMap: { field_a: "field_b" }, // A -> B (B occupied, no mapping of its own)
    transforms: { field_c: cel("data.a") }, // reads the pre-rename snapshot's A
  } as unknown as MigrationSpec);
  const inst = await mkInstance(p, 1, { field_a: "A", field_b: "B" });
  await migrateInstances(p as Instance["processId"], 1, 2, sql);
  const after = await loadInstance(inst.instanceId);
  expect(dataField(after, "field_b")).toBe("A"); // rename overwrote B deterministically
  expect("field_a" in (after!.data as object)).toBe(false); // source vacated
  expect(dataField(after, "field_c")).toBe("A"); // transform saw the pre-rename value
});

test.skipIf(!DB)("a transform targeting a renamed field overrides the rename", async () => {
  const p = pid();
  const b = waitBody({ key: "a", fields: [f("a", "string"), f("b", "string")] });
  await twoVersions(p, b, b, {
    fieldMap: { field_a: "field_b" },
    transforms: { field_b: cel("'T'") },
  } as unknown as MigrationSpec);
  const inst = await mkInstance(p, 1, { field_a: "A", field_b: "B" });
  await migrateInstances(p as Instance["processId"], 1, 2, sql);
  expect(dataField(await loadInstance(inst.instanceId), "field_b")).toBe("T"); // transform overlays the rename
});

// --- status filter: faulted --------------------------------------------------

test.skipIf(!DB)("a faulted instance keeps its pin and is in no category", async () => {
  const p = pid();
  const b = waitBody({ key: "a", fields: [f("x", "string")] });
  await twoVersions(p, b, b, {} as MigrationSpec);
  const inst = await mkInstance(p, 1);
  await sql`UPDATE instances SET body = body || ${{ status: "faulted" }}::jsonb WHERE instance_id = ${inst.instanceId}`;
  const res = await migrateInstances(p as Instance["processId"], 1, 2, sql);
  expect([...res.migrated, ...res.skipped, ...res.failed, ...res.conflicted]).toHaveLength(0);
  const after = await loadInstance(inst.instanceId);
  expect(after!.version).toBe(1);
  expect(after!.status).toBe("faulted");
});

// --- mixed population ---------------------------------------------------------

test.skipIf(!DB)("one invocation migrates a mappable instance and skips an unmappable sibling", async () => {
  const p = pid();
  const v1: ProcessBody = {
    key: "a", label: "a", fields: [f("x", "string")],
    workflow: { initialStep: "step_wait", steps: [
      { id: "step_wait", key: "wait", label: "W", type: "task", paths: [manualPath("path_wm", "step_mid")] },
      { id: "step_mid", key: "mid", label: "M", type: "task", paths: [manualPath("path_md", "step_done")] },
      { id: "step_done", key: "done", label: "D", type: "task", terminal: true },
    ] },
  } as unknown as ProcessBody;
  // v2 removes step_wait (so an instance parked there is unmappable) but keeps step_mid.
  const v2: ProcessBody = {
    key: "a", label: "a", fields: [f("x", "string")],
    workflow: { initialStep: "step_mid", steps: [
      { id: "step_mid", key: "mid", label: "M", type: "task", paths: [manualPath("path_md", "step_done")] },
      { id: "step_done", key: "done", label: "D", type: "task", terminal: true },
    ] },
  } as unknown as ProcessBody;
  await twoVersions(p, v1, v2, {} as MigrationSpec); // reject-and-pin
  const stayA = await mkInstance(p, 1); // parked at step_wait (unmappable in v2)
  const moveB = await mkInstance(p, 1);
  const v1c = (await createDefinitionStore(sql).resolveBody(p as Instance["processId"], 1))!;
  await executeManualTransition(moveB, "path_wm", v1c, actor); // moveB now at step_mid (mappable)
  const res = await migrateInstances(p as Instance["processId"], 1, 2, sql);
  expect(res.migrated).toEqual([moveB.instanceId]);
  expect(res.skipped).toEqual([stayA.instanceId]);
});

// --- subprocess: relocation spawns; identity leaves links; terminal return wakes -

test.skipIf(!DB)("a relocation onto a subprocess step enqueues a fresh spawn once the source child has settled", async () => {
  const { p, parentId, settle } = await parkedParentRunningChild();
  await settle(); // no live child left to block the relocation
  const res = await migrateInstances(p as Instance["processId"], 1, 2, sql);
  expect(res.migrated).toEqual([parentId]);
  // stepChanged -> suppressSpawn false -> a spawn for the new subprocess step is enqueued.
  expect(await outboxActionIds(parentId)).toContain("action_spawn_step_p_sub2");
});

test.skipIf(!DB)("an identity migration leaves a child's parent link untouched", async () => {
  const cpid = CHILD_PID();
  const p = pid();
  const { registry } = engineRegistry();
  const cv = await publishBody(cpid, childWaitBody(), reg);
  const v1 = parentSubBody(cpid, cv.version);
  await publishV(p, v1, "1");
  await publishV(p, v1, "2");
  await registerMigrationPlan(p as Instance["processId"], 1, 2, {} as MigrationSpec); // no stepMap -> identity
  const parent = await startInstance((await createDefinitionStore(sql).resolveBody(p as Instance["processId"], 1))!, { processId: p as Instance["processId"], version: 1 }, actor);
  await drainOutbox(sql, registry);
  const childId = subprocessChildId(parent.instanceId, parent.transitionSeq, "step_p_sub");
  await migrateInstances(p as Instance["processId"], 1, 2, sql);
  expect((await loadInstance(childId))!.parent?.stepId as string).toBe("step_p_sub"); // unchanged
});

test.skipIf(!DB)("subprocess: a terminal child's undelivered return blocks the relocation; the unmigrated parent still completes on the source version", async () => {
  const cpid = CHILD_PID();
  const p = pid();
  const { registry } = engineRegistry();
  const cv = await publishBody(cpid, childWaitBody(), reg);
  const v1 = parentSubBody(cpid, cv.version); // matching guard: a delivered "done" completes the parent
  const v2raw = parentSubBody(cpid, cv.version);
  (v2raw.workflow.steps as any[])[1].id = "step_p_sub2";
  (v2raw.workflow.steps as any[])[0].paths[0].to = "step_p_sub2";
  (v2raw.workflow.steps as any[])[1].paths[0].id = "path_p_done2";
  await publishBody(p, v1, reg);
  await publishBody(p, v2raw, reg);
  await registerMigrationPlan(p as Instance["processId"], 1, 2, { stepMap: { step_p_sub: "step_p_sub2" } } as unknown as MigrationSpec);
  const parent = await startInstance((await createDefinitionStore(sql).resolveBody(p as Instance["processId"], 1))!, { processId: p as Instance["processId"], version: 1 }, actor);
  await drainOutbox(sql, registry); // spawn child, linked at step_p_sub
  const childId = subprocessChildId(parent.instanceId, parent.transitionSeq, "step_p_sub");
  // Drive the child to terminal via the real path so a genuine return row is enqueued,
  // pending (not yet delivered) — the terminal child stays live until its return drains.
  const childBody = (await createDefinitionStore(sql).resolveBody(cpid, cv.version))!;
  await executeManualTransition((await loadInstance(childId))!, "path_c_done", childBody, actor);
  // The undelivered return blocks the relocation.
  const res = await migrateInstances(p as Instance["processId"], 1, 2, sql);
  expect(res.skipped).toEqual([parent.instanceId]);
  const skipEv = (await eventsOf(parent.instanceId)).find((e) => e.kind === "migration.skipped");
  expect(skipEv && skipEv.payload.reason).toBe("child-in-flight");
  // Left on the source version, the return now drains and completes the parent normally.
  await drainAll(registry);
  const parentAfter = await loadInstance(parent.instanceId);
  expect(parentAfter!.version).toBe(1);
  expect(parentAfter!.currentStepId as string).toBe("step_p_done");
  expect(parentAfter!.status).toBe("completed");
});

test.skipIf(!DB)("subprocess: an instance skipped child-in-flight migrates on a later invocation once the child settles", async () => {
  const { p, parentId, settle } = await parkedParentRunningChild();
  const res1 = await migrateInstances(p as Instance["processId"], 1, 2, sql);
  expect(res1.skipped).toEqual([parentId]);
  await settle();
  const res2 = await migrateInstances(p as Instance["processId"], 1, 2, sql);
  expect(res2.migrated).toEqual([parentId]);
  expect((await loadInstance(parentId))!.currentStepId as string).toBe("step_p_sub2");
});

// --- persistence: publish carries no rule; schema init is idempotent ----------

test.skipIf(!DB)("publishing a new version creates no plan and migrates nothing", async () => {
  const p = pid();
  await publishV(p, waitBody({ key: "a", fields: [f("x", "string")] }), "1");
  const inst = await mkInstance(p, 1, { field_x: "v" });
  await publishV(p, waitBody({ key: "a", fields: [f("x", "string")] }), "2"); // publish v2
  expect(await resolveMigrationPlan(p as Instance["processId"], 1, 2)).toBeUndefined(); // no plan from publishing
  const after = await loadInstance(inst.instanceId);
  expect(after!.version).toBe(1); // instance untouched by the publish
  expect(after!.currentStepId as string).toBe("step_wait");
  expect(after!.transitionSeq).toBe(inst.transitionSeq);
});

test.skipIf(!DB)("schema init is idempotent and leaves the definitions relation unextended", async () => {
  await initSchema();
  await initSchema(); // second run must not throw
  const rel = (await sql`SELECT tablename FROM pg_tables WHERE tablename = 'migration_plans'`) as { tablename: string }[];
  expect(rel).toHaveLength(1);
  const idx = (await sql`SELECT indexname FROM pg_indexes WHERE indexname = 'instances_selection_idx'`) as { indexname: string }[];
  expect(idx).toHaveLength(1);
  // definitions gained no migration column.
  const cols = (await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'definitions'`) as { column_name: string }[];
  expect(cols.map((c) => c.column_name).sort()).toEqual(["body", "definition_hash", "process_id", "published_at", "status", "version"]);
});

// =============================================================================
// 7. Orphan-key inspection: findOrphanKeys.
// =============================================================================

test.skipIf(!DB)("7.1 reports an instance holding a data key absent from the catalog, group ids included", async () => {
  const p = pid();
  const group = { id: "field_grp", key: "grp", label: "grp", type: "group", fields: [f("a", "string")] } as unknown as Field;
  await publishV(p, waitBody({ key: "a", fields: [group] }), "1");
  // field_grp is the group container's own id — never a valid data key even though
  // it is "declared" — and field_ghost is declared nowhere.
  const inst = await mkInstance(p, 1, { field_a: "kept", field_ghost: "orphan", field_grp: "also orphan" });
  const scan = await findOrphanKeys(p as Instance["processId"], 1, sql);
  expect(scan.unreadable).toEqual([]);
  expect(scan.orphans).toHaveLength(1);
  expect(scan.orphans[0]!.instanceId).toBe(inst.instanceId);
  expect(scan.orphans[0]!.keys.sort()).toEqual(["field_ghost", "field_grp"]);
});

test.skipIf(!DB)("7.2 an instance whose data keys all match the catalog reports no orphans", async () => {
  const p = pid();
  await publishV(p, waitBody({ key: "a", fields: [f("a", "string")] }), "1");
  await mkInstance(p, 1, { field_a: "kept" });
  const scan = await findOrphanKeys(p as Instance["processId"], 1, sql);
  expect(scan.orphans).toEqual([]);
  expect(scan.unreadable).toEqual([]);
});

test.skipIf(!DB)("7.3 a terminal instance's orphan key is still reported", async () => {
  const p = pid();
  await publishV(p, waitBody({ key: "a", fields: [f("a", "string")], waitTerminal: true }), "1");
  const inst = await mkInstance(p, 1, { field_a: "kept", field_ghost: "orphan" });
  expect((await loadInstance(inst.instanceId))!.status).toBe("completed");
  const scan = await findOrphanKeys(p as Instance["processId"], 1, sql);
  expect(scan.orphans).toEqual([{ instanceId: inst.instanceId, keys: ["field_ghost"] }]);
});

test.skipIf(!DB)("7.4 an unreadable row is isolated and does not abort the scan", async () => {
  const p = pid();
  await publishV(p, waitBody({ key: "a", fields: [f("a", "string")] }), "1");
  const good = await mkInstance(p, 1, { field_a: "kept", field_ghost: "orphan" });
  // Same shape as the resolution/timers poison-row tests: a row whose body is
  // missing required Instance fields fails instanceSchema.parse, but still carries
  // processId/version so it is selected by the scan's WHERE clause.
  await sql`INSERT INTO instances (instance_id, transition_seq, body)
    VALUES (${"inst_poison"}, ${0}, ${{ processId: p, version: 1, status: "running" }})`;
  const scan = await findOrphanKeys(p as Instance["processId"], 1, sql);
  expect(scan.unreadable).toEqual(["inst_poison"]);
  expect(scan.orphans).toEqual([{ instanceId: good.instanceId, keys: ["field_ghost"] }]);
});

test.skipIf(!DB)("7.5 an unresolvable version throws and scans nothing", async () => {
  const p = pid();
  await publishV(p, waitBody({ key: "a", fields: [f("a", "string")] }), "1");
  await mkInstance(p, 1, { field_ghost: "orphan" });
  await expectReject(findOrphanKeys(p as Instance["processId"], 99, sql), /not published/);
});
