/**
 * The child a parked parent awaits (`Instance.awaitedChild`) and the third
 * engine-internal handler, `core.cancelSubprocessChild`, which cancels that
 * child once a commit leaves the subprocess step. Every parent here is built
 * through the engine (startInstance, the spawn handler, drainOutbox); the
 * handler is invoked directly where a test needs its thrown error, since
 * drainOutbox folds a throw into the row's `last_error`. DB cases skip when
 * DATABASE_URL is unset. Like test/subprocess.test.ts, this file truncates
 * nothing and publishes each case under its own process ids.
 */
import { test, expect, beforeAll } from "bun:test";
import { sql, initSchema, parseInstance } from "../src/engine/store.js";
import {
  startInstance,
  cancelInstance,
  executeManualTransition,
  ConcurrencyConflict,
  CANCEL_CHILD_ACTION_TYPE,
} from "../src/engine/transition.js";
import { publishBody, createDefinitionStore } from "../src/engine/definitions.js";
import { registerSubprocessHandlers } from "../src/engine/subprocess.js";
import { drainOutbox } from "../src/engine/outbox.js";
import { subprocessChildId } from "../src/engine/idempotency.js";
import { compileProcessBody, CompileValidationError } from "../src/schema/compile.js";
import { SYSTEM_ACTOR, type Actor } from "../src/cel/eval.js";
import type { ProcessBody, Instance } from "../src/schema/definition.js";
import type { Registry as Reg, DataSourceRegistry, HandlerContext } from "../src/engine/registry.js";
import type { ResolveBody } from "../src/engine/resolution.js";

const DB = !!process.env.DATABASE_URL;
const actor: Actor = { id: "user_1", roles: [] };
const dataSourceReg: DataSourceRegistry = new Map();
// Publish-time registry: the waiting child's onCancel names this no-op type.
const publishRegistry: Reg = new Map([["test.noop", { handler: async () => ({}) }]]);

const cel = (src: string) => ({ lang: "cel", src });
const autoPath = (id: string, to: string, priority?: number, guardSrc?: string) =>
  ({ id, key: id, label: `Path ${id}`, to, trigger: "automatic", ...(priority !== undefined ? { priority } : {}), ...(guardSrc ? { guard: cel(guardSrc) } : {}) });
const manualPath = (id: string, to: string) => ({ id, key: id, label: `Path ${id}`, to, trigger: "manual" });

// A child that parks at a manual step until something moves or cancels it. Its
// wait step declares an onCancel action, so a cancellation is observable on
// the outbox.
const waitingChildBody = (over: Record<string, unknown> = {}): ProcessBody =>
  ({
    key: "waiting", baseLocale: "en", label: { en: "Waiting" },
    contract: { outcomes: ["done"] },
    fields: [],
    workflow: {
      initialStep: "step_w_wait",
      steps: [
        { id: "step_w_wait", key: "w_wait", label: { en: "Wait" }, type: "task",
          onCancel: [{ id: "action_w_on_cancel", type: "test.noop", config: {} }],
          paths: [manualPath("path_w_done", "step_w_done")] },
        { id: "step_w_done", key: "w_done", label: { en: "Done" }, type: "task", terminal: true, outcome: "done" },
      ],
    },
    ...over,
  }) as unknown as ProcessBody;

// A child that ends at once with a fixed outcome.
const fixedChildBody = (outcome: "approved" | "rejected"): ProcessBody =>
  ({
    key: `fixed_${outcome}`, baseLocale: "en", label: { en: "Fixed" },
    contract: { outcomes: [outcome] },
    fields: [],
    workflow: {
      initialStep: "step_f_go",
      steps: [
        { id: "step_f_go", key: "f_go", label: { en: "Go" }, type: "task", paths: [autoPath("path_f_end", "step_f_end")] },
        { id: "step_f_end", key: "f_end", label: { en: "End" }, type: "task", terminal: true, outcome },
      ],
    },
  }) as unknown as ProcessBody;

