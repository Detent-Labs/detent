/**
 * Process-owner reporting: cycle time, per-step bottlenecks and SLA adherence
 * for ONE process over a date range. Read-only — nothing here writes.
 *
 * Row selection runs in SQL, aggregation in TypeScript. A SQL window function
 * over `history_entries` cannot see the initial step (creation writes no
 * HistoryEntry — see store.ts::createInstance), so the walk would still need a
 * per-version lookup grafted on in application code. `admin-queries.ts` sets
 * the same precedent: SQL aggregation where the predicate is flat, application
 * code where the shape is nested.
 *
 * Every number is computed fresh per call. No cache survives the request, no
 * rollup table, no background job.
 */

import type { SQL } from "bun";
import { sql } from "./store.js";
import { createDefinitionStore } from "./definitions.js";
import {
  CANCEL_SINK_STEP_ID,
  instance as instanceSchema,
  historyEntry as historyEntrySchema,
  type HistoryEntry,
  type Instance,
  type LocalizedText,
  type ProcessBody,
  type ProcessId,
  type StepId,
} from "../schema/definition.js";

/** Inclusive bounds on `instances.startedAt`, both required — the caller always sends them. */
export type DateRange = { from: string; to: string };

/** One completed stay in one step: the instance entered at `enteringSeq` and left. */
type Traversal = {
  stepId: StepId;
  ms: number;
  /** `transitionSeq` in force while the instance sat here — 0 for the initial step. */
  enteringSeq: number;
  /** The version in force during the stay, for resolving this step's timers. */
  version: number;
  /** How the stay ended. A `timer` cause names the transition timer that fired. */
  closedByCause: HistoryEntry["cause"];
  closedByPathId: string | null;
  instanceStatus: Instance["status"];
};

export type StepLabel = { stepId: StepId; key: string; label: LocalizedText };

export type CycleTimeView = {
  sampleSize: number;
  p50Ms: number | null;
  p90Ms: number | null;
  p99Ms: number | null;
  perStep: (StepLabel & { averageMs: number; traversals: number })[];
  skippedInstances: number;
};

export type BottleneckView = {
  ranking: (StepLabel & { medianMs: number; traversals: number })[];
  workInProgress: (StepLabel & { running: number })[];
  skippedInstances: number;
};

export type SlaView = {
  steps: (StepLabel & { breached: number; traversals: number; breachRate: number })[];
  skippedInstances: number;
};

/**
 * Nearest rank, not interpolation: the returned value is a duration some
 * instance actually took, which is what a reader of "p90" expects. Linear
 * interpolation returns a number no instance exhibited, and over the small
 * samples a young process produces that difference is visible.
 */
function percentile(sortedAsc: number[], p: number): number | null {
  if (sortedAsc.length === 0) return null;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.ceil(p * sortedAsc.length) - 1));
  return sortedAsc[idx]!;
}

function parseRow<T>(raw: unknown, parse: (v: unknown) => T): T {
  return parse(typeof raw === "string" ? JSON.parse(raw) : raw);
}

/**
 * The in-range instances of one process. `body->>'processId'` leads
 * `instances_selection_idx`, so the process predicate is indexed; the range
 * predicate then filters within that one process.
 *
 * ponytail: `(body->>'startedAt')::timestamptz` is unindexed. The leading
 * process predicate bounds the scan and the caller always sends a range, so
 * this holds until one process accumulates enough instances to measure. The
 * fix is one line — `CREATE INDEX instances_started_idx ON instances
 * ((body->>'startedAt'))` — plus keyset paging over this scan in the shape
 * migrateInstances and the retention sweep already use.
 */
async function selectInRange(processId: ProcessId, range: DateRange, db: SQL): Promise<Instance[]> {
  const rows = (await db`
    SELECT body FROM instances
    WHERE body->>'processId' = ${processId}
      AND kind <> 'test'
      AND (body->>'startedAt')::timestamptz >= ${range.from}::timestamptz
      AND (body->>'startedAt')::timestamptz <= ${range.to}::timestamptz
  `) as { body: unknown }[];
  return rows.map((r) => parseRow(r.body, (v) => instanceSchema.parse(v)));
}

async function historyByInstance(ids: string[], db: SQL): Promise<Map<string, HistoryEntry[]>> {
  const out = new Map<string, HistoryEntry[]>();
  if (ids.length === 0) return out;
  const rows = (await db`
    SELECT instance_id, entry FROM history_entries
    WHERE instance_id = ANY(${db.array(ids, "TEXT")})
    ORDER BY instance_id, transition_seq
  `) as { instance_id: string; entry: unknown }[];
  for (const r of rows) {
    const entry = parseRow(r.entry, (v) => historyEntrySchema.parse(v));
    const list = out.get(r.instance_id);
    if (list) list.push(entry);
    else out.set(r.instance_id, [entry]);
  }
  return out;
}

