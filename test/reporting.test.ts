/**
 * src/engine/reporting.ts: the shared timeline primitive and the three views.
 * DB-backed — skips when DATABASE_URL is unset.
 *
 * History entries are inserted directly with controlled `at`/`transition_seq`
 * values rather than driven through real transitions: the numbers under test
 * are durations, and a real transition takes whatever wall-clock time it takes.
 * Same technique admin-queries.test.ts uses for outbox rows.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema, createInstance } from "../src/engine/store.js";
import { publishBody } from "../src/engine/definitions.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import { cycleTime, bottleneck, sla, type DateRange } from "../src/engine/reporting.js";
import { CANCEL_SINK_STEP_ID, type HistoryEntry, type Instance, type ProcessBody, type ProcessId, type StepId } from "../src/schema/definition.js";

const DB = !!process.env.DATABASE_URL;
const reg = createRegistry();
const dsReg = createDataSourceRegistry();

let n = 0;
const pid = () => `proc_rep_${++n}` as ProcessId;

const T0 = Date.parse("2026-07-10T00:00:00.000Z");
const MIN = 60_000;
const at = (mins: number) => new Date(T0 + mins * MIN).toISOString();
/** Wide enough to hold every seeded instance; narrowed explicitly where a test needs it. */
const RANGE: DateRange = { from: "2026-07-01T00:00:00.000Z", to: "2026-07-31T00:00:00.000Z" };

/**
 * a -> b -> c -> d. `step_b` carries a reminder timer (actions, no targetPath),
 * `step_c` an escalation timer (targetPath) — the two shapes
 * examples/expense-approval.json declares, and the two the engine records
 * differently. `step_a` carries none, so it must be absent from the SLA view.
 */