// entry (automatic) -> subprocess step -> terminal outcomes. Contracted, so it
// can itself be a child. The subprocess step's guards read `child`, so the
// cascade parks the parent there until the return.
const callerBody = (key: string, childPid: string, childVersion: number, guardedOutcomes: string[] = ["approved", "rejected"]): ProcessBody =>
  ({
    key, baseLocale: "en", label: { en: key },
    contract: { outcomes: ["approved", "rejected"] },
    fields: [{ id: "field_seen", key: "seen", label: { en: "Seen" }, type: "string" }],
    workflow: {
      initialStep: "step_entry",
      steps: [
        { id: "step_entry", key: "entry", label: { en: "Entry" }, type: "task", paths: [autoPath("path_sub", "step_sub")] },
        { id: "step_sub", key: "sub", label: { en: "Sub" }, type: "subprocess",
          subprocess: { processId: childPid, versionBinding: "pinned", pinnedVersion: childVersion, inputMapping: {}, outputMapping: { field_seen: cel("child.outcome") } },
          paths: guardedOutcomes.map((o, n) => autoPath(`path_${o}`, `step_${o}`, n + 1, `child.outcome == "${o}"`)) },
        { id: "step_approved", key: "approved", label: { en: "Approved" }, type: "task", terminal: true, outcome: "approved" },
        { id: "step_rejected", key: "rejected", label: { en: "Rejected" }, type: "task", terminal: true, outcome: "rejected" },
      ],
    },
  }) as unknown as ProcessBody;

function engineRegistry(resolveBodyOverride?: (real: ResolveBody) => ResolveBody): { registry: Reg; resolveBody: ResolveBody } {
  const store = createDefinitionStore(sql);
  const resolveBody = resolveBodyOverride ? resolveBodyOverride(store.resolveBody) : store.resolveBody;
  // Carries test.noop too: drainOutbox claims every due row, the onCancel rows
  // of earlier cases included.
  const registry: Reg = new Map(publishRegistry);
  registerSubprocessHandlers(registry, sql, resolveBody, store.resolveLatestByContract);
  return { registry, resolveBody: store.resolveBody };
}

async function drainAll(registry: Reg): Promise<void> {
  while ((await drainOutbox(sql, registry)) > 0) { /* a spawn enqueues a return or a nested spawn */ }
}

const loadInstance = async (id: string): Promise<Instance | undefined> => {
  const r = (await sql`SELECT body FROM instances WHERE instance_id = ${id}`) as { body: unknown }[];
  return r.length ? parseInstance(r[0]!.body) : undefined;
};
const cancelSweepState = async (id: string): Promise<string> =>
  ((await sql`SELECT cancel_sweep_state FROM instances WHERE instance_id = ${id}`) as { cancel_sweep_state: string }[])[0]!.cancel_sweep_state;
const outboxActionIds = async (instanceId: string): Promise<string[]> =>
  ((await sql`SELECT action_id FROM outbox WHERE instance_id = ${instanceId} ORDER BY action_id`) as { action_id: string }[]).map((r) => r.action_id);

// Everything the handler could write: every instance row with its state
// columns, every outbox row's status, and the record tables' sizes.
async function snapshot(): Promise<unknown> {
  const instances = await sql`SELECT instance_id, transition_seq, body, resolve_state, cancel_sweep_state FROM instances ORDER BY instance_id`;
  const outbox = await sql`SELECT idempotency_key, status FROM outbox ORDER BY idempotency_key`;
  const counts = await sql`SELECT (SELECT count(*) FROM history_entries) AS history, (SELECT count(*) FROM instance_events) AS events`;
  return JSON.parse(JSON.stringify({ instances, outbox, counts }));
}