type TimelineEntry = { stepId: StepId; at: string; seq: number; version: number };

/**
 * `(stepId, enteredAt)` for one instance: the initial step at `startedAt`,
 * then every HistoryEntry's `toStepId` at its `at`, in `transitionSeq` order.
 *
 * A `migration` entry landing on the step the instance already occupies opens
 * no new entry. `migrateOne` calls `planStepEntry` unconditionally, so that
 * entry exists whenever a migration leaves an instance in place; treating it
 * as a re-entry would split one stay into two traversals and halve every rate
 * computed over them. Scoped to the `migration` cause: a self-loop path under
 * `user`/`automatic`/`timer` re-arms the step's timers and is a real re-entry.
 *
 * ponytail: the initial step comes from the instance's CURRENT pinned version.
 * For an instance migrated onto a version that renamed its initial step, that
 * names the target's initial step rather than the one it started on. The
 * engine records no creation-time version, so closing this needs a new
 * persisted fact, not a smarter walk.
 */
function buildTimeline(inst: Instance, entries: HistoryEntry[], body: ProcessBody): TimelineEntry[] {
  const timeline: TimelineEntry[] = [
    { stepId: body.workflow.initialStep, at: inst.startedAt, seq: 0, version: inst.version },
  ];
  for (const e of entries) {
    const prev = timeline[timeline.length - 1]!;
    if (e.cause === "migration" && e.toStepId === prev.stepId) continue;
    timeline.push({ stepId: e.toStepId, at: e.at, seq: e.transitionSeq, version: e.version });
  }
  return timeline;
}

/**
 * One traversal per consecutive timeline pair. The last entry yields none: the
 * instance has not left that step within the record, and no duration is
 * estimated against the wall clock.
 *
 * The step an instance occupied when it was cancelled DOES yield a traversal —
 * `cancelInstance` writes a HistoryEntry to the cancel sink, so the stay has a
 * closing timestamp. A bottleneck reading of "how long do instances sit here"
 * counts an abandoned wait as time spent; excluding it would flatter exactly
 * the steps where abandonment happens most.
 */
function traversalsOf(inst: Instance, entries: HistoryEntry[], body: ProcessBody): Traversal[] {
  const timeline = buildTimeline(inst, entries, body);
  const bySeq = new Map(entries.map((e) => [e.transitionSeq, e] as const));
  const out: Traversal[] = [];
  for (let i = 0; i + 1 < timeline.length; i++) {
    const here = timeline[i]!;
    const next = timeline[i + 1]!;
    // The sink is engine-supplied, not authored: never ranked against real
    // steps. It is terminal, so it is always the last timeline entry and would
    // yield nothing anyway — this guards the shape, not one code path.
    if (here.stepId === CANCEL_SINK_STEP_ID) continue;
    const closing = bySeq.get(next.seq);
    out.push({
      stepId: here.stepId,
      ms: new Date(next.at).getTime() - new Date(here.at).getTime(),
      enteringSeq: here.seq,
      version: here.version,
      closedByCause: closing?.cause ?? "automatic",
      closedByPathId: closing?.pathId ?? null,
      instanceStatus: inst.status,
    });
  }
  return out;
}

/** Everything the three views share: in-range instances, their traversals, and the labelling body. */
type Scan = {
  instances: Instance[];
  traversals: Traversal[];
  /** Per resolved version, for timer lookups. */
  bodies: Map<number, ProcessBody>;
  latest: ProcessBody;
  skipped: number;
};

async function scan(processId: ProcessId, range: DateRange, db: SQL): Promise<Scan | null> {
  const store = createDefinitionStore(db);
  const latest = await store.resolveLatest(processId);
  if (!latest) return null;

  const instances = await selectInRange(processId, range, db);
  const history = await historyByInstance(instances.map((i) => i.instanceId), db);

  const bodies = new Map<number, ProcessBody>();
  const traversals: Traversal[] = [];
  let skipped = 0;
  for (const inst of instances) {
    let body = bodies.get(inst.version);
    if (!body) {
      const resolved = await store.resolveBody(inst.processId, inst.version);
      // A pinned version that no longer resolves shrinks the population. Counted
      // and returned rather than swallowed, so a partial view says so.
      if (!resolved) { skipped++; continue; }
      body = resolved;
      bodies.set(inst.version, body);
    }
    traversals.push(...traversalsOf(inst, history.get(inst.instanceId) ?? [], body));
  }
  return { instances, traversals, bodies, latest: latest.body, skipped };
}

