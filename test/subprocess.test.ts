/**
 * Subprocess execution: spawn on entry to a subprocess step, return of the
 * child's outcome/data to the parked parent, idempotent spawn, and downward
 * cancel propagation. DB-backed cases hit Postgres and skip when DATABASE_URL is
 * unset (a skip is visible, a false green is not). Pure cases (schema invariant,
 * deterministic ids, contract hash) always run.
 */
import { test, expect, beforeAll } from "bun:test";
import { sql, initSchema } from "../src/engine/store.js";
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