function cancelCtx(parentId: string, childId: string): HandlerContext {
  return {
    action: { id: "action_cancel_awaited_child", type: CANCEL_CHILD_ACTION_TYPE, config: { childId } } as unknown as HandlerContext["action"],
    config: { childId },
    idempotencyKey: `test-cancel-${childId}`,
    instanceId: parentId,
    db: sql,
  };
}
const cancelHandler = (registry: Reg) => registry.get(CANCEL_CHILD_ACTION_TYPE)!.handler;

/** A parent parked on its subprocess step over a running waiting child, built through the engine. */
async function parkedOverWaitingChild(tag: string, childOver: Record<string, unknown> = {}) {
  const W_PID = `proc_cc_${tag}_w` as Instance["processId"];
  const P_PID = `proc_cc_${tag}_p` as Instance["processId"];
  const wv = await publishBody(W_PID, waitingChildBody(childOver), publishRegistry, dataSourceReg);
  const pv = await publishBody(P_PID, callerBody(`cc_${tag}_p`, W_PID, wv.version), publishRegistry, dataSourceReg);
  const { registry } = engineRegistry();
  const parent = await startInstance(pv.definition, { processId: P_PID, version: pv.version }, actor);
  await drainAll(registry); // spawns the child, which parks at its manual step
  const childId = subprocessChildId(parent.instanceId, 1, "step_sub");
  return { W_PID, P_PID, wv, pv, registry, parent, childId };
}

/** grandparent -> parent -> waiting grandchild, every link spawned through the engine. */
async function threeLevelChain(tag: string) {
  const W_PID = `proc_cc_${tag}_w` as Instance["processId"];
  const P_PID = `proc_cc_${tag}_p` as Instance["processId"];
  const G_PID = `proc_cc_${tag}_g` as Instance["processId"];
  const wv = await publishBody(W_PID, waitingChildBody(), publishRegistry, dataSourceReg);
  const pv = await publishBody(P_PID, callerBody(`cc_${tag}_p`, W_PID, wv.version), publishRegistry, dataSourceReg);
  const gv = await publishBody(G_PID, callerBody(`cc_${tag}_g`, P_PID, pv.version), publishRegistry, dataSourceReg);
  const { registry } = engineRegistry();
  const grandparent = await startInstance(gv.definition, { processId: G_PID, version: gv.version }, actor);
  await drainAll(registry);
  const pId = subprocessChildId(grandparent.instanceId, 1, "step_sub");
  const wId = subprocessChildId(pId, 1, "step_sub");
  return { W_PID, pv, grandparent, pId, wId };
}

beforeAll(async () => {
  if (DB) await initSchema();
});

// --- pure ---------------------------------------------------------------------

test("parseInstance keeps awaitedChild, including an explicit null", () => {
  const base = {
    instanceId: "inst_p", processId: "proc_p", version: 1, definitionHash: "h", currentStepId: "step_sub",
    transitionSeq: 1, data: {}, status: "running", startedAt: "2026-01-01T00:00:00.000Z",
  };
  expect(parseInstance({ ...base, awaitedChild: "inst_child" }).awaitedChild as string).toBe("inst_child");
  expect(parseInstance({ ...base, awaitedChild: null }).awaitedChild).toBeNull();
  expect(parseInstance(base).awaitedChild).toBeUndefined();
  expect(() => parseInstance({ ...base, awaitedChild: "not-an-instance-id" })).toThrow();
});

test("an authored action of the cancel type fails to compile, and so to publish", () => {
  const body = {
    key: "k", baseLocale: "en", label: { en: "L" }, fields: [], workflow: { initialStep: "step_a", steps: [
      { id: "step_a", key: "a", label: { en: "A" }, type: "task",
        onEntry: [{ id: "action_x", type: "core.cancelSubprocessChild", config: { childId: "inst_victim" } }],
        paths: [manualPath("path_ab", "step_b")] },
      { id: "step_b", key: "b", label: { en: "B" }, type: "task", terminal: true },
    ] },
  } as unknown as ProcessBody;
  expect(() => compileProcessBody(body)).toThrow(CompileValidationError);
});