function labelsOf(latest: ProcessBody): Map<StepId, StepLabel> {
  return new Map(latest.workflow.steps.map((s) => [s.id, { stepId: s.id, key: s.key, label: s.label }]));
}

/** Workflow order of the latest published version, so a per-step row reads left-to-right. */
function orderOf(latest: ProcessBody): Map<StepId, number> {
  return new Map(latest.workflow.steps.map((s, i) => [s.id, i]));
}

function groupMs(traversals: Traversal[]): Map<StepId, number[]> {
  const out = new Map<StepId, number[]>();
  for (const t of traversals) {
    const list = out.get(t.stepId);
    if (list) list.push(t.ms);
    else out.set(t.stepId, [t.ms]);
  }
  return out;
}

/**
 * Total-duration percentiles and per-step averages, both over `completed`
 * instances only: a cancelled or faulted instance did not finish its normal
 * path, so counting it would misstate "how long does this process take".
 *
 * An instance created directly onto a terminal step is `completed` at creation
 * with no HistoryEntry at all (store.ts::createInstance). It has no terminal
 * transition to measure to, so it contributes no zero — a population of those
 * would otherwise report a cycle time of zero for a process that has none.
 */
export async function cycleTime(processId: ProcessId, range: DateRange, db: SQL = sql): Promise<CycleTimeView | null> {
  const s = await scan(processId, range, db);
  if (!s) return null;

  const completed = new Set(s.instances.filter((i) => i.status === "completed").map((i) => i.instanceId));
  const history = await historyByInstance([...completed], db);
  const totals: number[] = [];
  for (const inst of s.instances) {
    if (!completed.has(inst.instanceId)) continue;
    const entries = history.get(inst.instanceId) ?? [];
    const last = entries[entries.length - 1];
    if (!last) continue;
    totals.push(new Date(last.at).getTime() - new Date(inst.startedAt).getTime());
  }
  totals.sort((a, b) => a - b);

  const labels = labelsOf(s.latest);
  const order = orderOf(s.latest);
  const perStepMs = groupMs(s.traversals.filter((t) => t.instanceStatus === "completed"));
  const perStep = [...perStepMs.entries()]
    .filter(([stepId]) => labels.has(stepId))
    .map(([stepId, list]) => ({
      ...labels.get(stepId)!,
      averageMs: Math.round(list.reduce((a, b) => a + b, 0) / list.length),
      traversals: list.length,
    }))
    .sort((a, b) => (order.get(a.stepId) ?? 0) - (order.get(b.stepId) ?? 0));

  return {
    sampleSize: totals.length,
    p50Ms: percentile(totals, 0.5),
    p90Ms: percentile(totals, 0.9),
    p99Ms: percentile(totals, 0.99),
    perStep,
    skippedInstances: s.skipped,
  };
}

/**
 * Steps ranked by median dwell over EVERY in-range instance regardless of
 * status — a step's own speed is observable the moment an instance has passed
 * through it, and should not wait for the whole instance to finish. This is
 * deliberately wider than cycleTime's completed-only scope; the two reporting
 * different numbers for one step is expected, not a discrepancy.
 *
 * The work-in-progress count ignores the date range: "how many are stuck here
 * right now" is a present-tense question.
 */
export async function bottleneck(processId: ProcessId, range: DateRange, db: SQL = sql): Promise<BottleneckView | null> {
  const s = await scan(processId, range, db);
  if (!s) return null;

  const labels = labelsOf(s.latest);
  const perStepMs = groupMs(s.traversals);
  const ranking = [...perStepMs.entries()]
    .filter(([stepId]) => labels.has(stepId))
    .map(([stepId, list]) => {
      const sorted = [...list].sort((a, b) => a - b);
      return { ...labels.get(stepId)!, medianMs: percentile(sorted, 0.5)!, traversals: sorted.length };
    })
    .sort((a, b) => b.medianMs - a.medianMs);

  const wipRows = (await db`
    SELECT body->>'currentStepId' AS step_id, count(*)::int AS n
    FROM instances
    WHERE body->>'processId' = ${processId} AND body->>'status' = 'running' AND kind <> 'test'
    GROUP BY body->>'currentStepId'
  `) as { step_id: string; n: number }[];
  const wip = new Map(wipRows.map((r) => [r.step_id as StepId, r.n]));
  const workInProgress = s.latest.workflow.steps
    .map((step) => ({ ...labels.get(step.id)!, running: wip.get(step.id) ?? 0 }))
    .filter((r) => r.running > 0);

  return { ranking, workInProgress, skippedInstances: s.skipped };
}

