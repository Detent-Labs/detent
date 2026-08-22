/**
 * process.start: fire-and-forget chaining. Starts an independent instance on
 * delivery, deterministic id under at-least-once dispatch, inputMapping
 * seeding/drop-reporting, the chainedFrom backlink, drive-to-rest (including
 * after a crash), the publish-time cross-process check across all five
 * action positions, and dead-lettering on repeated failure. DB-backed cases
 * skip when DATABASE_URL is unset — a skip is visible, a false green is not.
 */
import { test, expect, beforeAll } from "bun:test";
import { sql, initSchema, createInstance } from "../src/engine/store.js";
import { startInstance, commitManualTransition, cancelInstance } from "../src/engine/transition.js";
import { publishBody, createDefinitionStore, CrossProcessValidationError } from "../src/engine/definitions.js";
import { createDefaultRegistry } from "../src/engine/host.js";
import { createDataSourceRegistry, RETURN_ACTION_TYPE, type Registry as Reg } from "../src/engine/registry.js";
import { drainOutbox, deliver, MAX_ATTEMPTS, type ClaimedRow } from "../src/engine/outbox.js";
import { idempotencyKey } from "../src/engine/idempotency.js";
import { PROCESS_START_ACTION_TYPE } from "../src/handlers/process-start.js";
import type { ProcessBody, Instance, Action } from "../src/schema/definition.js";
import type { Actor } from "../src/cel/eval.js";

const DB = !!process.env.DATABASE_URL;
const actor: Actor = { id: "user_1", roles: [] };
const dataSourceReg = createDataSourceRegistry();
const cel = (src: string) => ({ lang: "cel", src });