test("a tenant registry holds three core. handlers, each with a config schema", () => {
  // host.ts::tenantContexts builds every tenant's registry with this call.
  const registry: Reg = new Map();
  registerSubprocessHandlers(registry, sql, async () => undefined, async () => undefined);
  const core = [...registry.keys()].filter((k) => k.startsWith("core.")).sort();
  expect(core).toEqual(["core.cancelSubprocessChild", "core.returnSubprocess", "core.spawnSubprocess"]);
  for (const k of core) expect(registry.get(k)!.configSchema).toBeDefined();
});

// --- DB: the parent records the awaited child -----------------------------------

test.skipIf(!DB)("a parent parked by the engine awaits the child its spawn creates", async () => {
  const { parent, childId } = await parkedOverWaitingChild("awaits");
  const stored = await loadInstance(parent.instanceId);
  expect(stored!.currentStepId as string).toBe("step_sub");
  expect(stored!.awaitedChild as string).toBe(childId);
  expect((await loadInstance(childId))!.parent?.instanceId as string).toBe(parent.instanceId);
});

// --- DB: the handler leaves alone what it does not own ----------------------------

test.skipIf(!DB)("a missing child: the handler does nothing", async () => {
  // The spawn is still queued, so the awaited child does not exist yet.
  const W_PID = "proc_cc_missing_w" as Instance["processId"];
  const P_PID = "proc_cc_missing_p" as Instance["processId"];
  const wv = await publishBody(W_PID, waitingChildBody(), publishRegistry, dataSourceReg);
  const pv = await publishBody(P_PID, callerBody("cc_missing_p", W_PID, wv.version), publishRegistry, dataSourceReg);
  const { registry } = engineRegistry();
  const parent = await startInstance(pv.definition, { processId: P_PID, version: pv.version }, actor);
  const childId = parent.awaitedChild as string;
  expect(await loadInstance(childId)).toBeUndefined();

  const before = await snapshot();
  expect(await cancelHandler(registry)(cancelCtx(parent.instanceId, childId))).toEqual({});
  expect(await snapshot()).toEqual(before);
});

test.skipIf(!DB)("a terminal child: the handler does nothing", async () => {
  const { registry, wv, parent, childId } = await parkedOverWaitingChild("terminal");
  // The child finishes on its own before the cancellation arrives.
  const child = await loadInstance(childId);
  await executeManualTransition(child!, "path_w_done", wv.definition, actor);
  expect((await loadInstance(childId))!.status).toBe("completed");

  let before = await snapshot();
  expect(await cancelHandler(registry)(cancelCtx(parent.instanceId, childId))).toEqual({});
  expect(await snapshot()).toEqual(before);
  // A terminal child is not even resolved: an unresolvable body does not throw.
  const { registry: blind } = engineRegistry(() => async () => undefined);
  expect(await cancelHandler(blind)(cancelCtx(parent.instanceId, childId))).toEqual({});

  // A faulted child is terminal for this purpose too. The engine faults an
  // instance only on a cascade loop, so the status is set directly.
  await sql`UPDATE instances SET body = jsonb_set(body, '{status}', '"faulted"'::jsonb) WHERE instance_id = ${childId}`;
  before = await snapshot();
  expect(await cancelHandler(registry)(cancelCtx(parent.instanceId, childId))).toEqual({});
  expect(await snapshot()).toEqual(before);
});

test.skipIf(!DB)("a foreign child: the handler does not cancel an instance another parent owns", async () => {
  const a = await parkedOverWaitingChild("foreign_a");
  const b = await parkedOverWaitingChild("foreign_b");

  const before = await snapshot();
  // A row on parent A naming parent B's child.
  expect(await cancelHandler(a.registry)(cancelCtx(a.parent.instanceId, b.childId))).toEqual({});
  expect(await snapshot()).toEqual(before);
  expect((await loadInstance(b.childId))!.status).toBe("running");
});