/**
 * Per-step breach rate, derived from the two forms in which the engine records
 * a timer firing. Only one of them is an event:
 *
 * - A REMINDER timer (`onFire.actions`, no `targetPath`) enqueues its actions
 *   without moving the instance and records a `timer.fired` InstanceEvent
 *   carrying its `timerId`.
 * - A TRANSITION timer (`onFire.targetPath`, the shape an escalation takes)
 *   calls `commitTransition(..., "timer", ...)` and records a HistoryEntry with
 *   `cause: "timer"` and the timer's `targetPath` as its `pathId`. It records
 *   NO `timer.fired` event.
 *
 * Reading only the first form is incorrect, not merely incomplete: a step whose
 * SLA is expressed as an escalation would report a breach rate of zero over a
 * full denominator, asserting that a step which breached on every traversal met
 * its SLA every time. `examples/expense-approval.json` declares one timer of
 * each kind, so this is the repo's own recipe and not a hypothetical.
 *
 * A step declaring no timer carries no threshold and is absent entirely — the
 * view accepts no caller-supplied threshold.
 *
 * Event attribution is equality on `transitionSeq`: an event records the
 * sequence in force and never advances it, so a reminder fires under the
 * sequence of the transition that entered the step. Equality is exact and
 * attributes a firing to the visit during which it occurred, even when an
 * instance visits the same step more than once.
 */
export async function sla(processId: ProcessId, range: DateRange, db: SQL = sql): Promise<SlaView | null> {
  const s = await scan(processId, range, db);
  if (!s) return null;

  // Per version: which step declares a given timer, and which step declares a
  // timer routing down a given path.
  const timerToStep = new Map<string, Map<string, StepId>>();
  const pathToStep = new Map<string, Map<string, StepId>>();
  const timerBearing = new Set<StepId>();
  for (const [version, body] of s.bodies) {
    const byTimer = new Map<string, StepId>();
    const byPath = new Map<string, StepId>();
    for (const step of body.workflow.steps) {
      for (const timer of step.timers ?? []) {
        byTimer.set(timer.id, step.id);
        timerBearing.add(step.id);
        if (timer.onFire.targetPath) byPath.set(timer.onFire.targetPath, step.id);
      }
    }
    timerToStep.set(String(version), byTimer);
    pathToStep.set(String(version), byPath);
  }

  const ids = s.instances.map((i) => i.instanceId);
  const firedRows = ids.length === 0 ? [] : ((await db`
    SELECT instance_id, transition_seq, event FROM instance_events
    WHERE kind = 'timer.fired' AND instance_id = ANY(${db.array(ids, "TEXT")})
  `) as { instance_id: string; transition_seq: number; event: unknown }[]);
  // (instanceId, seq) -> the timerIds that fired under that sequence.
  const firedAt = new Map<string, string[]>();
  for (const r of firedRows) {
    const ev = parseRow(r.event, (v) => v as { payload?: { timerId?: string } });
    const timerId = ev.payload?.timerId;
    if (!timerId) continue;
    const key = `${r.instance_id}:${r.transition_seq}`;
    const list = firedAt.get(key);
    if (list) list.push(timerId);
    else firedAt.set(key, [timerId]);
  }

  // Re-walk per instance so a traversal can be matched to its own instance's events.
  const history = await historyByInstance(ids, db);
  const tally = new Map<StepId, { breached: number; traversals: number }>();
  for (const inst of s.instances) {
    const body = s.bodies.get(inst.version);
    if (!body) continue;
    for (const t of traversalsOf(inst, history.get(inst.instanceId) ?? [], body)) {
      if (!timerBearing.has(t.stepId)) continue;
      const row = tally.get(t.stepId) ?? { breached: 0, traversals: 0 };
      row.traversals++;
      // One breach per traversal however many of the step's timers fired.
      const reminderFired = (firedAt.get(`${inst.instanceId}:${t.enteringSeq}`) ?? [])
        .some((timerId) => timerToStep.get(String(t.version))?.get(timerId) === t.stepId);
      const escalationFired = t.closedByCause === "timer"
        && t.closedByPathId !== null
        && pathToStep.get(String(t.version))?.get(t.closedByPathId) === t.stepId;
      if (reminderFired || escalationFired) row.breached++;
      tally.set(t.stepId, row);
    }
  }

  const labels = labelsOf(s.latest);
  const order = orderOf(s.latest);
  const steps = [...tally.entries()]
    .filter(([stepId]) => labels.has(stepId))
    .map(([stepId, row]) => ({
      ...labels.get(stepId)!,
      breached: row.breached,
      traversals: row.traversals,
      breachRate: row.traversals === 0 ? 0 : row.breached / row.traversals,
    }))
    .sort((a, b) => (order.get(a.stepId) ?? 0) - (order.get(b.stepId) ?? 0));

  return { steps, skippedInstances: s.skipped };
}
