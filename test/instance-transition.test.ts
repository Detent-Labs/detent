/**
 * `instance.transition` handler: end-to-end delivery, attribution/idempotency
 * (`instance-transition-action`'s requirements). DB-backed; skips when
 * DATABASE_URL is unset — a skip is visible, a false green is not.
 */
import { test, expect, beforeAll } from "bun:test";
import { sql, initSchema, loadInstance } from "../src/engine/store.js";
import { startInstance, commitManualTransition, cancelInstance } from "../src/engine/transition.js";
import { publishBody } from "../src/engine/definitions.js";
import { createDefaultRegistry } from "../src/engine/host.js";
import { createDataSourceRegistry, type Registry as Reg } from "../src/engine/registry.js";
import { drainOutbox, deliver, type ClaimedRow } from "../src/engine/outbox.js";
import { idempotencyKey } from "../src/engine/idempotency.js";
import { INSTANCE_TRANSITION_ACTION_TYPE } from "../src/handlers/instance-transition.js";
import type { ProcessBody, Instance, Action, InstanceEvent } from "../src/schema/definition.js";
import type { Actor } from "../src/cel/eval.js";

const DB = !!process.env.DATABASE_URL;
const actor: Actor = { id: "user_1", roles: [] };
const dataSourceReg = createDataSourceRegistry();
const cel = (src: string) => ({ lang: "cel", src });