test.skipIf(!DB)("a parentless child: the handler does not cancel a top-level instance", async () => {
  const a = await parkedOverWaitingChild("parentless");
  const topLevel = await startInstance(a.wv.definition, { processId: a.W_PID, version: a.wv.version }, actor);
  expect(topLevel.parent).toBeUndefined();

  const before = await snapshot();
  expect(await cancelHandler(a.registry)(cancelCtx(a.parent.instanceId, topLevel.instanceId))).toEqual({});
  expect(await snapshot()).toEqual(before);
  expect((await loadInstance(topLevel.instanceId))!.status).toBe("running");
});

// --- DB: the handler cancels the awaited child -------------------------------------

test.skipIf(!DB)("a running child is cancelled and its onCancel actions run", async () => {
  const { registry, childId, parent } = await parkedOverWaitingChild("running");

  expect(await cancelHandler(registry)(cancelCtx(parent.instanceId, childId))).toEqual({});
  const child = await loadInstance(childId);
  expect(child!.status).toBe("cancelled");
  expect(await cancelSweepState(childId)).toBe("done");
  expect(await outboxActionIds(childId)).toContain("action_w_on_cancel");
});

test.skipIf(!DB)("the child's own cancellable: false does not block the handler", async () => {
  const { registry, childId, parent } = await parkedOverWaitingChild("not_cancellable", { cancellable: false });

  expect(await cancelHandler(registry)(cancelCtx(parent.instanceId, childId))).toEqual({});
  expect((await loadInstance(childId))!.status).toBe("cancelled");
});

test.skipIf(!DB)("a running child cascades the cancellation to its own running child", async () => {
  const { grandparent, pId, wId } = await threeLevelChain("cascade");
  const { registry } = engineRegistry();

  expect(await cancelHandler(registry)(cancelCtx(grandparent.instanceId, pId))).toEqual({});
  expect((await loadInstance(pId))!.status).toBe("cancelled");
  expect((await loadInstance(wId))!.status).toBe("cancelled");
});

// --- DB: every failure retries ---------------------------------------------------

test.skipIf(!DB)("a concurrent commit of the child throws, and the retry sees the child's new state", async () => {
  const { wv, W_PID, childId, parent } = await parkedOverWaitingChild("conflict");
  // The child's own commit lands between the handler's read and its cancel commit.
  let armed = true;
  const { registry: racing } = engineRegistry((real) => async (pid, ver) => {
    if (armed && pid === W_PID) {
      armed = false;
      await executeManualTransition((await loadInstance(childId))!, "path_w_done", wv.definition, actor);
    }
    return real(pid, ver);
  });

  await expect(cancelHandler(racing)(cancelCtx(parent.instanceId, childId))).rejects.toBeInstanceOf(ConcurrencyConflict);
  expect((await loadInstance(childId))!.status).toBe("completed"); // the child's commit won

  const { registry } = engineRegistry();
  const before = await snapshot();
  expect(await cancelHandler(registry)(cancelCtx(parent.instanceId, childId))).toEqual({});
  expect(await snapshot()).toEqual(before); // the retry finds a terminal child
});

test.skipIf(!DB)("an unresolvable child body throws and changes nothing", async () => {
  const { W_PID, childId, parent } = await parkedOverWaitingChild("unresolvable");
  const { registry: blind } = engineRegistry((real) => async (pid, ver) => (pid === W_PID ? undefined : real(pid, ver)));

  const before = await snapshot();
  await expect(cancelHandler(blind)(cancelCtx(parent.instanceId, childId))).rejects.toThrow(/child body unresolved/);
  expect(await snapshot()).toEqual(before);
  expect((await loadInstance(childId))!.status).toBe("running");
});