const body = (label: string): ProcessBody =>
  ({
    key: "rep_flow",
    label: { en: label },
    baseLocale: "en",
    fields: [],
    workflow: {
      initialStep: "step_a",
      steps: [
        { id: "step_a", key: "a", label: { en: "A" }, type: "task", paths: [{ id: "path_ab", key: "ab", label: "Ab", to: "step_b", trigger: "manual" }] },
        {
          id: "step_b", key: "b", label: { en: "B" }, type: "task",
          paths: [{ id: "path_bc", key: "bc", label: "Bc", to: "step_c", trigger: "manual" }],
          timers: [{ id: "timer_rem", duration: "P7D", onFire: { actions: [] } }],
        },
        {
          id: "step_c", key: "c", label: { en: "C" }, type: "task",
          paths: [
            { id: "path_cd", key: "cd", label: "Cd", to: "step_d", trigger: "manual" },
            { id: "path_esc", key: "esc", label: "Esc", to: "step_d", trigger: "manual" },
          ],
          timers: [{ id: "timer_esc", duration: "P14D", onFire: { targetPath: "path_esc" } }],
        },
        { id: "step_d", key: "d", label: { en: "D" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

beforeAll(async () => { if (DB) await initSchema(); });
beforeEach(async () => {
  if (DB) await sql`TRUNCATE outbox, instances, history_entries, instance_events, definitions, migration_plans`;
});

/** Creates an instance, then forces its startedAt/status/currentStepId to the values a test needs. */
async function seed(opts: {
  processId: ProcessId;
  version: number;
  body: ProcessBody;
  startedAt: string;
  status?: Instance["status"];
  currentStepId?: StepId;
}): Promise<Instance> {
  const inst = await createInstance(opts.body, { processId: opts.processId, version: opts.version }, sql);
  const patch: Record<string, unknown> = { startedAt: opts.startedAt, currentStepEnteredAt: opts.startedAt };
  if (opts.status) patch.status = opts.status;
  if (opts.currentStepId) patch.currentStepId = opts.currentStepId;
  await sql`UPDATE instances SET body = body || ${patch}::jsonb WHERE instance_id = ${inst.instanceId}`;
  return { ...inst, ...patch } as Instance;
}

let h = 0;
async function entry(opts: {
  instanceId: string;
  seq: number;
  version: number;
  toStepId: string;
  fromStepId: string | null;
  at: string;
  cause: HistoryEntry["cause"];
  pathId?: string | null;
}): Promise<void> {
  const row = {
    id: `hist_${String(++h).padStart(8, "0")}-0000-4000-8000-000000000000`,
    instanceId: opts.instanceId,
    transitionSeq: opts.seq,
    version: opts.version,
    pathId: opts.pathId ?? null,
    fromStepId: opts.fromStepId,
    toStepId: opts.toStepId,
    cause: opts.cause,
    at: opts.at,
  };
  await sql`INSERT INTO history_entries (id, instance_id, transition_seq, entry)
    VALUES (${row.id}, ${opts.instanceId}, ${opts.seq}, ${row}::jsonb)`;
}

let e = 0;
async function firedEvent(instanceId: string, seq: number, version: number, timerId: string, whenIso: string): Promise<void> {
  const ev = {
    id: `evt_${String(++e).padStart(8, "0")}-0000-4000-8000-000000000000`,
    instanceId, transitionSeq: seq, version,
    kind: "timer.fired", payload: { timerId }, at: whenIso,
  };
  await sql`INSERT INTO instance_events (id, instance_id, transition_seq, kind, event)
    VALUES (${ev.id}, ${instanceId}, ${seq}, 'timer.fired', ${ev}::jsonb)`;
}

/** a(10m) -> b(30m) -> c(10m) -> d. Total 50m. Ends `completed` unless told otherwise. */
async function runThrough(P: ProcessId, v: number, b: ProcessBody, startMin = 0, status: Instance["status"] = "completed") {
  const inst = await seed({ processId: P, version: v, body: b, startedAt: at(startMin), status, currentStepId: "step_d" as StepId });
  await entry({ instanceId: inst.instanceId, seq: 1, version: v, fromStepId: "step_a", toStepId: "step_b", at: at(startMin + 10), cause: "user", pathId: "path_ab" });
  await entry({ instanceId: inst.instanceId, seq: 2, version: v, fromStepId: "step_b", toStepId: "step_c", at: at(startMin + 40), cause: "user", pathId: "path_bc" });
  await entry({ instanceId: inst.instanceId, seq: 3, version: v, fromStepId: "step_c", toStepId: "step_d", at: at(startMin + 50), cause: "user", pathId: "path_cd" });
  return inst;
}

async function publish(P: ProcessId, label: string) {
  const b = body(label);
  const v = await publishBody(P, b, reg, dsReg);
  return { body: b, version: v.version };
}

// ---------------------------------------------------------------- primitive

test.skipIf(!DB)("a completed instance yields one traversal per step it left and none for the terminal step", async () => {
  const P = pid();
  const { body: b, version } = await publish(P, "v1");
  await runThrough(P, version, b);

  const view = (await bottleneck(P, RANGE))!;
  const byStep = new Map(view.ranking.map((r) => [r.stepId, r]));
  expect(byStep.get("step_a" as StepId)!.medianMs).toBe(10 * MIN);
  expect(byStep.get("step_b" as StepId)!.medianMs).toBe(30 * MIN);
  expect(byStep.get("step_c" as StepId)!.medianMs).toBe(10 * MIN);
  expect(byStep.has("step_d" as StepId)).toBe(false);
});

test.skipIf(!DB)("a running instance contributes no traversal for its current step", async () => {
  const P = pid();
  const { body: b, version } = await publish(P, "v1");
  const inst = await seed({ processId: P, version, body: b, startedAt: at(0), status: "running", currentStepId: "step_b" as StepId });
  await entry({ instanceId: inst.instanceId, seq: 1, version, fromStepId: "step_a", toStepId: "step_b", at: at(10), cause: "user", pathId: "path_ab" });

  const view = (await bottleneck(P, RANGE))!;
  expect(view.ranking.map((r) => r.stepId)).toEqual(["step_a" as StepId]);
  expect(view.ranking[0]!.medianMs).toBe(10 * MIN);
});

test.skipIf(!DB)("a cancelled instance contributes the step it occupied at cancellation, and the sink contributes none", async () => {
  const P = pid();
  const { body: b, version } = await publish(P, "v1");
  const inst = await seed({ processId: P, version, body: b, startedAt: at(0), status: "cancelled", currentStepId: CANCEL_SINK_STEP_ID });
  await entry({ instanceId: inst.instanceId, seq: 1, version, fromStepId: "step_a", toStepId: "step_b", at: at(10), cause: "user", pathId: "path_ab" });
  await entry({ instanceId: inst.instanceId, seq: 2, version, fromStepId: "step_b", toStepId: CANCEL_SINK_STEP_ID, at: at(25), cause: "cancel", pathId: null });

  const view = (await bottleneck(P, RANGE))!;
  const byStep = new Map(view.ranking.map((r) => [r.stepId, r]));
  expect(byStep.get("step_a" as StepId)!.medianMs).toBe(10 * MIN);
  // The stay in step_b ends at the cancellation instant, and counts.
  expect(byStep.get("step_b" as StepId)!.medianMs).toBe(15 * MIN);
  expect(byStep.has(CANCEL_SINK_STEP_ID)).toBe(false);
});

test.skipIf(!DB)("the same step id aggregates across two published versions", async () => {
  const P = pid();
  const v1 = await publish(P, "v1");
  const v2 = await publish(P, "v2");
  expect(v2.version).toBe(v1.version + 1);
  await runThrough(P, v1.version, v1.body, 0);
  await runThrough(P, v2.version, v2.body, 100);

  const view = (await bottleneck(P, RANGE))!;
  const stepB = view.ranking.find((r) => r.stepId === ("step_b" as StepId))!;
  expect(stepB.traversals).toBe(2);
});

test.skipIf(!DB)("an instance that revisits a step yields two traversals", async () => {
  const P = pid();
  const { body: b, version } = await publish(P, "v1");
  const inst = await seed({ processId: P, version, body: b, startedAt: at(0), status: "running", currentStepId: "step_c" as StepId });
  await entry({ instanceId: inst.instanceId, seq: 1, version, fromStepId: "step_a", toStepId: "step_b", at: at(10), cause: "user", pathId: "path_ab" });
  await entry({ instanceId: inst.instanceId, seq: 2, version, fromStepId: "step_b", toStepId: "step_a", at: at(20), cause: "user", pathId: "path_bc" });
  await entry({ instanceId: inst.instanceId, seq: 3, version, fromStepId: "step_a", toStepId: "step_b", at: at(50), cause: "user", pathId: "path_ab" });
  await entry({ instanceId: inst.instanceId, seq: 4, version, fromStepId: "step_b", toStepId: "step_c", at: at(60), cause: "user", pathId: "path_bc" });

  const view = (await bottleneck(P, RANGE))!;
  const stepA = view.ranking.find((r) => r.stepId === ("step_a" as StepId))!;
  expect(stepA.traversals).toBe(2);
  // 10m then 30m: nearest-rank p50 over [10, 30] is 10.
  expect(stepA.medianMs).toBe(10 * MIN);
});

// ---------------------------------------------------------------- migration

test.skipIf(!DB)("a migration onto the same step does not split the stay", async () => {
  const P = pid();
  const v1 = await publish(P, "v1");
  const v2 = await publish(P, "v2");
  const inst = await seed({ processId: P, version: v2.version, body: v2.body, startedAt: at(0), status: "running", currentStepId: "step_c" as StepId });
  await entry({ instanceId: inst.instanceId, seq: 1, version: v1.version, fromStepId: "step_a", toStepId: "step_b", at: at(10), cause: "user", pathId: "path_ab" });
  // Migrated in place while parked in step_b: planStepEntry writes this entry.
  await entry({ instanceId: inst.instanceId, seq: 2, version: v2.version, fromStepId: "step_b", toStepId: "step_b", at: at(20), cause: "migration", pathId: null });
  await entry({ instanceId: inst.instanceId, seq: 3, version: v2.version, fromStepId: "step_b", toStepId: "step_c", at: at(40), cause: "user", pathId: "path_bc" });

  const view = (await bottleneck(P, RANGE))!;
  const stepB = view.ranking.find((r) => r.stepId === ("step_b" as StepId))!;
  expect(stepB.traversals).toBe(1);
  expect(stepB.medianMs).toBe(30 * MIN);
});

test.skipIf(!DB)("a migration onto a different step closes the original step's stay", async () => {
  const P = pid();
  const v1 = await publish(P, "v1");
  const v2 = await publish(P, "v2");
  const inst = await seed({ processId: P, version: v2.version, body: v2.body, startedAt: at(0), status: "running", currentStepId: "step_c" as StepId });
  await entry({ instanceId: inst.instanceId, seq: 1, version: v1.version, fromStepId: "step_a", toStepId: "step_b", at: at(10), cause: "user", pathId: "path_ab" });
  await entry({ instanceId: inst.instanceId, seq: 2, version: v2.version, fromStepId: "step_b", toStepId: "step_c", at: at(25), cause: "migration", pathId: null });

  const view = (await bottleneck(P, RANGE))!;
  const stepB = view.ranking.find((r) => r.stepId === ("step_b" as StepId))!;
  expect(stepB.traversals).toBe(1);
  expect(stepB.medianMs).toBe(15 * MIN);
});

test.skipIf(!DB)("a self-loop transition still yields two traversals", async () => {
  const P = pid();
  const { body: b, version } = await publish(P, "v1");
  const inst = await seed({ processId: P, version, body: b, startedAt: at(0), status: "running", currentStepId: "step_b" as StepId });
  // Same target as source, cause `user` — a real re-entry, not a relocation.
  await entry({ instanceId: inst.instanceId, seq: 1, version, fromStepId: "step_a", toStepId: "step_a", at: at(10), cause: "user", pathId: "path_ab" });
  await entry({ instanceId: inst.instanceId, seq: 2, version, fromStepId: "step_a", toStepId: "step_b", at: at(30), cause: "user", pathId: "path_ab" });

  const view = (await bottleneck(P, RANGE))!;
  const stepA = view.ranking.find((r) => r.stepId === ("step_a" as StepId))!;
  expect(stepA.traversals).toBe(2);
});

// --------------------------------------------------------------- cycle time

test.skipIf(!DB)("percentiles cover completed instances only", async () => {
  const P = pid();
  const { body: b, version } = await publish(P, "v1");
  await runThrough(P, version, b, 0, "completed");
  await runThrough(P, version, b, 100, "cancelled");
  await runThrough(P, version, b, 200, "faulted");
  await runThrough(P, version, b, 300, "running");

  const view = (await cycleTime(P, RANGE))!;
  expect(view.sampleSize).toBe(1);
  expect(view.p50Ms).toBe(50 * MIN);
});

test.skipIf(!DB)("an odd-sized known distribution yields the expected p50", async () => {
  const P = pid();
  const { body: b, version } = await publish(P, "v1");
  // Totals of 20m, 50m and 90m — median 50m.
  for (const [start, total] of [[0, 20], [100, 50], [200, 90]] as const) {
    const inst = await seed({ processId: P, version, body: b, startedAt: at(start), status: "completed", currentStepId: "step_d" as StepId });
    await entry({ instanceId: inst.instanceId, seq: 1, version, fromStepId: "step_a", toStepId: "step_d", at: at(start + total), cause: "user", pathId: "path_ab" });
  }
  const view = (await cycleTime(P, RANGE))!;
  expect(view.sampleSize).toBe(3);
  expect(view.p50Ms).toBe(50 * MIN);
  expect(view.p90Ms).toBe(90 * MIN);
});

test.skipIf(!DB)("per-step rows follow the latest version's workflow order", async () => {
  const P = pid();
  const { body: b, version } = await publish(P, "v1");
  await runThrough(P, version, b);
  const view = (await cycleTime(P, RANGE))!;
  expect(view.perStep.map((r) => r.stepId)).toEqual(["step_a", "step_b", "step_c"] as StepId[]);
  expect(view.perStep.find((r) => r.stepId === ("step_b" as StepId))!.averageMs).toBe(30 * MIN);
});

test.skipIf(!DB)("no completed instance in range returns an empty result, not an error", async () => {
  const P = pid();
  const { body: b, version } = await publish(P, "v1");
  await runThrough(P, version, b, 0, "running");
  const view = (await cycleTime(P, RANGE))!;
  expect(view.sampleSize).toBe(0);
  expect(view.p50Ms).toBeNull();
});

test.skipIf(!DB)("an instance created onto a terminal step contributes no zero to any percentile", async () => {
  const P = pid();
  const { body: b, version } = await publish(P, "v1");
  // `completed` at creation with no HistoryEntry at all.
  await seed({ processId: P, version, body: b, startedAt: at(0), status: "completed", currentStepId: "step_d" as StepId });
  await runThrough(P, version, b, 100, "completed");

  const view = (await cycleTime(P, RANGE))!;
  expect(view.sampleSize).toBe(1);
  expect(view.p50Ms).toBe(50 * MIN);
});

// --------------------------------------------------------------- bottleneck

test.skipIf(!DB)("steps rank longest-median first", async () => {
  const P = pid();
  const { body: b, version } = await publish(P, "v1");
  await runThrough(P, version, b);
  const view = (await bottleneck(P, RANGE))!;
  expect(view.ranking.map((r) => r.stepId)).toEqual(["step_b", "step_a", "step_c"] as StepId[]);
});

test.skipIf(!DB)("the work-in-progress count ignores the date range and counts running instances only", async () => {
  const P = pid();
  const { body: b, version } = await publish(P, "v1");
  // Started well before the requested window, still parked in step_b.
  await seed({ processId: P, version, body: b, startedAt: "2026-01-01T00:00:00.000Z", status: "running", currentStepId: "step_b" as StepId });
  await seed({ processId: P, version, body: b, startedAt: at(0), status: "completed", currentStepId: "step_b" as StepId });
  await seed({ processId: P, version, body: b, startedAt: at(0), status: "cancelled", currentStepId: "step_b" as StepId });

  const view = (await bottleneck(P, RANGE))!;
  const wip = new Map(view.workInProgress.map((r) => [r.stepId, r.running]));
  expect(wip.get("step_b" as StepId)).toBe(1);
  // Out-of-range start contributes no traversal to the ranking.
  expect(view.ranking).toEqual([]);
});

// ---------------------------------------------------------------------- SLA

test.skipIf(!DB)("a reminder firing marks its traversal breached", async () => {
  const P = pid();
  const { body: b, version } = await publish(P, "v1");
  const inst = await runThrough(P, version, b);
  // step_b was entered by seq 1, so the reminder fires under seq 1.
  await firedEvent(inst.instanceId, 1, version, "timer_rem", at(25));

  const view = (await sla(P, RANGE))!;
  const stepB = view.steps.find((r) => r.stepId === ("step_b" as StepId))!;
  expect(stepB.breached).toBe(1);
  expect(stepB.traversals).toBe(1);
  expect(stepB.breachRate).toBe(1);
});

test.skipIf(!DB)("an escalation firing marks its traversal breached, though it records no event", async () => {
  const P = pid();
  const { body: b, version } = await publish(P, "v1");
  const inst = await seed({ processId: P, version, body: b, startedAt: at(0), status: "completed", currentStepId: "step_d" as StepId });
  await entry({ instanceId: inst.instanceId, seq: 1, version, fromStepId: "step_a", toStepId: "step_b", at: at(10), cause: "user", pathId: "path_ab" });
  await entry({ instanceId: inst.instanceId, seq: 2, version, fromStepId: "step_b", toStepId: "step_c", at: at(20), cause: "user", pathId: "path_bc" });
  // The transition timer on step_c fires: cause `timer`, pathId = its targetPath.
  await entry({ instanceId: inst.instanceId, seq: 3, version, fromStepId: "step_c", toStepId: "step_d", at: at(60), cause: "timer", pathId: "path_esc" });

  const rows = (await sql`SELECT count(*)::int AS n FROM instance_events WHERE kind = 'timer.fired'`) as { n: number }[];
  expect(rows[0]!.n).toBe(0);

  const view = (await sla(P, RANGE))!;
  const stepC = view.steps.find((r) => r.stepId === ("step_c" as StepId))!;
  expect(stepC.breached).toBe(1);
  expect(stepC.breachRate).toBe(1);
});

test.skipIf(!DB)("a step whose only timer is an escalation reports a real rate, not zero or absence", async () => {
  const P = pid();
  const { body: b, version } = await publish(P, "v1");
  // One traversal of step_c escalates, one does not.
  const escalated = await seed({ processId: P, version, body: b, startedAt: at(0), status: "completed", currentStepId: "step_d" as StepId });
  await entry({ instanceId: escalated.instanceId, seq: 1, version, fromStepId: "step_a", toStepId: "step_c", at: at(10), cause: "user", pathId: "path_ab" });
  await entry({ instanceId: escalated.instanceId, seq: 2, version, fromStepId: "step_c", toStepId: "step_d", at: at(60), cause: "timer", pathId: "path_esc" });
  const normal = await seed({ processId: P, version, body: b, startedAt: at(100), status: "completed", currentStepId: "step_d" as StepId });
  await entry({ instanceId: normal.instanceId, seq: 1, version, fromStepId: "step_a", toStepId: "step_c", at: at(110), cause: "user", pathId: "path_ab" });
  await entry({ instanceId: normal.instanceId, seq: 2, version, fromStepId: "step_c", toStepId: "step_d", at: at(115), cause: "user", pathId: "path_cd" });

  const view = (await sla(P, RANGE))!;
  const stepC = view.steps.find((r) => r.stepId === ("step_c" as StepId))!;
  expect(stepC.traversals).toBe(2);
  expect(stepC.breached).toBe(1);
  expect(stepC.breachRate).toBe(0.5);
});

test.skipIf(!DB)("a step declaring no timer is absent from the SLA view entirely", async () => {
  const P = pid();
  const { body: b, version } = await publish(P, "v1");
  await runThrough(P, version, b);
  const view = (await sla(P, RANGE))!;
  expect(view.steps.map((r) => r.stepId).sort()).toEqual(["step_b", "step_c"] as StepId[]);
});

test.skipIf(!DB)("a traversal with no firing counts toward the denominator only", async () => {
  const P = pid();
  const { body: b, version } = await publish(P, "v1");
  await runThrough(P, version, b);
  const view = (await sla(P, RANGE))!;
  const stepB = view.steps.find((r) => r.stepId === ("step_b" as StepId))!;
  expect(stepB.traversals).toBe(1);
  expect(stepB.breached).toBe(0);
  expect(stepB.breachRate).toBe(0);
});

test.skipIf(!DB)("two timers firing in one traversal count as one breach", async () => {
  const P = pid();
  const { body: b, version } = await publish(P, "v1");
  const inst = await seed({ processId: P, version, body: b, startedAt: at(0), status: "completed", currentStepId: "step_d" as StepId });
  await entry({ instanceId: inst.instanceId, seq: 1, version, fromStepId: "step_a", toStepId: "step_c", at: at(10), cause: "user", pathId: "path_ab" });
  await entry({ instanceId: inst.instanceId, seq: 2, version, fromStepId: "step_c", toStepId: "step_d", at: at(60), cause: "timer", pathId: "path_esc" });
  // A reminder on the same step, same visit, on top of the escalation.
  await sql`UPDATE definitions SET body = jsonb_set(body, '{workflow,steps,2,timers}',
    ${[{ id: "timer_esc", duration: "P14D", onFire: { targetPath: "path_esc" } }, { id: "timer_c_rem", duration: "P1D", onFire: { actions: [] } }]}::jsonb)
    WHERE process_id = ${P} AND version = ${version}`;
  await firedEvent(inst.instanceId, 1, version, "timer_c_rem", at(30));

  const view = (await sla(P, RANGE))!;
  const stepC = view.steps.find((r) => r.stepId === ("step_c" as StepId))!;
  expect(stepC.traversals).toBe(1);
  expect(stepC.breached).toBe(1);
});

test.skipIf(!DB)("a firing is attributed to the visit it occurred in", async () => {
  const P = pid();
  const { body: b, version } = await publish(P, "v1");
  const inst = await seed({ processId: P, version, body: b, startedAt: at(0), status: "completed", currentStepId: "step_d" as StepId });
  await entry({ instanceId: inst.instanceId, seq: 1, version, fromStepId: "step_a", toStepId: "step_b", at: at(10), cause: "user", pathId: "path_ab" });
  await entry({ instanceId: inst.instanceId, seq: 2, version, fromStepId: "step_b", toStepId: "step_a", at: at(20), cause: "user", pathId: "path_bc" });
  await entry({ instanceId: inst.instanceId, seq: 3, version, fromStepId: "step_a", toStepId: "step_b", at: at(30), cause: "user", pathId: "path_ab" });
  await entry({ instanceId: inst.instanceId, seq: 4, version, fromStepId: "step_b", toStepId: "step_d", at: at(90), cause: "user", pathId: "path_bc" });
  // Fires during the SECOND visit only (entered by seq 3).
  await firedEvent(inst.instanceId, 3, version, "timer_rem", at(60));

  const view = (await sla(P, RANGE))!;
  const stepB = view.steps.find((r) => r.stepId === ("step_b" as StepId))!;
  expect(stepB.traversals).toBe(2);
  expect(stepB.breached).toBe(1);
});

// --------------------------------------------------------------- date range

test.skipIf(!DB)("an instance started before the range contributes to none of the three views", async () => {
  const P = pid();
  const { body: b, version } = await publish(P, "v1");
  const inst = await seed({ processId: P, version, body: b, startedAt: "2026-01-01T00:00:00.000Z", status: "completed", currentStepId: "step_d" as StepId });
  await entry({ instanceId: inst.instanceId, seq: 1, version, fromStepId: "step_a", toStepId: "step_b", at: "2026-01-01T00:10:00.000Z", cause: "user", pathId: "path_ab" });
  await firedEvent(inst.instanceId, 1, version, "timer_rem", "2026-01-01T00:05:00.000Z");

  expect((await cycleTime(P, RANGE))!.sampleSize).toBe(0);
  expect((await bottleneck(P, RANGE))!.ranking).toEqual([]);
  expect((await sla(P, RANGE))!.steps).toEqual([]);
});

test.skipIf(!DB)("an instance started inside the range but still running is in range, per each view's own status rule", async () => {
  const P = pid();
  const { body: b, version } = await publish(P, "v1");
  const inst = await seed({ processId: P, version, body: b, startedAt: at(0), status: "running", currentStepId: "step_c" as StepId });
  await entry({ instanceId: inst.instanceId, seq: 1, version, fromStepId: "step_a", toStepId: "step_b", at: at(10), cause: "user", pathId: "path_ab" });
  await entry({ instanceId: inst.instanceId, seq: 2, version, fromStepId: "step_b", toStepId: "step_c", at: at(40), cause: "user", pathId: "path_bc" });
  await firedEvent(inst.instanceId, 1, version, "timer_rem", at(25));

  // Cycle-time: in range, but `running` contributes to no percentile.
  expect((await cycleTime(P, RANGE))!.sampleSize).toBe(0);
  // Bottleneck: in range and counted, since a step's speed does not wait for the instance to finish.
  expect((await bottleneck(P, RANGE))!.ranking.find((r) => r.stepId === ("step_b" as StepId))!.medianMs).toBe(30 * MIN);
  // SLA: in range and counted — the traversal of step_b closed, and its reminder fired.
  expect((await sla(P, RANGE))!.steps.find((r) => r.stepId === ("step_b" as StepId))!.breached).toBe(1);
});

test.skipIf(!DB)("a repeated request reflects a state change immediately, with no cached result", async () => {
  const P = pid();
  const { body: b, version } = await publish(P, "v1");
  const inst = await seed({ processId: P, version, body: b, startedAt: at(0), status: "running", currentStepId: "step_b" as StepId });
  await entry({ instanceId: inst.instanceId, seq: 1, version, fromStepId: "step_a", toStepId: "step_b", at: at(10), cause: "user", pathId: "path_ab" });
  expect((await bottleneck(P, RANGE))!.ranking).toHaveLength(1);

  // The instance moves on between two otherwise identical calls.
  await entry({ instanceId: inst.instanceId, seq: 2, version, fromStepId: "step_b", toStepId: "step_c", at: at(40), cause: "user", pathId: "path_bc" });
  await sql`UPDATE instances SET body = body || ${{ currentStepId: "step_c" }}::jsonb WHERE instance_id = ${inst.instanceId}`;

  const after = (await bottleneck(P, RANGE))!;
  expect(after.ranking).toHaveLength(2);
  expect(after.ranking.find((r) => r.stepId === ("step_b" as StepId))!.medianMs).toBe(30 * MIN);
});

test.skipIf(!DB)("the SLA view accepts no caller-supplied threshold", async () => {
  const P = pid();
  const { body: b, version } = await publish(P, "v1");
  await runThrough(P, version, b);
  const base = (await sla(P, RANGE))!;
  // A threshold passed alongside the range changes nothing: the signature takes none,
  // and the rate comes from the step's own declared timers.
  const withExtra = (await sla(P, { ...RANGE, thresholdMs: 1 } as unknown as DateRange))!;
  expect(withExtra.steps).toEqual(base.steps);
});

test.skipIf(!DB)("a redacted instance contributes unchanged", async () => {
  const P = pid();
  const { body: b, version } = await publish(P, "v1");
  const inst = await runThrough(P, version, b);
  // Redaction clears body.data and stamps redactedAt; history and events survive.
  await sql`UPDATE instances SET body = body || ${{ data: {}, redactedAt: at(999) }}::jsonb, redacted_at = ${at(999)}
    WHERE instance_id = ${inst.instanceId}`;

  const view = (await cycleTime(P, RANGE))!;
  expect(view.sampleSize).toBe(1);
  expect(view.p50Ms).toBe(50 * MIN);
});

test.skipIf(!DB)("an unknown process id resolves to null", async () => {
  expect(await cycleTime("proc_missing" as ProcessId, RANGE)).toBeNull();
  expect(await bottleneck("proc_missing" as ProcessId, RANGE)).toBeNull();
  expect(await sla("proc_missing" as ProcessId, RANGE)).toBeNull();
});