// Target: one field, an all-automatic path straight to a terminal step. Every
// chain-start drives it to rest with no external trigger.
const targetBody = (): ProcessBody =>
  ({
    key: "target", baseLocale: "en", label: { en: "Target" },
    fields: [{ id: "field_t_amount", key: "amount", label: { en: "Amount" }, type: "number" }],
    workflow: {
      initialStep: "step_t_entry",
      steps: [
        { id: "step_t_entry", key: "t_entry", label: { en: "Entry" }, type: "task",
          paths: [{ id: "path_t_done", key: "t_done", to: "step_t_done", trigger: "automatic", priority: 1 }] },
        { id: "step_t_done", key: "t_done", label: { en: "Done" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

// A second published version of the target, structurally distinct (its
// terminal step carries a different id) so a test can tell which version an
// instance actually ran, not just which version number it claims.
const targetBodyV2 = (): ProcessBody =>
  ({
    key: "target", baseLocale: "en", label: { en: "Target V2" },
    fields: [{ id: "field_t_amount", key: "amount", label: { en: "Amount" }, type: "number" }],
    workflow: {
      initialStep: "step_t_entry",
      steps: [
        { id: "step_t_entry", key: "t_entry", label: { en: "Entry" }, type: "task",
          paths: [{ id: "path_t_done", key: "t_done", to: "step_t_done_v2", trigger: "automatic", priority: 1 }] },
        { id: "step_t_done_v2", key: "t_done_v2", label: { en: "Done V2" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

// Target variant with an extra field carrying a Literal default, and no
// inputMapping entry writing it. Task 1.11 / design.md Decision 5's
// regression fixture: default-seeding runs only inside
// createProcessInstance, never for the instance a process.start chain
// creates via createSeededInstance.
const targetBodyWithDefault = (): ProcessBody =>
  ({
    key: "target_with_default", baseLocale: "en", label: { en: "Target With Default" },
    fields: [
      { id: "field_t_amount", key: "amount", label: { en: "Amount" }, type: "number" },
      { id: "field_t_untouched", key: "untouched", label: { en: "Untouched" }, type: "string", default: "should-never-apply" },
    ],
    workflow: {
      initialStep: "step_t_entry",
      steps: [
        { id: "step_t_entry", key: "t_entry", label: { en: "Entry" }, type: "task",
          paths: [{ id: "path_t_done", key: "t_done", to: "step_t_done", trigger: "automatic", priority: 1 }] },
        { id: "step_t_done", key: "t_done", label: { en: "Done" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

// Actor: manual path from entry to a terminal step whose onEntry carries the
// process.start action, mapping the actor's own amount into the target.
const actorBody = (targetPid: string, mapping: Record<string, unknown> = { field_t_amount: cel("data.amount") }): ProcessBody =>
  ({
    key: "actor", baseLocale: "en", label: { en: "Actor" },
    fields: [{ id: "field_a_amount", key: "amount", label: { en: "Amount" }, type: "number" }],
    workflow: {
      initialStep: "step_a_entry",
      steps: [
        { id: "step_a_entry", key: "a_entry", label: { en: "Entry" }, type: "task",
          paths: [{ id: "path_a_done", key: "a_done", to: "step_a_done", trigger: "manual" }] },
        { id: "step_a_done", key: "a_done", label: { en: "Done" }, type: "task", terminal: true,
          onEntry: [{ id: "action_chain", type: PROCESS_START_ACTION_TYPE, config: { processId: targetPid, inputMapping: mapping } }] },
      ],
    },
  }) as unknown as ProcessBody;

// Actor variant placing the process.start action at each of the four
// positions besides onEntry, for the publish-time coverage test.
const actionAt = (position: "onExit" | "onCancel" | "onPath" | "onFire", targetPid: string): ProcessBody => {
  const chainAction = { id: "action_chain", type: PROCESS_START_ACTION_TYPE, config: { processId: targetPid, inputMapping: {} } };
  return {
    key: "actor_pos", baseLocale: "en", label: { en: "Actor Pos" }, fields: [],
    workflow: {
      initialStep: "step_a_entry",
      steps: [
        {
          id: "step_a_entry", key: "a_entry", label: { en: "Entry" }, type: "task",
          ...(position === "onExit" ? { onExit: [chainAction] } : {}),
          ...(position === "onCancel" ? { onCancel: [chainAction] } : {}),
          paths: [{
            id: "path_a_done", key: "a_done", to: "step_a_done", trigger: "manual",
            ...(position === "onPath" ? { onPath: [chainAction] } : {}),
          }],
          ...(position === "onFire" ? { timers: [{ id: "timer_a", duration: "PT1H", onFire: { actions: [chainAction] } }] } : {}),
        },
        { id: "step_a_done", key: "a_done", label: { en: "Done" }, type: "task", terminal: true },
      ],
    },
  } as unknown as ProcessBody;
};

function chainRegistry(): { registry: Reg } {
  return { registry: createDefaultRegistry() };
}

async function drainAll(registry: Reg): Promise<void> {
  while ((await drainOutbox(sql, registry)) > 0) { /* keep draining */ }
}

const loadInstance = async (id: string): Promise<Instance | undefined> => {
  const r = (await sql`SELECT body FROM instances WHERE instance_id = ${id}`) as { body: unknown }[];
  return r.length ? (JSON.parse(typeof r[0].body === "string" ? (r[0].body as string) : JSON.stringify(r[0].body)) as Instance) : undefined;
};
const dataField = (i: Instance | undefined, fieldId: string): unknown => (i!.data as Record<string, unknown>)[fieldId];
const countChainedFrom = async (actorId: string): Promise<number> =>
  Number(((await sql`SELECT count(*) AS n FROM instances WHERE body->>'chainedFrom' = ${actorId}`) as { n: number }[])[0].n);
const mappingDroppedEvents = async (instanceId: string): Promise<{ event: Record<string, unknown> }[]> => {
  const r = (await sql`SELECT event FROM instance_events WHERE instance_id = ${instanceId} AND kind = 'mapping.entry-dropped'`) as
    { event: unknown }[];
  return r.map((x) => ({ event: (typeof x.event === "string" ? JSON.parse(x.event) : x.event) as Record<string, unknown> }));
};
const outboxRows = async (id: string): Promise<Record<string, unknown>[]> =>
  (await sql`SELECT * FROM outbox WHERE instance_id = ${id}`) as Record<string, unknown>[];
const makeDue = async (id: string): Promise<void> => {
  await sql`UPDATE outbox SET next_attempt_at = now() WHERE instance_id = ${id}`;
};

beforeAll(async () => {
  if (DB) await initSchema();
});

test.skipIf(!DB)("a terminal step's onEntry action.start creates one instance with no parent link, driven to rest", async () => {
  const { registry } = chainRegistry();
  const tv = await publishBody("proc_pc_target1" as Instance["processId"], targetBody(), registry, dataSourceReg);
  const av = await publishBody("proc_pc_actor1" as Instance["processId"], actorBody(tv.processId), registry, dataSourceReg);
  const started = await startInstance(av.definition, { processId: av.processId, version: av.version }, actor);
  const done = await commitManualTransition(started, "path_a_done", av.definition, actor, sql, { field_a_amount: 500 } as unknown as Instance["data"]);
  expect(done.status).toBe("completed");

  await drainAll(registry);

  const expectedId = `inst_${idempotencyKey(done.instanceId, done.transitionSeq, "action_chain")}`;
  const target = await loadInstance(expectedId);
  expect(target).toBeDefined();
  expect(target!.parent).toBeUndefined();
  expect(target!.chainedFrom).toBe(done.instanceId);
  expect(dataField(target, "field_t_amount")).toBe(500);
  // The all-automatic path drove it straight to rest, no external trigger.
  expect(target!.status).toBe("completed");
  expect(target!.currentStepId as string).toBe("step_t_done");

  // No return path: reaching a terminal step with no `parent` link enqueues
  // no core.returnSubprocess action, unlike a subprocess child.
  const targetOutbox = await outboxRows(expectedId);
  const actionTypes = targetOutbox.map((r) => {
    const a = r.action;
    return ((typeof a === "string" ? JSON.parse(a) : a) as { type: string }).type;
  });
  expect(actionTypes).not.toContain(RETURN_ACTION_TYPE);
});

test.skipIf(!DB)("a process.start chain's started instance does not seed a catalog default the target process declares", async () => {
  const { registry } = chainRegistry();
  const tv = await publishBody("proc_pc_target_default" as Instance["processId"], targetBodyWithDefault(), registry, dataSourceReg);
  const av = await publishBody("proc_pc_actor_default" as Instance["processId"], actorBody(tv.processId), registry, dataSourceReg);
  const started = await startInstance(av.definition, { processId: av.processId, version: av.version }, actor);
  const done = await commitManualTransition(started, "path_a_done", av.definition, actor, sql, { field_a_amount: 500 } as unknown as Instance["data"]);

  await drainAll(registry);

  const expectedId = `inst_${idempotencyKey(done.instanceId, done.transitionSeq, "action_chain")}`;
  const target = await loadInstance(expectedId);
  expect(target).toBeDefined();
  expect(dataField(target, "field_t_amount")).toBe(500); // seeded from inputMapping
  expect(dataField(target, "field_t_untouched")).toBeUndefined(); // catalog default never applied
});

test.skipIf(!DB)("the started instance runs the newest published version of the target", async () => {
  const { registry } = chainRegistry();
  const targetPid = "proc_pc_target_versions" as Instance["processId"];
  await publishBody(targetPid, targetBody(), registry, dataSourceReg); // v1
  const tv2 = await publishBody(targetPid, targetBodyV2(), registry, dataSourceReg); // v2, newer
  expect(tv2.version).toBeGreaterThan(1);

  const av = await publishBody("proc_pc_actor_versions" as Instance["processId"], actorBody(targetPid), registry, dataSourceReg);
  const started = await startInstance(av.definition, { processId: av.processId, version: av.version }, actor);
  const done = await commitManualTransition(started, "path_a_done", av.definition, actor, sql, { field_a_amount: 500 } as unknown as Instance["data"]);

  await drainAll(registry);

  const startedId = `inst_${idempotencyKey(done.instanceId, done.transitionSeq, "action_chain")}`;
  const target = await loadInstance(startedId);
  expect(target!.version).toBe(tv2.version);
  // Only the v2 body has this step id; reaching it (not v1's step_t_done)
  // proves the started instance ran v2, not just that it claims v2's number.
  expect(target!.currentStepId as string).toBe("step_t_done_v2");
});

test.skipIf(!DB)("a redelivered start creates no second instance", async () => {
  const { registry } = chainRegistry();
  const tv = await publishBody("proc_pc_target2" as Instance["processId"], targetBody(), registry, dataSourceReg);
  const av = await publishBody("proc_pc_actor2" as Instance["processId"], actorBody(tv.processId), registry, dataSourceReg);
  const started = await startInstance(av.definition, { processId: av.processId, version: av.version }, actor);
  const done = await commitManualTransition(started, "path_a_done", av.definition, actor, sql, { field_a_amount: 500 } as unknown as Instance["data"]);

  // Simulate the outbox delivering the SAME physical row twice (at-least-once
  // redelivery, per action-handlers' own "MUST dedupe on the row's idempotency
  // key" rule): call deliver() directly, twice, with the same idempotency key,
  // bypassing drainOutbox's own once-only marking entirely.
  const row: ClaimedRow = {
    idempotency_key: idempotencyKey(done.instanceId, done.transitionSeq, "action_chain"),
    instance_id: done.instanceId,
    transition_seq: done.transitionSeq,
    action: {
      id: "action_chain", type: PROCESS_START_ACTION_TYPE,
      config: { processId: tv.processId, inputMapping: { field_t_amount: cel("data.amount") } },
    } as unknown as Action,
    attempts: 0,
    event_id: null,
    field_version: done.version,
    actors: null,
  };
  await deliver(row, registry, sql);
  await deliver(row, registry, sql);

  expect(await countChainedFrom(done.instanceId)).toBe(1);
});

test.skipIf(!DB)("a redelivery after a crash between creation and drive-to-rest still reaches rest", async () => {
  const { registry } = chainRegistry();
  const tv = await publishBody("proc_pc_target3" as Instance["processId"], targetBody(), registry, dataSourceReg);
  const av = await publishBody("proc_pc_actor3" as Instance["processId"], actorBody(tv.processId), registry, dataSourceReg);
  const started = await startInstance(av.definition, { processId: av.processId, version: av.version }, actor);
  const done = await commitManualTransition(started, "path_a_done", av.definition, actor, sql, { field_a_amount: 500 } as unknown as Instance["data"]);
  // The chain-start action is enqueued but not yet delivered.

  // Simulate a first delivery that created the instance but crashed before
  // driving it to rest: create it directly, without ever calling
  // resolveAutomatic, exactly as the handler's own creation branch would.
  const startedId = `inst_${idempotencyKey(done.instanceId, done.transitionSeq, "action_chain")}`;
  await createInstance(
    tv.definition,
    { processId: tv.processId, version: tv.version, instanceId: startedId, data: { field_t_amount: 500 } as unknown as Instance["data"], chainedFrom: done.instanceId },
    sql,
  );
  expect((await loadInstance(startedId))!.currentStepId as string).toBe("step_t_entry"); // parked, not yet driven

  // Draining the still-pending chain-start action is, from the handler's
  // point of view, indistinguishable from a genuine redelivery.
  await drainAll(registry);

  const target = await loadInstance(startedId);
  expect(target!.status).toBe("completed");
  expect(target!.currentStepId as string).toBe("step_t_done");
});

test.skipIf(!DB)("a process.start action at each of the four other action positions is covered by the publish-time check", async () => {
  const registry = createDefaultRegistry();
  const positions = ["onExit", "onCancel", "onPath", "onFire"] as const;
  for (const position of positions) {
    await expect(
      publishBody(`proc_pc_pos_${position}` as Instance["processId"], actionAt(position, "proc_pc_nonexistent" as Instance["processId"]), registry, dataSourceReg),
    ).rejects.toBeInstanceOf(CrossProcessValidationError);
  }
});

test.skipIf(!DB)("one raising inputMapping entry is omitted and recorded on the ACTING instance, not the started one", async () => {
  const { registry } = chainRegistry();
  const tv = await publishBody("proc_pc_target5" as Instance["processId"], targetBody(), registry, dataSourceReg);
  const av = await publishBody("proc_pc_actor5" as Instance["processId"], actorBody(tv.processId), registry, dataSourceReg);
  const started = await startInstance(av.definition, { processId: av.processId, version: av.version }, actor);
  // field_a_amount deliberately left unset: inputMapping's `data.amount` raises.
  const done = await commitManualTransition(started, "path_a_done", av.definition, actor, sql);

  await drainAll(registry);

  const startedId = `inst_${idempotencyKey(done.instanceId, done.transitionSeq, "action_chain")}`;
  const target = await loadInstance(startedId);
  expect(target).toBeDefined();
  expect(dataField(target, "field_t_amount")).toBeUndefined(); // omitted, not defaulted

  const events = await mappingDroppedEvents(done.instanceId);
  expect(events).toHaveLength(1);
  expect(events[0].event.payload).toEqual({ fieldId: "field_t_amount", direction: "input", reason: "expression-raised" });
  expect(await mappingDroppedEvents(startedId)).toHaveLength(0); // never recorded on the started instance
});

test.skipIf(!DB)("chainedFrom is not read by cancel cascade", async () => {
  const { registry } = chainRegistry();
  const tv = await publishBody("proc_pc_target6" as Instance["processId"], targetBody(), registry, dataSourceReg);
  const av = await publishBody("proc_pc_actor6" as Instance["processId"], actorBody(tv.processId), registry, dataSourceReg);
  const started = await startInstance(av.definition, { processId: av.processId, version: av.version }, actor);
  const done = await commitManualTransition(started, "path_a_done", av.definition, actor, sql, { field_a_amount: 500 } as unknown as Instance["data"]);
  await drainAll(registry);

  const startedId = `inst_${idempotencyKey(done.instanceId, done.transitionSeq, "action_chain")}`;
  expect((await loadInstance(startedId))!.status).toBe("completed");

  // The acting instance is already terminal by construction (that is the
  // whole premise of chaining). Force it back to "running" purely to exercise
  // cancelInstance's cascade path and confirm chainedFrom is inert to it —
  // cancel cascade only ever reads `parent`, a field this instance never set.
  await sql`UPDATE instances SET body = jsonb_set(body, '{status}', '"running"') WHERE instance_id = ${done.instanceId}`;
  const forced = await loadInstance(done.instanceId);
  await cancelInstance(forced!, av.definition, actor, sql, createDefinitionStore(sql).resolveBody);

  expect((await loadInstance(startedId))!.status).toBe("completed"); // unaffected
});

test.skipIf(!DB)("a process.start action mapping into an undeclared target field is rejected at publish", async () => {
  const registry = createDefaultRegistry();
  const tv = await publishBody("proc_pc_target7" as Instance["processId"], targetBody(), registry, dataSourceReg);
  await expect(
    publishBody(
      "proc_pc_actor7" as Instance["processId"],
      actorBody(tv.processId, { field_nonexistent: cel("data.amount") }),
      registry,
      dataSourceReg,
    ),
  ).rejects.toBeInstanceOf(CrossProcessValidationError);
});

test.skipIf(!DB)("a process.start delivery that keeps failing dead-letters, and the acting instance is unaffected", async () => {
  const registry = createDefaultRegistry();
  const av = await publishBody("proc_pc_actor8" as Instance["processId"], targetBody(), registry, dataSourceReg); // any published, running instance
  const inst = await startInstance(av.definition, { processId: av.processId, version: av.version }, actor);

  // Bypass publish-time validation (as a redelivery of an already-validated
  // row would carry): a process.start action naming a process that was
  // never published, so the real handler's resolveLatest fails every time.
  const action: Action = {
    id: "action_bad_chain",
    type: PROCESS_START_ACTION_TYPE,
    config: { processId: "proc_pc_never_published", inputMapping: {} },
  } as unknown as Action;
  await sql`INSERT INTO outbox (idempotency_key, instance_id, transition_seq, action_id, action)
    VALUES (${"bad_chain_" + inst.instanceId}, ${inst.instanceId}, ${inst.transitionSeq}, ${"action_bad_chain"}, ${action})`;

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    await makeDue(inst.instanceId);
    await drainOutbox(sql, registry);
  }

  const rows = await outboxRows(inst.instanceId);
  expect(rows).toHaveLength(1);
  expect(rows[0]!.status).toBe("dead-letter");
  expect(rows[0]!.attempts).toBe(MAX_ATTEMPTS);

  const after = await loadInstance(inst.instanceId);
  expect(after!.status).toBe(inst.status); // the acting instance's own record is untouched
  expect(after!.data).toEqual(inst.data);
});
