/**
 * Subprocess execution: spawn on entry to a subprocess step, return of the
 * child's outcome/data to the parked parent, idempotent spawn, and downward
 * cancel propagation. DB-backed cases hit Postgres and skip when DATABASE_URL is
 * unset (a skip is visible, a false green is not). Pure cases (schema invariant,
 * deterministic ids, contract hash) always run.
 */
import { test, expect, beforeAll } from "bun:test";
import { sql, initSchema, createInstance } from "../src/engine/store.js";
import { startInstance, cancelInstance } from "../src/engine/transition.js";
import { publishBody, createDefinitionStore } from "../src/engine/definitions.js";
import { registerSubprocessHandlers } from "../src/engine/subprocess.js";
import { drainOutbox } from "../src/engine/outbox.js";
import { subprocessChildId } from "../src/engine/idempotency.js";
import { authoredProcessBody } from "../src/schema/definition.js";
import { contractHash } from "../src/schema/hash.js";
import type { ProcessBody, Instance } from "../src/schema/definition.js";
import type { Registry as Reg } from "../src/engine/registry.js";
import type { Actor } from "../src/cel/eval.js";

const DB = !!process.env.DATABASE_URL;
const actor: Actor = { id: "user_1", roles: [] };
const CHILD_PID = "proc_child" as Instance["processId"];
const PARENT_PID = "proc_parent" as Instance["processId"];

const cel = (src: string) => ({ lang: "cel", src });
const autoPath = (id: string, to: string, priority?: number, guardSrc?: string) =>
  ({ id, key: id, to, trigger: "automatic", ...(priority !== undefined ? { priority } : {}), ...(guardSrc ? { guard: cel(guardSrc) } : {}) });
const manualPath = (id: string, to: string) => ({ id, key: id, to, trigger: "manual" });

// Child: contracted, all-automatic; terminates "rejected" if amount > 1000 else
// "approved". amount is seeded from the parent's inputMapping, so child.data.amount
// flows back through outputMapping.
const childBody = (): ProcessBody =>
  ({
    key: "child", label: "Child",
    contract: { inputFields: ["field_c_amount"], outputFields: ["field_c_amount"], outcomes: ["approved", "rejected"] },
    fields: [{ id: "field_c_amount", key: "amount", label: "Amount", type: "number" }],
    workflow: {
      initialStep: "step_c_auto",
      steps: [
        { id: "step_c_auto", key: "c_auto", label: "Auto", type: "task", paths: [
          autoPath("path_c_rej", "step_c_rejected", 1, "data.amount > 1000.0"),
          autoPath("path_c_app", "step_c_approved", 2),
        ] },
        { id: "step_c_approved", key: "c_approved", label: "Approved", type: "task", terminal: true, outcome: "approved" },
        { id: "step_c_rejected", key: "c_rejected", label: "Rejected", type: "task", terminal: true, outcome: "rejected" },
      ],
    },
  }) as unknown as ProcessBody;