test.skipIf(!DB)("a cancelled child with a running grandchild: the handler resumes the sweep", async () => {
  const { pv, grandparent, pId, wId } = await threeLevelChain("resume");
  // The child was cancelled without its sweep, leaving the grandchild running.
  await cancelInstance((await loadInstance(pId))!, pv.definition, SYSTEM_ACTOR, sql);
  expect((await loadInstance(pId))!.status).toBe("cancelled");
  expect(await cancelSweepState(pId)).toBe("pending");
  expect((await loadInstance(wId))!.status).toBe("running");

  const { registry } = engineRegistry();
  expect(await cancelHandler(registry)(cancelCtx(grandparent.instanceId, pId))).toEqual({});
  expect((await loadInstance(wId))!.status).toBe("cancelled");
  expect(await cancelSweepState(pId)).toBe("done");
});

test.skipIf(!DB)("a grandchild whose cancel fails leaves the sweep pending, so the handler throws until it completes", async () => {
  const { W_PID, grandparent, pId, wId } = await threeLevelChain("sweep_fails");
  const { registry: blindToGrandchild } = engineRegistry((real) => async (pid, ver) => (pid === W_PID ? undefined : real(pid, ver)));

  await expect(cancelHandler(blindToGrandchild)(cancelCtx(grandparent.instanceId, pId))).rejects.toThrow(/incomplete/);
  expect((await loadInstance(pId))!.status).toBe("cancelled");
  expect(await cancelSweepState(pId)).toBe("pending");
  expect((await loadInstance(wId))!.status).toBe("running");

  const { registry } = engineRegistry();
  expect(await cancelHandler(registry)(cancelCtx(grandparent.instanceId, pId))).toEqual({});
  expect((await loadInstance(wId))!.status).toBe("cancelled");
  expect(await cancelSweepState(pId)).toBe("done");
});

// --- DB: the return clears the awaited child ----------------------------------------

async function returnedParent(tag: string, outcome: "approved" | "rejected") {
  const C_PID = `proc_cc_${tag}_c` as Instance["processId"];
  const P_PID = `proc_cc_${tag}_p` as Instance["processId"];
  const cv = await publishBody(C_PID, fixedChildBody(outcome), publishRegistry, dataSourceReg);
  // The parent guards on "approved" only, so "rejected" matches no path.
  const pv = await publishBody(P_PID, callerBody(`cc_${tag}_p`, C_PID, cv.version, ["approved"]), publishRegistry, dataSourceReg);
  const { registry } = engineRegistry();
  const parent = await startInstance(pv.definition, { processId: P_PID, version: pv.version }, actor);
  expect(parent.awaitedChild as string).toBe(subprocessChildId(parent.instanceId, 1, "step_sub"));
  await drainAll(registry); // spawn -> child terminal -> return
  return parent;
}

const cancelRowsOf = async (instanceId: string): Promise<unknown[]> =>
  (await sql`SELECT 1 FROM outbox WHERE instance_id = ${instanceId} AND action->>'type' = ${CANCEL_CHILD_ACTION_TYPE}`) as unknown[];

test.skipIf(!DB)("a matched return clears the awaited child, and its first hop plans no cancel row", async () => {
  const parent = await returnedParent("ret_matched", "approved");
  const stored = await loadInstance(parent.instanceId);
  expect(stored!.currentStepId as string).toBe("step_approved");
  expect(stored!.awaitedChild).toBeNull();
  expect(await cancelRowsOf(parent.instanceId)).toHaveLength(0);
});

test.skipIf(!DB)("an unmatched return clears the awaited child while the parent stays parked", async () => {
  const parent = await returnedParent("ret_unmatched", "rejected");
  const stored = await loadInstance(parent.instanceId);
  expect(stored!.currentStepId as string).toBe("step_sub"); // no path matched
  expect((stored!.data as Record<string, unknown>).field_seen).toBe("rejected"); // the writeback landed
  expect(stored!.awaitedChild).toBeNull();
  expect(await cancelRowsOf(parent.instanceId)).toHaveLength(0);
});