// step_shelf (initial) --path_issue(manual)--> step_issued (terminal).
const targetBody = (): ProcessBody =>
  ({
    key: "target", baseLocale: "en", label: { en: "Target" },
    fields: [],
    workflow: {
      initialStep: "step_shelf",
      steps: [
        { id: "step_shelf", key: "shelf", label: { en: "Shelf" }, type: "task",
          paths: [{ id: "path_issue", key: "issue", label: "Issue", to: "step_issued", trigger: "manual" }] },
        { id: "step_issued", key: "issued", label: { en: "Issued" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

// Same shape, but step_issued is a non-terminal wait-state (an automatic path
// with an unmet guard), so a target moved there stays `running` rather than
// `completed` — isolating the current-step refusal from the status refusal.
const targetBodyNonTerminal = (): ProcessBody =>
  ({
    key: "target_wait", baseLocale: "en", label: { en: "Target Wait" },
    fields: [{ id: "field_go", key: "go", label: { en: "Go" }, type: "string" }],
    workflow: {
      initialStep: "step_shelf",
      steps: [
        { id: "step_shelf", key: "shelf", label: { en: "Shelf" }, type: "task",
          paths: [{ id: "path_issue", key: "issue", label: "Issue", to: "step_issued", trigger: "manual" }] },
        { id: "step_issued", key: "issued", label: { en: "Issued" }, type: "task",
          paths: [{ id: "path_wait", key: "wait", label: "Wait", to: "step_done", trigger: "automatic", priority: 1, guard: cel('data.go == "yes"') }] },
        { id: "step_done", key: "done", label: { en: "Done" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

// Same shape, but path_issue's guard reads the ACTOR the transition runs as,
// so the guard's answer names who the engine evaluated it against.
const targetBodyActorGuard = (guardSrc: string): ProcessBody =>
  ({
    key: "target_actor_guard", baseLocale: "en", label: { en: "Target Actor Guard" },
    fields: [],
    workflow: {
      initialStep: "step_shelf",
      steps: [
        { id: "step_shelf", key: "shelf", label: { en: "Shelf" }, type: "task",
          paths: [{ id: "path_issue", key: "issue", label: "Issue", to: "step_issued", trigger: "manual", guard: cel(guardSrc) }] },
        { id: "step_issued", key: "issued", label: { en: "Issued" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

// Same shape, but path_issue's guard never passes (field_ready is never seeded).
const targetBodyGuarded = (): ProcessBody =>
  ({
    key: "target_guarded", baseLocale: "en", label: { en: "Target Guarded" },
    fields: [{ id: "field_ready", key: "ready", label: { en: "Ready" }, type: "string" }],
    workflow: {
      initialStep: "step_shelf",
      steps: [
        { id: "step_shelf", key: "shelf", label: { en: "Shelf" }, type: "task",
          paths: [{ id: "path_issue", key: "issue", label: "Issue", to: "step_issued", trigger: "manual", guard: cel('data.ready == "yes"') }] },
        { id: "step_issued", key: "issued", label: { en: "Issued" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

// A single step whose only path is AUTOMATIC, parked by an unmet guard (the
// wait-state idiom) so the instance stays on step_x rather than resolving at
// creation. `path_x_auto` is declared on the instance's current step but is
// not manual.
const targetBodyAutoOnly = (): ProcessBody =>
  ({
    key: "target_auto_only", baseLocale: "en", label: { en: "Target Auto Only" },
    fields: [{ id: "field_go", key: "go", label: { en: "Go" }, type: "string" }],
    workflow: {
      initialStep: "step_x",
      steps: [
        { id: "step_x", key: "x", label: { en: "X" }, type: "task",
          paths: [{ id: "path_x_auto", key: "x_auto", label: "XAuto", to: "step_y", trigger: "automatic", priority: 1, guard: cel('data.go == "yes"') }] },
        { id: "step_y", key: "y", label: { en: "Y" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

// step_shelf --path_issue(manual)--> step_issued --path_auto(automatic, guardless)--> step_done (terminal).
const targetBodyAutoChain = (): ProcessBody =>
  ({
    key: "target_auto_chain", baseLocale: "en", label: { en: "Target Auto Chain" },
    fields: [],
    workflow: {
      initialStep: "step_shelf",
      steps: [
        { id: "step_shelf", key: "shelf", label: { en: "Shelf" }, type: "task",
          paths: [{ id: "path_issue", key: "issue", label: "Issue", to: "step_issued", trigger: "manual" }] },
        { id: "step_issued", key: "issued", label: { en: "Issued" }, type: "task",
          paths: [{ id: "path_auto", key: "auto", label: "Auto", to: "step_done", trigger: "automatic", priority: 1 }] },
        { id: "step_done", key: "done", label: { en: "Done" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

// Actor: manual path from entry to a terminal step whose onEntry carries the
// instance.transition action, naming `targetPid`/`pathId`. The acting instance
// carries the target's own id under `field_target_id`.
const actorBody = (targetPid: string, pathId: string): ProcessBody =>
  ({
    key: "actor", baseLocale: "en", label: { en: "Actor" },
    fields: [{ id: "field_target_id", key: "target_id", label: { en: "Target Id" }, type: "string" }],
    workflow: {
      initialStep: "step_a_entry",
      steps: [
        { id: "step_a_entry", key: "a_entry", label: { en: "Entry" }, type: "task",
          paths: [{ id: "path_a_done", key: "a_done", label: "A Done", to: "step_a_done", trigger: "manual" }] },
        { id: "step_a_done", key: "a_done", label: { en: "Done" }, type: "task", terminal: true,
          onEntry: [{ id: "action_it", type: INSTANCE_TRANSITION_ACTION_TYPE, config: { processId: targetPid, instanceIdField: "field_target_id", pathId } }] },
      ],
    },
  }) as unknown as ProcessBody;

let seq = 0;
const pid = (prefix: string): Instance["processId"] => `${prefix}_${seq++}` as Instance["processId"];

/**
 * Publish target + actor, start and submit the acting instance so its outbox
 * row is enqueued but not yet delivered.
 *
 * `heldId` is what the acting instance holds under `field_target_id`: the
 * target's own id by default, `null` to leave the field unset, or any string
 * to point the action somewhere else.
 */
async function setUp(targetBody_: ProcessBody, pathId: string, registry: Reg, heldId?: string | null) {
  const targetPid = pid("proc_it_target");
  const actorPid = pid("proc_it_actor");
  const tv = await publishBody(targetPid, targetBody_, registry, dataSourceReg);
  const av = await publishBody(actorPid, actorBody(tv.processId, pathId), registry, dataSourceReg);
  const target = await startInstance(tv.definition, { processId: tv.processId, version: tv.version }, actor);
  const started = await startInstance(av.definition, { processId: av.processId, version: av.version }, actor);
  const patch = heldId === null ? {} : { field_target_id: heldId ?? target.instanceId };
  const done = await commitManualTransition(started, "path_a_done", av.definition, actor, sql, patch as unknown as Instance["data"]);
  return { target, done, tv, av };
}

const outboxRowFor = async (instanceId: string): Promise<Record<string, unknown> | undefined> =>
  ((await sql`SELECT * FROM outbox WHERE instance_id = ${instanceId}`) as Record<string, unknown>[])[0];

const transitionedByActionEvents = async (instanceId: string): Promise<InstanceEvent[]> => {
  const r = (await sql`SELECT event FROM instance_events WHERE instance_id = ${instanceId} AND kind = 'instance.transitioned-by-action'`) as
    { event: unknown }[];
  return r.map((x) => (typeof x.event === "string" ? JSON.parse(x.event) : x.event) as InstanceEvent);
};

beforeAll(async () => {
  if (DB) await initSchema();
});

test.skipIf(!DB)("an acting instance's submission drives the target along the named manual path", async () => {
  const registry = createDefaultRegistry();
  const { target, done } = await setUp(targetBody(), "path_issue", registry);

  await drainOutbox(sql, registry);

  const after = await loadInstance(sql, target.instanceId);
  expect(after!.currentStepId as string).toBe("step_issued");

  const targetEvents = await transitionedByActionEvents(target.instanceId);
  expect(targetEvents).toHaveLength(1);
  expect(targetEvents[0].payload as Record<string, unknown>).toEqual({
    byInstanceId: done.instanceId,
    actionId: "action_it",
    idempotencyKey: idempotencyKey(done.instanceId, done.transitionSeq, "action_it"),
    pathId: "path_issue",
  });

  // The event carries the seq its accompanying transition advances to, and
  // advances none of its own: the target sits at exactly that seq afterwards.
  expect(targetEvents[0].transitionSeq).toBe(target.transitionSeq + 1);
  expect(after!.transitionSeq).toBe(target.transitionSeq + 1);

  const actingEvents = await transitionedByActionEvents(done.instanceId);
  expect(actingEvents).toHaveLength(0);
});

test.skipIf(!DB)("the target path's guard evaluates against the system actor, not the triggering participant", async () => {
  const registry = createDefaultRegistry();
  // `actor` above submits as user_1, so a guard demanding "system" can only
  // pass if the handler drove the target as SYSTEM_ACTOR.
  const passes = await setUp(targetBodyActorGuard('actor.id == "system"'), "path_issue", registry);
  const refuses = await setUp(targetBodyActorGuard(`actor.id == "${actor.id}"`), "path_issue", registry);

  await drainOutbox(sql, registry);

  expect((await loadInstance(sql, passes.target.instanceId))!.currentStepId as string).toBe("step_issued");
  expect((await loadInstance(sql, refuses.target.instanceId))!.currentStepId as string).toBe("step_shelf");
  expect((await outboxRowFor(refuses.done.instanceId))!.status).toBe("dead-letter");
});

test.skipIf(!DB)("an acting instance holding no target id fails permanently and keeps its own progress", async () => {
  const registry = createDefaultRegistry();
  const { target, done } = await setUp(targetBody(), "path_issue", registry, null);
  const beforeActing = await loadInstance(sql, done.instanceId);

  await drainOutbox(sql, registry);

  expect((await loadInstance(sql, target.instanceId))!.currentStepId as string).toBe("step_shelf"); // unmoved

  const row = await outboxRowFor(done.instanceId);
  expect(row!.status).toBe("dead-letter");
  expect(row!.attempts).toBe(1);
  expect(row!.last_error as string).toContain("field_target_id"); // names the empty field

  const actingAfter = await loadInstance(sql, done.instanceId);
  expect(actingAfter!.currentStepId).toBe(beforeActing!.currentStepId);
  expect(actingAfter!.status).toBe(beforeActing!.status);
});

test.skipIf(!DB)("a target id that loads no instance fails permanently", async () => {
  const registry = createDefaultRegistry();
  const { done } = await setUp(targetBody(), "path_issue", registry, "inst_1a2b3c4d-0000-4000-8000-00000000dead");

  await drainOutbox(sql, registry);

  const row = await outboxRowFor(done.instanceId);
  expect(row!.status).toBe("dead-letter");
  expect(row!.attempts).toBe(1);
  expect(row!.last_error as string).toContain("does not load");
});

test.skipIf(!DB)("a target belonging to another process fails permanently, and neither instance moves", async () => {
  const registry = createDefaultRegistry();
  const otherPid = pid("proc_it_other");
  const ov = await publishBody(otherPid, targetBody(), registry, dataSourceReg);
  const other = await startInstance(ov.definition, { processId: ov.processId, version: ov.version }, actor);
  const { target, done } = await setUp(targetBody(), "path_issue", registry, other.instanceId);

  await drainOutbox(sql, registry);

  const row = await outboxRowFor(done.instanceId);
  expect(row!.status).toBe("dead-letter");
  expect(row!.attempts).toBe(1);
  expect(row!.last_error as string).toContain("belongs to process"); // names both process ids
  expect((await loadInstance(sql, other.instanceId))!.currentStepId as string).toBe("step_shelf");
  expect((await loadInstance(sql, target.instanceId))!.currentStepId as string).toBe("step_shelf");
});

test.skipIf(!DB)("a cancelled target does not move, and the delivery fails permanently", async () => {
  const registry = createDefaultRegistry();
  const { target, done, tv } = await setUp(targetBody(), "path_issue", registry);
  const cancelled = await cancelInstance(target, tv.definition, actor, sql);
  expect(cancelled.status).toBe("cancelled");

  await drainOutbox(sql, registry);

  const row = await outboxRowFor(done.instanceId);
  expect(row!.status).toBe("dead-letter");
  expect(row!.attempts).toBe(1);
  expect(row!.last_error as string).toContain("cancelled"); // names the status
  expect((await loadInstance(sql, target.instanceId))!.currentStepId).toBe(cancelled.currentStepId);
  expect(await transitionedByActionEvents(target.instanceId)).toHaveLength(0);
});

test.skipIf(!DB)("a redelivery moves the target at most once", async () => {
  const registry = createDefaultRegistry();
  const { target, done } = await setUp(targetBody(), "path_issue", registry);

  const row: ClaimedRow = {
    idempotency_key: idempotencyKey(done.instanceId, done.transitionSeq, "action_it"),
    instance_id: done.instanceId,
    transition_seq: done.transitionSeq,
    action: { id: "action_it", type: INSTANCE_TRANSITION_ACTION_TYPE, config: { processId: target.processId, instanceIdField: "field_target_id", pathId: "path_issue" } } as unknown as Action,
    attempts: 0,
    event_id: null,
    field_version: done.version,
    actors: null,
  };

  await deliver(row, registry, sql);
  const afterFirst = await loadInstance(sql, target.instanceId);
  expect(afterFirst!.currentStepId as string).toBe("step_issued");

  await deliver(row, registry, sql); // redelivery of the same physical row
  const afterSecond = await loadInstance(sql, target.instanceId);
  expect(afterSecond!.currentStepId as string).toBe("step_issued"); // unchanged

  expect(await transitionedByActionEvents(target.instanceId)).toHaveLength(1); // moved once
});

test.skipIf(!DB)("two acting instances racing for the same target: the second dead-letters on its first delivery", async () => {
  const registry = createDefaultRegistry();
  const targetPid = pid("proc_it_target");
  const actorPid = pid("proc_it_actor");
  const tv = await publishBody(targetPid, targetBodyNonTerminal(), registry, dataSourceReg);
  const av = await publishBody(actorPid, actorBody(tv.processId, "path_issue"), registry, dataSourceReg);
  const target = await startInstance(tv.definition, { processId: tv.processId, version: tv.version }, actor);

  const startedA = await startInstance(av.definition, { processId: av.processId, version: av.version }, actor);
  const doneA = await commitManualTransition(startedA, "path_a_done", av.definition, actor, sql, { field_target_id: target.instanceId } as unknown as Instance["data"]);
  const startedB = await startInstance(av.definition, { processId: av.processId, version: av.version }, actor);
  const doneB = await commitManualTransition(startedB, "path_a_done", av.definition, actor, sql, { field_target_id: target.instanceId } as unknown as Instance["data"]);

  // Both rows are due; one drainOutbox pass claims and processes both,
  // sequentially, in enqueue order — the first moves the target (which stays
  // `running`, parked on the non-terminal step_issued), the second then finds
  // it already off the path's source step.
  await drainOutbox(sql, registry);

  const after = await loadInstance(sql, target.instanceId);
  expect(after!.currentStepId as string).toBe("step_issued"); // moved exactly once
  expect(after!.status).toBe("running");

  const rowA = await outboxRowFor(doneA.instanceId);
  const rowB = await outboxRowFor(doneB.instanceId);
  const statuses = [rowA!.status, rowB!.status].sort();
  expect(statuses).toEqual(["dead-letter", "delivered"]);
  const deadLettered = rowA!.status === "dead-letter" ? rowA! : rowB!;
  expect(deadLettered.attempts).toBe(1); // dead-lettered on its first delivery, not its fifth
  expect(deadLettered.last_error as string).toContain("step_issued"); // names the step the target stands on
});

test.skipIf(!DB)("two genuinely concurrent deliveries for the same target: exactly one moves it", async () => {
  const registry = createDefaultRegistry();
  const targetPid = pid("proc_it_target");
  const actorPid = pid("proc_it_actor");
  const tv = await publishBody(targetPid, targetBody(), registry, dataSourceReg);
  const av = await publishBody(actorPid, actorBody(tv.processId, "path_issue"), registry, dataSourceReg);
  const target = await startInstance(tv.definition, { processId: tv.processId, version: tv.version }, actor);

  const startedA = await startInstance(av.definition, { processId: av.processId, version: av.version }, actor);
  const doneA = await commitManualTransition(startedA, "path_a_done", av.definition, actor, sql, { field_target_id: target.instanceId } as unknown as Instance["data"]);
  const startedB = await startInstance(av.definition, { processId: av.processId, version: av.version }, actor);
  const doneB = await commitManualTransition(startedB, "path_a_done", av.definition, actor, sql, { field_target_id: target.instanceId } as unknown as Instance["data"]);

  const config = { processId: target.processId, instanceIdField: "field_target_id", pathId: "path_issue" };
  const rowFor = (done: Instance): ClaimedRow => ({
    idempotency_key: idempotencyKey(done.instanceId, done.transitionSeq, "action_it"),
    instance_id: done.instanceId,
    transition_seq: done.transitionSeq,
    action: { id: "action_it", type: INSTANCE_TRANSITION_ACTION_TYPE, config } as unknown as Action,
    attempts: 0,
    event_id: null,
    field_version: done.version,
    actors: null,
  });

  // Both deliveries load the target before either commits: a genuine race
  // through commitTransition's own OCC predicate, not the sequential
  // current-step check above.
  const results = await Promise.allSettled([deliver(rowFor(doneA), registry, sql), deliver(rowFor(doneB), registry, sql)]);
  const fulfilled = results.filter((r) => r.status === "fulfilled");
  const rejected = results.filter((r) => r.status === "rejected");
  expect(fulfilled).toHaveLength(1);
  expect(rejected).toHaveLength(1);
  expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(Error);
  expect((rejected[0] as PromiseRejectedResult).reason.name).toBe("PermanentError");
  // Which of the two refusals fires is the scheduler's call, and both are
  // correct: the loser either lost commitTransition's OCC race (having loaded
  // the target before the winner committed) or found the target already off
  // the path's source step. Pinning one would be flaky; pinning the pair
  // catches a refusal arriving from anywhere else.
  expect((rejected[0] as PromiseRejectedResult).reason.message).toMatch(
    /lost a concurrent race|is not declared on the target's current step/,
  );

  const after = await loadInstance(sql, target.instanceId);
  expect(after!.currentStepId as string).toBe("step_issued");
  expect(await transitionedByActionEvents(target.instanceId)).toHaveLength(1);
});

test.skipIf(!DB)("a refused guard fails permanently, and the acting instance keeps its own progress", async () => {
  const registry = createDefaultRegistry();
  const { target, done } = await setUp(targetBodyGuarded(), "path_issue", registry);
  const beforeActing = await loadInstance(sql, done.instanceId);

  await drainOutbox(sql, registry);

  const after = await loadInstance(sql, target.instanceId);
  expect(after!.currentStepId as string).toBe("step_shelf"); // unmoved

  const row = await outboxRowFor(done.instanceId);
  expect(row!.status).toBe("dead-letter");
  expect(row!.attempts).toBe(1);
  expect((row!.last_error as string)).toContain("path_issue");

  const actingAfter = await loadInstance(sql, done.instanceId);
  expect(actingAfter!.status).toBe(beforeActing!.status);
  expect(actingAfter!.currentStepId).toBe(beforeActing!.currentStepId);
  expect(actingAfter!.data).toEqual(beforeActing!.data);
});

test.skipIf(!DB)("an automatic pathId is refused permanently on the first delivery", async () => {
  const registry = createDefaultRegistry();
  const { target, done } = await setUp(targetBodyAutoOnly(), "path_x_auto", registry);
  expect(target.currentStepId as string).toBe("step_x"); // parked by its own unmet guard, not yet moved

  await drainOutbox(sql, registry);

  const after = await loadInstance(sql, target.instanceId);
  expect(after!.currentStepId as string).toBe("step_x"); // unmoved

  const row = await outboxRowFor(done.instanceId);
  expect(row!.status).toBe("dead-letter");
  expect(row!.attempts).toBe(1);
});

test.skipIf(!DB)("a target reached by the action continues along an automatic path in the same delivery", async () => {
  const registry = createDefaultRegistry();
  const { target } = await setUp(targetBodyAutoChain(), "path_issue", registry);

  await drainOutbox(sql, registry);

  const after = await loadInstance(sql, target.instanceId);
  expect(after!.currentStepId as string).toBe("step_done");
  expect(after!.status).toBe("completed");
});