// Parent: entry (auto) -> subprocess wait-state guarding on child.outcome ->
// terminal approved/rejected. The subprocess step is reached via a transition
// (not the initial step), so commitTransition enqueues the spawn.
const parentBody = (childVersion: number): ProcessBody =>
  ({
    key: "parent", label: "Parent",
    fields: [
      { id: "field_p_amount", key: "amount", label: "Amount", type: "number" },
      { id: "field_p_result", key: "result", label: "Result", type: "string" },
      { id: "field_p_back", key: "back_amount", label: "Back", type: "number" },
    ],
    workflow: {
      initialStep: "step_p_entry",
      steps: [
        { id: "step_p_entry", key: "p_entry", label: "Entry", type: "task", paths: [autoPath("path_p_sub", "step_p_sub")] },
        { id: "step_p_sub", key: "p_sub", label: "Sub", type: "subprocess",
          subprocess: {
            processId: CHILD_PID, versionBinding: "pinned", pinnedVersion: childVersion,
            inputMapping: { field_c_amount: cel("data.amount") },
            outputMapping: { field_p_result: cel("child.outcome"), field_p_back: cel("child.data.amount") },
          },
          paths: [
            autoPath("path_p_app", "step_p_approved", 1, 'child.outcome == "approved"'),
            autoPath("path_p_rej", "step_p_rejected", 2, 'child.outcome == "rejected"'),
          ] },
        { id: "step_p_approved", key: "p_approved", label: "PApproved", type: "task", terminal: true },
        { id: "step_p_rejected", key: "p_rejected", label: "PRejected", type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

// A child that never advances on its own (manual initial step), so it stays
// running until cancelled — used to observe the cancel cascade.
const waitingChildBody = (): ProcessBody =>
  ({
    key: "waiting", label: "Waiting",
    contract: { outcomes: ["done"] },
    fields: [],
    workflow: {
      initialStep: "step_w_wait",
      steps: [
        { id: "step_w_wait", key: "w_wait", label: "Wait", type: "task", paths: [manualPath("path_w_done", "step_w_done")] },
        { id: "step_w_done", key: "w_done", label: "Done", type: "task", terminal: true, outcome: "done" },
      ],
    },
  }) as unknown as ProcessBody;

// A caller of `childPid` (contracted so it can itself be a subprocess): entry ->
// subprocess wait-state -> terminal outcomes. inputMapping/outputMapping empty.
const callerBody = (key: string, childPid: string, childVersion: number): ProcessBody =>
  ({
    key, label: key,
    contract: { outcomes: ["approved", "rejected"] },
    fields: [],
    workflow: {
      initialStep: "step_entry",
      steps: [
        { id: "step_entry", key: "entry", label: "Entry", type: "task", paths: [autoPath("path_sub", "step_sub")] },
        { id: "step_sub", key: "sub", label: "Sub", type: "subprocess",
          subprocess: { processId: childPid, versionBinding: "pinned", pinnedVersion: childVersion, inputMapping: {}, outputMapping: {} },
          paths: [
            autoPath("path_app", "step_approved", 1, 'child.outcome == "approved"'),
            autoPath("path_rej", "step_rejected", 2, 'child.outcome == "rejected"'),
          ] },
        { id: "step_approved", key: "approved", label: "Approved", type: "task", terminal: true, outcome: "approved" },
        { id: "step_rejected", key: "rejected", label: "Rejected", type: "task", terminal: true, outcome: "rejected" },
      ],
    },
  }) as unknown as ProcessBody;

// Child variant for latest-at-spawn: contract varies with `outputFields` (so the
// contract hash changes), body varies with `labelSuffix` (so a same-contract body
// gets a distinct version).
const childBodyV = (outputFields: string[], labelSuffix: string): ProcessBody =>
  ({
    key: "child", label: "Child" + labelSuffix,
    contract: { inputFields: ["field_c_amount"], outputFields, outcomes: ["approved", "rejected"] },
    fields: [{ id: "field_c_amount", key: "amount", label: "Amount", type: "number" }],
    workflow: {
      initialStep: "step_c_auto",
      steps: [
        { id: "step_c_auto", key: "c_auto", label: "Auto" + labelSuffix, type: "task", paths: [
          autoPath("path_c_rej", "step_c_rejected", 1, "data.amount > 1000.0"),
          autoPath("path_c_app", "step_c_approved", 2),
        ] },
        { id: "step_c_approved", key: "c_approved", label: "Approved", type: "task", terminal: true, outcome: "approved" },
        { id: "step_c_rejected", key: "c_rejected", label: "Rejected", type: "task", terminal: true, outcome: "rejected" },
      ],
    },
  }) as unknown as ProcessBody;

// Parent binding its child by contract signature (latest-at-spawn) rather than a
// pinned version.
const parentLatestBody = (childPid: string, contractRef: string): ProcessBody =>
  ({
    key: "parent_lv", label: "Parent LV",
    fields: [
      { id: "field_p_amount", key: "amount", label: "Amount", type: "number" },
      { id: "field_p_result", key: "result", label: "Result", type: "string" },
    ],
    workflow: {
      initialStep: "step_p_entry",
      steps: [
        { id: "step_p_entry", key: "p_entry", label: "Entry", type: "task", paths: [autoPath("path_p_sub", "step_p_sub")] },
        { id: "step_p_sub", key: "p_sub", label: "Sub", type: "subprocess",
          subprocess: {
            processId: childPid, versionBinding: "latest-at-spawn", contractRef,
            inputMapping: { field_c_amount: cel("data.amount") },
            outputMapping: { field_p_result: cel("child.outcome") },
          },
          paths: [
            autoPath("path_p_app", "step_p_approved", 1, 'child.outcome == "approved"'),
            autoPath("path_p_rej", "step_p_rejected", 2, 'child.outcome == "rejected"'),
          ] },
        { id: "step_p_approved", key: "p_approved", label: "PApproved", type: "task", terminal: true },
        { id: "step_p_rejected", key: "p_rejected", label: "PRejected", type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

// Parent with TWO subprocess steps, each writing a distinct field. Lets a test
// move a parked parent from one to the other and observe which step's
// outputMapping the return applied — the frozen-config and live-link answers
// differ, and so do the two mappings.
const twoSubParentBody = (childVersion: number): ProcessBody =>
  ({
    key: "parent2", label: "Parent2",
    fields: [
      { id: "field_p_amount", key: "amount", label: "Amount", type: "number" },
      { id: "field_p_result", key: "result", label: "Result", type: "string" },
      { id: "field_p_result2", key: "result2", label: "Result2", type: "string" },
    ],
    workflow: {
      initialStep: "step_p_entry",
      steps: [
        { id: "step_p_entry", key: "p_entry", label: "Entry", type: "task", paths: [autoPath("path_p_sub", "step_p_sub")] },
        { id: "step_p_sub", key: "p_sub", label: "Sub", type: "subprocess",
          subprocess: {
            processId: CHILD_PID, versionBinding: "pinned", pinnedVersion: childVersion,
            inputMapping: { field_c_amount: cel("data.amount") },
            outputMapping: { field_p_result: cel("child.outcome") },
          },
          paths: [autoPath("path_p_done", "step_p_done", 1, 'child.outcome != ""')] },
        { id: "step_p_sub2", key: "p_sub2", label: "Sub2", type: "subprocess",
          subprocess: {
            processId: CHILD_PID, versionBinding: "pinned", pinnedVersion: childVersion,
            inputMapping: {},
            outputMapping: { field_p_result2: cel("child.outcome") },
          },
          paths: [autoPath("path_p_done2", "step_p_done2", 1, 'child.outcome != ""')] },
        { id: "step_p_done", key: "p_done", label: "Done", type: "task", terminal: true },
        { id: "step_p_done2", key: "p_done2", label: "Done2", type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

// Parent that routes on child.outcome == "cancelled": pairs with the waiting child
// to observe an independently cancelled child surfacing the reserved outcome.
const cancelAwareParent = (childPid: string, childVersion: number): ProcessBody =>
  ({
    key: "ca_parent", label: "CA Parent",
    fields: [{ id: "field_ca_seen", key: "seen", label: "Seen", type: "string" }],
    workflow: {
      initialStep: "step_ca_entry",
      steps: [
        { id: "step_ca_entry", key: "ca_entry", label: "Entry", type: "task", paths: [autoPath("path_ca_sub", "step_ca_sub")] },
        { id: "step_ca_sub", key: "ca_sub", label: "Sub", type: "subprocess",
          subprocess: { processId: childPid, versionBinding: "pinned", pinnedVersion: childVersion, inputMapping: {}, outputMapping: { field_ca_seen: cel("child.outcome") } },
          paths: [
            autoPath("path_ca_cancelled", "step_ca_cancelled", 1, 'child.outcome == "cancelled"'),
            autoPath("path_ca_done", "step_ca_done", 2, 'child.outcome == "done"'),
          ] },
        { id: "step_ca_cancelled", key: "ca_cancelled", label: "Saw Cancelled", type: "task", terminal: true },
        { id: "step_ca_done", key: "ca_done", label: "Done", type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

// Parent whose `initialStep` IS the subprocess step, so the spawn has no
// transition to ride: creation must enqueue it. Same child and mappings as
// parentBody, minus the entry step.
const subInitialParentBody = (childVersion: number): ProcessBody =>
  ({
    key: "parent_si", label: "Parent SI",
    fields: [
      { id: "field_p_amount", key: "amount", label: "Amount", type: "number" },
      { id: "field_p_result", key: "result", label: "Result", type: "string" },
      { id: "field_p_back", key: "back_amount", label: "Back", type: "number" },
    ],
    workflow: {
      initialStep: "step_p_sub",
      steps: [
        { id: "step_p_sub", key: "p_sub", label: "Sub", type: "subprocess",
          subprocess: {
            processId: CHILD_PID, versionBinding: "pinned", pinnedVersion: childVersion,
            inputMapping: { field_c_amount: cel("data.amount") },
            outputMapping: { field_p_result: cel("child.outcome"), field_p_back: cel("child.data.amount") },
          },
          paths: [
            autoPath("path_p_app", "step_p_approved", 1, 'child.outcome == "approved"'),
            autoPath("path_p_rej", "step_p_rejected", 2, 'child.outcome == "rejected"'),
          ] },
        { id: "step_p_approved", key: "p_approved", label: "PApproved", type: "task", terminal: true },
        { id: "step_p_rejected", key: "p_rejected", label: "PRejected", type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

// callerBody's shape with the subprocess step as the initial step: a contracted
// thin wrapper that delegates immediately. Chaining two of these over a leaf
// child is the nested initial-step case.
const subInitialCallerBody = (key: string, childPid: string, childVersion: number): ProcessBody =>
  ({
    key, label: key,
    contract: { outcomes: ["approved", "rejected"] },
    fields: [],
    workflow: {
      initialStep: "step_sub",
      steps: [
        { id: "step_sub", key: "sub", label: "Sub", type: "subprocess",
          subprocess: { processId: childPid, versionBinding: "pinned", pinnedVersion: childVersion, inputMapping: {}, outputMapping: {} },
          paths: [
            autoPath("path_app", "step_approved", 1, 'child.outcome == "approved"'),
            autoPath("path_rej", "step_rejected", 2, 'child.outcome == "rejected"'),
          ] },
        { id: "step_approved", key: "approved", label: "Approved", type: "task", terminal: true, outcome: "approved" },
        { id: "step_rejected", key: "rejected", label: "Rejected", type: "task", terminal: true, outcome: "rejected" },
      ],
    },
  }) as unknown as ProcessBody;

function engineRegistry(): { registry: Reg; resolveBody: ReturnType<typeof createDefinitionStore>["resolveBody"] } {
  const store = createDefinitionStore(sql);
  const registry: Reg = new Map();
  registerSubprocessHandlers(registry, sql, store.resolveBody, store.resolveLatestByContract);
  return { registry, resolveBody: store.resolveBody };
}

async function drainAll(registry: Reg): Promise<void> {
  // Loop until no due rows: a spawn enqueues a return (and a nested spawn), each
  // surfacing on a later pass.
  while ((await drainOutbox(sql, registry)) > 0) { /* keep draining */ }
}

const loadInstance = async (id: string): Promise<Instance | undefined> => {
  const r = (await sql`SELECT body FROM instances WHERE instance_id = ${id}`) as { body: unknown }[];
  return r.length ? (JSON.parse(typeof r[0].body === "string" ? (r[0].body as string) : JSON.stringify(r[0].body)) as Instance) : undefined;
};
const dataField = (i: Instance | undefined, fieldId: string): unknown => (i!.data as Record<string, unknown>)[fieldId];
const seedField = async (id: string, fieldId: string, value: number): Promise<void> => {
  await sql`UPDATE instances SET body = jsonb_set(body, ${`{data,${fieldId}}`}::text[], (${[value]}::jsonb) -> 0) WHERE instance_id = ${id}`;
};
const countChildren = async (parentId: string): Promise<number> =>
  Number(((await sql`SELECT count(*) AS n FROM instances WHERE body->'parent'->>'instanceId' = ${parentId}`) as { n: number }[])[0].n);

// The outbox row of the return enqueued for `childId` (action ids are per-child).
const returnRow = async (childId: string): Promise<{ status: string; attempts: number; action: Record<string, unknown> } | undefined> => {
  const r = (await sql`SELECT status, attempts, action FROM outbox WHERE action_id = ${"action_return_" + childId}`) as
    { status: string; attempts: number; action: unknown }[];
  if (!r.length) return undefined;
  const a = r[0].action;
  return { status: r[0].status, attempts: r[0].attempts, action: (typeof a === "string" ? JSON.parse(a) : a) as Record<string, unknown> };
};
// Move an instance to another step without a transition, standing in for whatever
// mechanism relocates a parked parent (migration). Bumps the seq like a real move.
const moveTo = async (id: string, stepId: string): Promise<void> => {
  await sql`UPDATE instances
    SET body = jsonb_set(jsonb_set(body, '{currentStepId}', (${[stepId]}::jsonb) -> 0),
          '{transitionSeq}', (to_jsonb(transition_seq + 1))),
        transition_seq = transition_seq + 1
    WHERE instance_id = ${id}`;
};
// Repoint a child's `parent` link at another step of the same parent.
const relinkChild = async (childId: string, stepId: string): Promise<void> => {
  await sql`UPDATE instances SET body = jsonb_set(body, '{parent,stepId}', (${[stepId]}::jsonb) -> 0)
    WHERE instance_id = ${childId}`;
};

// The subprocess.spawn-enqueued events of one instance, newest-seq last.
const spawnEvents = async (instanceId: string): Promise<{ transitionSeq: number; event: Record<string, unknown> }[]> => {
  const r = (await sql`SELECT transition_seq, event FROM instance_events
    WHERE instance_id = ${instanceId} AND kind = 'subprocess.spawn-enqueued'
    ORDER BY transition_seq`) as { transition_seq: number; event: unknown }[];
  return r.map((x) => ({
    transitionSeq: Number(x.transition_seq),
    event: (typeof x.event === "string" ? JSON.parse(x.event) : x.event) as Record<string, unknown>,
  }));
};
const outboxAt = async (instanceId: string, seq: number): Promise<{ action_id: string; event_id: string | null }[]> =>
  (await sql`SELECT action_id, event_id FROM outbox WHERE instance_id = ${instanceId} AND transition_seq = ${seq}`) as
    { action_id: string; event_id: string | null }[];
const historyAt = async (instanceId: string, seq: number): Promise<Record<string, unknown>[]> => {
  const r = (await sql`SELECT entry FROM history_entries WHERE instance_id = ${instanceId} AND transition_seq = ${seq}`) as
    { entry: unknown }[];
  return r.map((x) => (typeof x.entry === "string" ? JSON.parse(x.entry) : x.entry) as Record<string, unknown>);
};

beforeAll(async () => {
  if (DB) await initSchema();
});

// --- pure: authoring invariant, deterministic ids, contract hash ---------------

test("an authored action using the reserved core. prefix is rejected", () => {
  const withType = (type: string): ProcessBody =>
    ({ key: "k", label: "L", fields: [], workflow: { initialStep: "step_a", steps: [
      { id: "step_a", key: "a", label: "A", type: "task", onEntry: [{ id: "action_x", type, config: {} }], paths: [manualPath("path_ab", "step_b")] },
      { id: "step_b", key: "b", label: "B", type: "task", terminal: true },
    ] } }) as unknown as ProcessBody;
  expect(authoredProcessBody.safeParse(withType("core.spawnSubprocess")).success).toBe(false);
  expect(authoredProcessBody.safeParse(withType("email")).success).toBe(true);
});

test("subprocessChildId is deterministic and varies by coordinate", () => {
  const a = subprocessChildId("inst_p", 1, "step_sub");
  expect(subprocessChildId("inst_p", 1, "step_sub")).toBe(a);
  expect(a.startsWith("inst_")).toBe(true);
  expect(subprocessChildId("inst_p", 2, "step_sub")).not.toBe(a);
  expect(subprocessChildId("inst_p", 1, "step_other")).not.toBe(a);
  expect(subprocessChildId("inst_q", 1, "step_sub")).not.toBe(a);
});

test("contractHash is stable and changes when the contract changes", () => {
  const c1 = { inputFields: ["field_a"], outputFields: ["field_b"], outcomes: ["ok"] };
  expect(contractHash(c1 as never)).toBe(contractHash({ ...c1 } as never));
  expect(contractHash({ ...c1, outcomes: ["ok", "no"] } as never)).not.toBe(contractHash(c1 as never));
});

// --- DB: spawn --------------------------------------------------------------

test.skipIf(!DB)("entering a subprocess step spawns a linked child seeded from inputMapping", async () => {
  const { registry } = engineRegistry();
  const cv = await publishBody(CHILD_PID, childBody());
  const pv = await publishBody(PARENT_PID, parentBody(cv.version));
  const parent = await startInstance(pv.definition, { processId: PARENT_PID, version: pv.version }, actor);
  expect(parent.currentStepId as string).toBe("step_p_sub"); // parked at the subprocess wait-state
  await seedField(parent.instanceId, "field_p_amount", 500);

  await drainOutbox(sql, registry); // spawn only (return is enqueued during this pass)
  const childId = subprocessChildId(parent.instanceId, 1, "step_p_sub");
  const child = await loadInstance(childId);
  expect(child).toBeDefined();
  expect(child!.parent?.instanceId).toBe(parent.instanceId);
  expect(dataField(child, "field_c_amount")).toBe(500); // seeded from parent inputMapping
});

test.skipIf(!DB)("the child outcome and data return to the parent, driving it off the wait-state", async () => {
  const { registry } = engineRegistry();
  const cv = await publishBody(CHILD_PID, childBody());
  const pv = await publishBody(PARENT_PID, parentBody(cv.version));
  const parent = await startInstance(pv.definition, { processId: PARENT_PID, version: pv.version }, actor);
  await seedField(parent.instanceId, "field_p_amount", 500);

  await drainAll(registry); // spawn -> child terminal -> return -> parent advance
  const p = await loadInstance(parent.instanceId);
  expect(p!.status).toBe("completed");
  expect(p!.currentStepId as string).toBe("step_p_approved"); // 500 <= 1000 -> approved
  expect(dataField(p, "field_p_result")).toBe("approved"); // child.outcome
  expect(dataField(p, "field_p_back")).toBe(500); // child.data.amount
});

test.skipIf(!DB)("a rejected child routes the parent down the rejected path", async () => {
  const { registry } = engineRegistry();
  const cv = await publishBody(CHILD_PID, childBody());
  const pv = await publishBody(PARENT_PID, parentBody(cv.version));
  const parent = await startInstance(pv.definition, { processId: PARENT_PID, version: pv.version }, actor);
  await seedField(parent.instanceId, "field_p_amount", 5000); // > 1000 -> rejected

  await drainAll(registry);
  const p = await loadInstance(parent.instanceId);
  expect(p!.currentStepId as string).toBe("step_p_rejected");
  expect(dataField(p, "field_p_result")).toBe("rejected");
});

test.skipIf(!DB)("spawn is idempotent: redelivery creates no second child", async () => {
  const { registry } = engineRegistry();
  const cv = await publishBody(CHILD_PID, childBody());
  const pv = await publishBody(PARENT_PID, parentBody(cv.version));
  const parent = await startInstance(pv.definition, { processId: PARENT_PID, version: pv.version }, actor);
  await seedField(parent.instanceId, "field_p_amount", 500);
  await drainAll(registry);
  // Re-enqueue the same spawn (mimicking an at-least-once redelivery) and drain.
  await sql`INSERT INTO outbox (idempotency_key, instance_id, transition_seq, action_id, action)
    VALUES (${"redeliver_" + parent.instanceId}, ${parent.instanceId}, 1, ${"action_spawn_step_p_sub"},
      ${{ id: "action_spawn_step_p_sub", type: "core.spawnSubprocess", config: { subprocessStepId: "step_p_sub", parentSeq: 1 } }})`;
  await drainAll(registry);
  expect(await countChildren(parent.instanceId)).toBe(1);
});

test.skipIf(!DB)("a spawn whose parent is no longer running creates no child", async () => {
  const { registry, resolveBody } = engineRegistry();
  const cv = await publishBody(CHILD_PID, childBody());
  const pv = await publishBody(PARENT_PID, parentBody(cv.version));
  const parent = await startInstance(pv.definition, { processId: PARENT_PID, version: pv.version }, actor);
  await seedField(parent.instanceId, "field_p_amount", 500);
  // Cancel the parent before the spawn is dispatched.
  const parked = await loadInstance(parent.instanceId);
  await cancelInstance(parked!, pv.definition, actor, sql, resolveBody);
  await drainAll(registry);
  expect(await countChildren(parent.instanceId)).toBe(0);
});

test.skipIf(!DB)("a child returning to a non-running parent applies no writeback", async () => {
  const { registry, resolveBody } = engineRegistry();
  const cv = await publishBody(CHILD_PID, childBody());
  const pv = await publishBody(PARENT_PID, parentBody(cv.version));
  const parent = await startInstance(pv.definition, { processId: PARENT_PID, version: pv.version }, actor);
  await seedField(parent.instanceId, "field_p_amount", 500);
  await drainOutbox(sql, registry); // spawn only: child created + terminal, return enqueued
  // Cancel the parent before the return is dispatched.
  const parked = await loadInstance(parent.instanceId);
  await cancelInstance(parked!, pv.definition, actor, sql, resolveBody);
  await drainAll(registry); // process the pending return
  const p = await loadInstance(parent.instanceId);
  expect(p!.status).toBe("cancelled");
  expect(dataField(p, "field_p_result")).toBeUndefined(); // no writeback onto a cancelled parent
});

// --- DB: the return resolves the parent through the child's live link --------

test.skipIf(!DB)("the return carries no parent step id in its config", async () => {
  const { registry } = engineRegistry();
  const cv = await publishBody(CHILD_PID, childBody());
  const pv = await publishBody(PARENT_PID, parentBody(cv.version));
  const parent = await startInstance(pv.definition, { processId: PARENT_PID, version: pv.version }, actor);
  await seedField(parent.instanceId, "field_p_amount", 500);
  await drainOutbox(sql, registry); // spawn: the child runs to terminal and enqueues its return

  const childId = subprocessChildId(parent.instanceId, 1, "step_p_sub");
  const row = await returnRow(childId);
  expect(row).toBeDefined();
  const config = row!.action.config as Record<string, unknown>;
  expect(config.parentInstanceId).toBe(parent.instanceId);
  expect(config.childOutcome).toBe("approved");
  expect("parentStepId" in config).toBe(false); // the step comes from the child's link, not a snapshot
});

test.skipIf(!DB)("a parent whose linked step changed after enqueue is still found", async () => {
  const { registry } = engineRegistry();
  const P2_PID = "proc_parent_two_sub" as Instance["processId"];
  const cv = await publishBody(CHILD_PID, childBody());
  const pv = await publishBody(P2_PID, twoSubParentBody(cv.version));
  const parent = await startInstance(pv.definition, { processId: P2_PID, version: pv.version }, actor);
  await seedField(parent.instanceId, "field_p_amount", 500);

  // Order is the whole test: enqueue the return FIRST, then move the parent and
  // its link, then deliver. Moving before the enqueue would pass without the fix.
  await drainOutbox(sql, registry); // spawn -> child terminal -> return enqueued
  const childId = subprocessChildId(parent.instanceId, 1, "step_p_sub");
  expect(await returnRow(childId)).toBeDefined();

  await moveTo(parent.instanceId, "step_p_sub2");
  await relinkChild(childId, "step_p_sub2");

  await drainAll(registry);
  const p = await loadInstance(parent.instanceId);
  // Resolved through the UPDATED link: sub2's outputMapping ran, sub2's path taken.
  expect(dataField(p, "field_p_result2")).toBe("approved");
  expect(p!.currentStepId as string).toBe("step_p_done2");
  expect(dataField(p, "field_p_result")).toBeUndefined(); // never the step it had left
});

test.skipIf(!DB)("a parent transition racing the return cannot split the decision", async () => {
  const { registry } = engineRegistry();
  const cv = await publishBody(CHILD_PID, childBody());
  const pv = await publishBody(PARENT_PID, parentBody(cv.version));

  // The split the lock rules out: the writeback lands on the strength of a parked
  // check a concurrent move has already invalidated, and the advance then does not.
  //
  // The move is aimed at exactly that window rather than fired blind — it chases
  // the writeback becoming *observable to another session*, which is the window's
  // own definition. Its one gated UPDATE moves the parent iff the parent is still
  // parked at the subprocess step AND the writeback is already visible. Under one
  // transaction that conjunction is unreachable: nothing is visible until the
  // advance has committed alongside it, so the chaser only ever sees a parent that
  // has already left. A writeback committing on its own makes it reachable, and the
  // advance that follows is then evaluated against a parent that has moved.
  for (let i = 0; i < 10; i++) {
    const parent = await startInstance(pv.definition, { processId: PARENT_PID, version: pv.version }, actor);
    await seedField(parent.instanceId, "field_p_amount", 500);
    await drainOutbox(sql, registry); // spawn -> child terminal -> return enqueued

    let done = false;
    const drain = drainAll(registry).finally(() => { done = true; });
    const chase = (async () => {
      while (!done) {
        const moved = (await sql`UPDATE instances
          SET body = jsonb_set(jsonb_set(body, '{currentStepId}', '"step_p_approved"'::jsonb),
                '{transitionSeq}', to_jsonb(transition_seq + 1)),
              transition_seq = transition_seq + 1
          WHERE instance_id = ${parent.instanceId}
            AND body->>'currentStepId' = 'step_p_sub'
            AND body->'data' ? 'field_p_result'
          RETURNING instance_id`) as unknown[];
        if (moved.length > 0) return;
      }
    })();
    await Promise.all([drain, chase]);

    const p = await loadInstance(parent.instanceId);
    const wroteBack = dataField(p, "field_p_result") !== undefined;
    const advanced = p!.status === "completed";
    // All-or-nothing: the writeback and the advance it justifies stand or fall together.
    expect({ i, wroteBack, advanced }).toEqual({ i, wroteBack: advanced, advanced });
  }
});

test.skipIf(!DB)("a parent that legitimately moved on is a delivered no-op", async () => {
  const { registry } = engineRegistry();
  const cv = await publishBody(CHILD_PID, childBody());
  const pv = await publishBody(PARENT_PID, parentBody(cv.version));
  const parent = await startInstance(pv.definition, { processId: PARENT_PID, version: pv.version }, actor);
  await seedField(parent.instanceId, "field_p_amount", 500);
  await drainOutbox(sql, registry); // return enqueued
  const childId = subprocessChildId(parent.instanceId, 1, "step_p_sub");

  await moveTo(parent.instanceId, "step_p_approved"); // left the subprocess step; link untouched
  await drainAll(registry);

  const p = await loadInstance(parent.instanceId);
  expect(dataField(p, "field_p_result")).toBeUndefined(); // no writeback
  expect(p!.currentStepId as string).toBe("step_p_approved"); // not advanced by the return
  const row = await returnRow(childId);
  expect(row!.status).toBe("delivered"); // a no-op, not a failure — never dead-lettered
});

test.skipIf(!DB)("a parent parked at the linked step where that step is not a subprocess step fails", async () => {
  const { registry } = engineRegistry();
  const cv = await publishBody(CHILD_PID, childBody());
  const pv = await publishBody(PARENT_PID, parentBody(cv.version));
  const parent = await startInstance(pv.definition, { processId: PARENT_PID, version: pv.version }, actor);
  await seedField(parent.instanceId, "field_p_amount", 500);
  await drainOutbox(sql, registry); // return enqueued
  const childId = subprocessChildId(parent.instanceId, 1, "step_p_sub");

  // Parked at the linked step, and that step is not a subprocess step: a
  // contradiction, surfaced rather than swallowed.
  await relinkChild(childId, "step_p_entry");
  await moveTo(parent.instanceId, "step_p_entry");
  await drainOutbox(sql, registry);

  const row = await returnRow(childId);
  expect(row!.status).toBe("pending"); // the throw failed delivery; retried, not delivered
  expect(row!.attempts).toBe(1);
  expect(dataField(await loadInstance(parent.instanceId), "field_p_result")).toBeUndefined();

  // This row can never succeed by construction, so every later drain in this file
  // would retry it until it dead-letters. Drop it: the suite shares one database
  // and does not truncate, and a permanently-failing row is the test leaking into
  // its neighbours rather than an artefact worth keeping.
  await sql`DELETE FROM outbox WHERE action_id = ${"action_return_" + childId}`;
});

test.skipIf(!DB)("a child with no parent link is a no-op, not a failure", async () => {
  const { registry } = engineRegistry();
  const cv = await publishBody(CHILD_PID, childBody());
  const pv = await publishBody(PARENT_PID, parentBody(cv.version));
  const parent = await startInstance(pv.definition, { processId: PARENT_PID, version: pv.version }, actor);
  await seedField(parent.instanceId, "field_p_amount", 500);
  await drainOutbox(sql, registry); // return enqueued
  const childId = subprocessChildId(parent.instanceId, 1, "step_p_sub");

  await sql`UPDATE instances SET body = body - 'parent' WHERE instance_id = ${childId}`;
  await drainAll(registry);

  const row = await returnRow(childId);
  expect(row!.status).toBe("delivered"); // no link to resolve: nothing written, nothing thrown
  const p = await loadInstance(parent.instanceId);
  expect(dataField(p, "field_p_result")).toBeUndefined();
  expect(p!.currentStepId as string).toBe("step_p_sub"); // still parked
});

// --- DB: cancel cascade ------------------------------------------------------

test.skipIf(!DB)("parent cancel cascades to an active child and a nested grandchild", async () => {
  const { registry, resolveBody } = engineRegistry();
  const W_PID = "proc_waiting" as Instance["processId"];
  const P_PID = "proc_caller" as Instance["processId"];
  const GP_PID = "proc_gp" as Instance["processId"];
  const wv = await publishBody(W_PID, waitingChildBody());
  const pv = await publishBody(P_PID, callerBody("caller", W_PID, wv.version));
  const gv = await publishBody(GP_PID, callerBody("gp", P_PID, pv.version));

  const gp = await startInstance(gv.definition, { processId: GP_PID, version: gv.version }, actor);
  await drainAll(registry); // spawn P, then spawn W; both stay running (P parked, W at manual step)

  const pId = subprocessChildId(gp.instanceId, 1, "step_sub");
  const wId = subprocessChildId(pId, 1, "step_sub");
  expect((await loadInstance(pId))!.status).toBe("running");
  expect((await loadInstance(wId))!.status).toBe("running");

  await cancelInstance(gp, gv.definition, actor, sql, resolveBody);
  expect((await loadInstance(gp.instanceId))!.status).toBe("cancelled");
  expect((await loadInstance(pId))!.status).toBe("cancelled"); // cascaded
  expect((await loadInstance(wId))!.status).toBe("cancelled"); // recursively cascaded
});

test.skipIf(!DB)("cancelling an instance with no children touches only that instance", async () => {
  const { resolveBody } = engineRegistry();
  const cv = await publishBody(CHILD_PID, childBody());
  const pv = await publishBody(PARENT_PID, parentBody(cv.version));
  const parent = await startInstance(pv.definition, { processId: PARENT_PID, version: pv.version }, actor);
  // No spawn drained -> no children exist.
  await cancelInstance(parent, pv.definition, actor, sql, resolveBody);
  expect((await loadInstance(parent.instanceId))!.status).toBe("cancelled");
  expect(await countChildren(parent.instanceId)).toBe(0);
});

// --- DB: latest-at-spawn resolution -----------------------------------------

test.skipIf(!DB)("latest-at-spawn spawns the newest version matching contractRef", async () => {
  const { registry } = engineRegistry();
  const CHILD_LV_PID = "proc_child_lv" as Instance["processId"];
  const PARENT_LV_PID = "proc_parent_lv" as Instance["processId"];
  const v1 = await publishBody(CHILD_LV_PID, childBodyV(["field_c_amount"], "A")); // contract A
  const v2 = await publishBody(CHILD_LV_PID, childBodyV([], "B")); // contract B (different signature)
  const v3 = await publishBody(CHILD_LV_PID, childBodyV(["field_c_amount"], "C")); // contract A again, newer body
  expect([v1.version, v2.version, v3.version]).toEqual([1, 2, 3]);

  const contractRef = contractHash(v1.definition.contract!); // hash of the compiled (published) contract A
  const pv = await publishBody(PARENT_LV_PID, parentLatestBody(CHILD_LV_PID, contractRef));
  const parent = await startInstance(pv.definition, { processId: PARENT_LV_PID, version: pv.version }, actor);
  await seedField(parent.instanceId, "field_p_amount", 500);
  await drainOutbox(sql, registry); // spawn

  const child = await loadInstance(subprocessChildId(parent.instanceId, 1, "step_p_sub"));
  expect(child!.version).toBe(3); // newest version whose contract signature matches; v2 (different) skipped
  expect(dataField(child, "field_c_amount")).toBe(500); // resolved-and-seeded via the latest-at-spawn path
});

// --- DB: independently cancelled child returns the reserved outcome ----------

test.skipIf(!DB)("an independently cancelled child returns child.outcome == cancelled to the still-running parent", async () => {
  const { registry } = engineRegistry();
  const W_PID = "proc_waiting2" as Instance["processId"];
  const P_PID = "proc_ca_parent" as Instance["processId"];
  const wv = await publishBody(W_PID, waitingChildBody());
  const pv = await publishBody(P_PID, cancelAwareParent(W_PID, wv.version));
  const parent = await startInstance(pv.definition, { processId: P_PID, version: pv.version }, actor);
  await drainAll(registry); // spawn the waiting child; it parks at its manual step (no return)

  const child = await loadInstance(subprocessChildId(parent.instanceId, 1, "step_ca_sub"));
  expect(child!.status).toBe("running");

  // Cancel the CHILD independently (no resolveBody -> no cascade).
  await cancelInstance(child!, wv.definition, actor, sql);
  // Suggestion 3: an independent child cancel does not propagate upward — the parent stays running.
  expect((await loadInstance(parent.instanceId))!.status).toBe("running");

  await drainAll(registry); // the child's cancel enqueued a return carrying childOutcome "cancelled"
  const p = await loadInstance(parent.instanceId);
  expect(p!.currentStepId as string).toBe("step_ca_cancelled"); // parent guarded on child.outcome == "cancelled"
  expect(dataField(p, "field_ca_seen")).toBe("cancelled"); // reserved outcome written back via outputMapping
});

// --- DB: creation at a subprocess initial step -------------------------------

const SI_PID = "proc_parent_sub_initial" as Instance["processId"];

test.skipIf(!DB)("creating an instance on a subprocess initial step spawns a linked child", async () => {
  const { registry } = engineRegistry();
  const cv = await publishBody(CHILD_PID, childBody());
  const pv = await publishBody(SI_PID, subInitialParentBody(cv.version));
  const parent = await startInstance(pv.definition, { processId: SI_PID, version: pv.version }, actor);
  // Creation is not a transition: the wait-state is where the instance rests, at seq 0.
  expect(parent.currentStepId as string).toBe("step_p_sub");
  expect(parent.transitionSeq).toBe(0);
  await seedField(parent.instanceId, "field_p_amount", 500);

  await drainOutbox(sql, registry); // spawn only
  // The coordinates are the ordinary ones with the sequence being 0.
  const child = await loadInstance(subprocessChildId(parent.instanceId, 0, "step_p_sub"));
  expect(child).toBeDefined();
  expect(child!.parent).toEqual({ instanceId: parent.instanceId, stepId: "step_p_sub" as Instance["currentStepId"] });
  expect(dataField(child, "field_c_amount")).toBe(500); // seeded from the step's inputMapping
  expect((await loadInstance(parent.instanceId))!.transitionSeq).toBe(0); // still parked where it was created
});

test.skipIf(!DB)("the child's return drives a parent parked at its initial step", async () => {
  const { registry } = engineRegistry();
  const cv = await publishBody(CHILD_PID, childBody());
  const pv = await publishBody(SI_PID, subInitialParentBody(cv.version));
  const parent = await startInstance(pv.definition, { processId: SI_PID, version: pv.version }, actor);
  await seedField(parent.instanceId, "field_p_amount", 500);

  await drainAll(registry); // spawn -> child terminal -> return -> parent advance from seq 0
  const p = await loadInstance(parent.instanceId);
  expect(p!.currentStepId as string).toBe("step_p_approved"); // guarded on child.outcome
  expect(p!.status).toBe("completed");
  expect(dataField(p, "field_p_result")).toBe("approved"); // outputMapping writeback landed
  expect(dataField(p, "field_p_back")).toBe(500);
});

test.skipIf(!DB)("the creation-enqueued spawn's outcome attaches to its event, not to a HistoryEntry", async () => {
  const { registry } = engineRegistry();
  const cv = await publishBody(CHILD_PID, childBody());
  const pv = await publishBody(SI_PID, subInitialParentBody(cv.version));
  const parent = await startInstance(pv.definition, { processId: SI_PID, version: pv.version }, actor);
  await seedField(parent.instanceId, "field_p_amount", 500);

  // The event exists at creation, before any delivery, and names the step.
  const [before] = await spawnEvents(parent.instanceId);
  expect(before.transitionSeq).toBe(0);
  expect(before.event.payload).toEqual({ stepId: "step_p_sub" });
  expect(before.event.version).toBe(pv.version);
  // The outbox row is named by that event, which is what routes the outcome.
  const rows = await outboxAt(parent.instanceId, 0);
  expect(rows).toHaveLength(1);
  expect(rows[0].action_id).toBe("action_spawn_step_p_sub");
  expect(rows[0].event_id).toBe(before.event.id as string);

  await drainOutbox(sql, registry);
  const [after] = await spawnEvents(parent.instanceId);
  const outcomes = after.event.actions as Record<string, unknown>[];
  expect(outcomes).toHaveLength(1);
  expect(outcomes[0].actionId).toBe("action_spawn_step_p_sub");
  expect(outcomes[0].resolvedHandler).toBe("core.spawnSubprocess");
  expect(outcomes[0].status).toBe("succeeded");
  // Creation writes no transition record, so there is nothing at seq 0 the
  // outcome could have been misfiled onto (and none is created by the delivery).
  expect(await historyAt(parent.instanceId, 0)).toHaveLength(0);
});

test.skipIf(!DB)("a transition-entered spawn keeps attaching its outcome to the HistoryEntry", async () => {
  const { registry } = engineRegistry();
  const cv = await publishBody(CHILD_PID, childBody());
  const pv = await publishBody(PARENT_PID, parentBody(cv.version));
  const parent = await startInstance(pv.definition, { processId: PARENT_PID, version: pv.version }, actor);
  await seedField(parent.instanceId, "field_p_amount", 500);
  await drainOutbox(sql, registry); // spawn (enqueued by the seq-1 transition)

  const [entry] = await historyAt(parent.instanceId, 1);
  const outcomes = entry.actions as Record<string, unknown>[];
  expect(outcomes.map((o) => o.actionId)).toContain("action_spawn_step_p_sub");
  expect(await spawnEvents(parent.instanceId)).toHaveLength(0); // the event is creation-only
});

test.skipIf(!DB)("a creation that inserted no row enqueues nothing and records nothing", async () => {
  const cv = await publishBody(CHILD_PID, childBody());
  const pv = await publishBody(SI_PID, subInitialParentBody(cv.version));
  // Re-running createInstance for an existing id is what a redelivered spawn of
  // this instance does; the RETURNING guard must cover the spawn row and the
  // event exactly as it covers the timer events.
  const id = subprocessChildId("inst_redeliver_probe", 0, "step_p_sub");
  const opts = { processId: SI_PID, version: pv.version, instanceId: id };
  await createInstance(pv.definition, opts);
  await createInstance(pv.definition, opts);

  expect(await spawnEvents(id)).toHaveLength(1);
  expect(await outboxAt(id, 0)).toHaveLength(1);
});

test.skipIf(!DB)("a redelivered creation-enqueued spawn creates no second child", async () => {
  const { registry } = engineRegistry();
  const cv = await publishBody(CHILD_PID, childBody());
  const pv = await publishBody(SI_PID, subInitialParentBody(cv.version));
  const parent = await startInstance(pv.definition, { processId: SI_PID, version: pv.version }, actor);
  await seedField(parent.instanceId, "field_p_amount", 500);
  await drainAll(registry);
  // Mimic at-least-once redelivery: the same action under a fresh key.
  await sql`INSERT INTO outbox (idempotency_key, instance_id, transition_seq, action_id, action)
    VALUES (${"redeliver_si_" + parent.instanceId}, ${parent.instanceId}, 0, ${"action_spawn_step_p_sub"},
      ${{ id: "action_spawn_step_p_sub", type: "core.spawnSubprocess", config: { subprocessStepId: "step_p_sub", parentSeq: 0 } }})`;
  await drainAll(registry);
  expect(await countChildren(parent.instanceId)).toBe(1);
});

test.skipIf(!DB)("a nested initial-step chain spawns a grandchild and returns upward", async () => {
  const { registry } = engineRegistry();
  const MID_PID = "proc_si_mid" as Instance["processId"];
  const TOP_PID = "proc_si_top" as Instance["processId"];
  const lv = await publishBody(CHILD_PID, childBody());
  const mv = await publishBody(MID_PID, subInitialCallerBody("si_mid", CHILD_PID, lv.version));
  const tv = await publishBody(TOP_PID, subInitialCallerBody("si_top", MID_PID, mv.version));

  const top = await startInstance(tv.definition, { processId: TOP_PID, version: tv.version }, actor);
  expect(top.currentStepId as string).toBe("step_sub");
  await drainAll(registry); // top's spawn -> mid created at ITS subprocess initial step -> mid's spawn -> ...

  const midId = subprocessChildId(top.instanceId, 0, "step_sub");
  const leafId = subprocessChildId(midId, 0, "step_sub");
  const [mid, leaf] = [await loadInstance(midId), await loadInstance(leafId)];
  expect(leaf).toBeDefined(); // the grandchild the mid's own creation enqueued
  expect(leaf!.parent?.instanceId as string).toBe(midId);
  // Each return propagates upward through the ordinary return path.
  expect(mid!.currentStepId as string).toBe("step_approved");
  expect(mid!.status).toBe("completed");
  const t = await loadInstance(top.instanceId);
  expect(t!.currentStepId as string).toBe("step_approved");
  expect(t!.status).toBe("completed");
});

test.skipIf(!DB)("a creation-enqueued spawn whose parent was cancelled creates no child", async () => {
  const { registry, resolveBody } = engineRegistry();
  const cv = await publishBody(CHILD_PID, childBody());
  const pv = await publishBody(SI_PID, subInitialParentBody(cv.version));
  const parent = await startInstance(pv.definition, { processId: SI_PID, version: pv.version }, actor);
  await cancelInstance(parent, pv.definition, actor, sql, resolveBody);

  await drainAll(registry);
  expect(await countChildren(parent.instanceId)).toBe(0);
  expect((await loadInstance(parent.instanceId))!.status).toBe("cancelled");
});

test.skipIf(!DB)("an ordinary creation enqueues nothing and records no spawn event", async () => {
  const cv = await publishBody(CHILD_PID, childBody());
  const pv = await publishBody(PARENT_PID, parentBody(cv.version));
  // createInstance rather than startInstance: the run-to-rest cascade legitimately
  // enqueues a spawn at seq 1, which would mask what this asserts about creation.
  const inst = await createInstance(pv.definition, { processId: PARENT_PID, version: pv.version });
  expect(inst.currentStepId as string).toBe("step_p_entry"); // not a subprocess step
  expect(await spawnEvents(inst.instanceId)).toHaveLength(0);
  expect(await outboxAt(inst.instanceId, 0)).toHaveLength(0);
});
