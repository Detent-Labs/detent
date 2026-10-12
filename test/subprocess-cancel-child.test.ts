/**
 * The child a parked parent awaits (`Instance.awaitedChild`), the third
 * engine-internal handler, `core.cancelSubprocessChild`, which cancels that
 * child once a commit leaves the subprocess step, and the spawn and return
 * gates that act only for the awaited child. Every parent here is built
 * through the engine (startInstance, fireTimer, the spawn handler,
 * drainOutbox); a handler is invoked directly where a test needs its thrown
 * error or a fixed delivery order, since drainOutbox folds a throw into the
 * row's `last_error`. DB cases skip when
 * DATABASE_URL is unset. Like test/subprocess.test.ts, this file truncates
 * nothing and publishes each case under its own process ids.
 */
import { test, expect, beforeAll } from "bun:test";
import { sql, initSchema, parseInstance } from "../src/engine/store.js";
import {
  startInstance,
  cancelInstance,
  executeManualTransition,
  fireTimer,
  ConcurrencyConflict,
  CANCEL_CHILD_ACTION_TYPE,
  SPAWN_ACTION_TYPE,
  RETURN_ACTION_TYPE,
} from "../src/engine/transition.js";
import { publishBody, createDefinitionStore, DefinitionHashMismatch } from "../src/engine/definitions.js";
import { contractHash, definitionHash } from "../src/schema/hash.js";
import { registerSubprocessHandlers } from "../src/engine/subprocess.js";
import { drainOutbox } from "../src/engine/outbox.js";
import { subprocessChildId } from "../src/engine/idempotency.js";
import { compileProcessBody, CompileValidationError } from "../src/schema/compile.js";
import { SYSTEM_ACTOR, type Actor } from "../src/cel/eval.js";
import type { ProcessBody, Instance } from "../src/schema/definition.js";
import { createStaticAssignmentRegistry, type Registry as Reg, type DataSourceRegistry, type HandlerContext } from "../src/engine/registry.js";
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
// cascade parks the parent there until the return. `subOver` adds keys to the
// subprocess step, an `onCancel` list for one.
const callerBody = (key: string, childPid: string, childVersion: number, guardedOutcomes: string[] = ["approved", "rejected"], subOver: Record<string, unknown> = {}): ProcessBody =>
  ({
    key, baseLocale: "en", label: { en: key },
    contract: { outcomes: ["approved", "rejected"] },
    fields: [{ id: "field_seen", key: "seen", label: { en: "Seen" }, type: "string" }],
    workflow: {
      initialStep: "step_entry",
      steps: [
        { id: "step_entry", key: "entry", label: { en: "Entry" }, type: "task", paths: [autoPath("path_sub", "step_sub")] },
        { id: "step_sub", key: "sub", label: { en: "Sub" }, type: "subprocess", ...subOver,
          subprocess: { processId: childPid, versionBinding: "pinned", pinnedVersion: childVersion, inputMapping: {}, outputMapping: { field_seen: cel("child.outcome") } },
          paths: guardedOutcomes.map((o, n) => autoPath(`path_${o}`, `step_${o}`, n + 1, `child.outcome == "${o}"`)) },
        { id: "step_approved", key: "approved", label: { en: "Approved" }, type: "task", terminal: true, outcome: "approved" },
        { id: "step_rejected", key: "rejected", label: { en: "Rejected" }, type: "task", terminal: true, outcome: "rejected" },
      ],
    },
  }) as unknown as ProcessBody;

// entry (automatic) -> a subprocess step whose timer forces the parent onto a
// manual retry step, which leads back: two visits of one subprocess step. A
// `cancelled` outcome has its own path, so a stale return that got through
// would move the parent.
const reentryCallerBody = (key: string, childPid: string, childVersion: number): ProcessBody =>
  ({
    key, baseLocale: "en", label: { en: key },
    fields: [{ id: "field_seen", key: "seen", label: { en: "Seen" }, type: "string" }],
    workflow: {
      initialStep: "step_entry",
      steps: [
        { id: "step_entry", key: "entry", label: { en: "Entry" }, type: "task", paths: [autoPath("path_sub", "step_sub")] },
        { id: "step_sub", key: "sub", label: { en: "Sub" }, type: "subprocess",
          subprocess: { processId: childPid, versionBinding: "pinned", pinnedVersion: childVersion, inputMapping: {}, outputMapping: { field_seen: cel("child.outcome") } },
          timers: [{ id: "timer_sub", duration: "PT1H", onFire: { targetPath: "path_timeout" } }],
          paths: [
            autoPath("path_done", "step_done", 1, 'child.outcome == "done"'),
            autoPath("path_child_cancelled", "step_child_cancelled", 2, 'child.outcome == "cancelled"'),
            autoPath("path_timeout", "step_retry", 3, "false"),
          ] },
        { id: "step_retry", key: "retry", label: { en: "Retry" }, type: "task", paths: [manualPath("path_again", "step_sub")] },
        { id: "step_done", key: "done", label: { en: "Done" }, type: "task", terminal: true },
        { id: "step_child_cancelled", key: "child_cancelled", label: { en: "Child cancelled" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

// entry (automatic) -> a subprocess step whose timer path leads straight back to
// the same step: one commit leaves a visit and starts the next. A `cancelled`
// outcome has its own path, as in reentryCallerBody.
const selfLoopCallerBody = (key: string, childPid: string, childVersion: number): ProcessBody =>
  ({
    key, baseLocale: "en", label: { en: key },
    fields: [{ id: "field_seen", key: "seen", label: { en: "Seen" }, type: "string" }],
    workflow: {
      initialStep: "step_entry",
      steps: [
        { id: "step_entry", key: "entry", label: { en: "Entry" }, type: "task", paths: [autoPath("path_sub", "step_sub")] },
        { id: "step_sub", key: "sub", label: { en: "Sub" }, type: "subprocess",
          subprocess: { processId: childPid, versionBinding: "pinned", pinnedVersion: childVersion, inputMapping: {}, outputMapping: { field_seen: cel("child.outcome") } },
          timers: [{ id: "timer_sub", duration: "PT1H", onFire: { targetPath: "path_again" } }],
          paths: [
            autoPath("path_done", "step_done", 1, 'child.outcome == "done"'),
            autoPath("path_child_cancelled", "step_child_cancelled", 2, 'child.outcome == "cancelled"'),
            autoPath("path_again", "step_sub", 3, "false"),
          ] },
        { id: "step_done", key: "done", label: { en: "Done" }, type: "task", terminal: true },
        { id: "step_child_cancelled", key: "child_cancelled", label: { en: "Child cancelled" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

// entry -> a subprocess step over a child that ends at once -> a second
// subprocess step over a waiting child. The second step's guardless default
// would fire on entry if the cascade did not park there.
const twoSubCallerBody = (key: string, firstPid: string, firstVersion: number, secondPid: string, secondVersion: number): ProcessBody =>
  ({
    key, baseLocale: "en", label: { en: key },
    fields: [],
    workflow: {
      initialStep: "step_entry",
      steps: [
        { id: "step_entry", key: "entry", label: { en: "Entry" }, type: "task", paths: [autoPath("path_sub", "step_sub")] },
        { id: "step_sub", key: "sub", label: { en: "Sub" }, type: "subprocess",
          subprocess: { processId: firstPid, versionBinding: "pinned", pinnedVersion: firstVersion, inputMapping: {}, outputMapping: {} },
          paths: [autoPath("path_next", "step_sub2", 1, 'child.outcome == "approved"'), autoPath("path_end", "step_end", 2)] },
        { id: "step_sub2", key: "sub2", label: { en: "Sub 2" }, type: "subprocess",
          subprocess: { processId: secondPid, versionBinding: "pinned", pinnedVersion: secondVersion, inputMapping: {}, outputMapping: {} },
          paths: [autoPath("path_done2", "step_end", 1, 'child.outcome == "done"'), autoPath("path_default2", "step_default", 2)] },
        { id: "step_end", key: "end", label: { en: "End" }, type: "task", terminal: true },
        { id: "step_default", key: "default", label: { en: "Default" }, type: "task", terminal: true },
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
    assignmentRegistry: createStaticAssignmentRegistry(),
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
  let thrown: unknown;
  try {
    compileProcessBody(body);
  } catch (e) {
    thrown = e;
  }
  expect(thrown).toBeInstanceOf(CompileValidationError);
  // The located reserved-prefix issue, so an unrelated schema failure cannot satisfy this.
  expect((thrown as CompileValidationError).issues).toContainEqual({
    loc: "steps[0].onEntry[0].type",
    value: "core.cancelSubprocessChild",
    message: "action type uses the reserved 'core.' prefix",
  });
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

test.skipIf(!DB)("a return whose first hop lands on a second subprocess step parks there awaiting the second child", async () => {
  const F_PID = "proc_cc_two_sub_f" as Instance["processId"];
  const W_PID = "proc_cc_two_sub_w" as Instance["processId"];
  const P_PID = "proc_cc_two_sub_p" as Instance["processId"];
  const fv = await publishBody(F_PID, fixedChildBody("approved"), publishRegistry, dataSourceReg);
  const wv = await publishBody(W_PID, waitingChildBody(), publishRegistry, dataSourceReg);
  const pv = await publishBody(P_PID, twoSubCallerBody("cc_two_sub_p", F_PID, fv.version, W_PID, wv.version), publishRegistry, dataSourceReg);
  const { registry } = engineRegistry();
  const parent = await startInstance(pv.definition, { processId: P_PID, version: pv.version }, actor);
  await drainAll(registry); // first spawn -> child ends -> return -> first hop onto step_sub2 -> second spawn

  const secondChild = subprocessChildId(parent.instanceId, 2, "step_sub2");
  const stored = await loadInstance(parent.instanceId);
  expect(stored!.currentStepId as string).toBe("step_sub2"); // the guardless default did not fire
  expect(stored!.transitionSeq).toBe(2);
  expect(stored!.awaitedChild as string).toBe(secondChild);
  expect(await outboxActionIds(parent.instanceId)).toContain("action_spawn_step_sub2");
  expect(await cancelRowsOf(parent.instanceId)).toHaveLength(0);
  const child = await loadInstance(secondChild);
  expect(child!.status).toBe("running");
  expect(child!.parent?.stepId as string).toBe("step_sub2");
});

// --- DB: the spawn and the return act only for the awaited child (B-2) -------------

const countChildren = async (parentId: string): Promise<number> =>
  Number(((await sql`SELECT count(*) AS n FROM instances WHERE body->'parent'->>'instanceId' = ${parentId}`) as { n: number }[])[0]!.n);
// The statuses of one instance's outbox rows for one action id, by sequence.
const rowStatuses = async (instanceId: string, actionId: string): Promise<string[]> =>
  ((await sql`SELECT status FROM outbox WHERE instance_id = ${instanceId} AND action_id = ${actionId} ORDER BY transition_seq`) as
    { status: string }[]).map((r) => r.status);

function spawnCtx(parentId: string, parentSeq: number): HandlerContext {
  const config = { subprocessStepId: "step_sub", parentSeq };
  return {
    action: { id: "action_spawn_step_sub", type: SPAWN_ACTION_TYPE, config } as unknown as HandlerContext["action"],
    config,
    idempotencyKey: `test-spawn-${parentId}-${parentSeq}`,
    instanceId: parentId,
    db: sql,
    assignmentRegistry: createStaticAssignmentRegistry(),
  };
}
const spawnHandler = (registry: Reg) => registry.get(SPAWN_ACTION_TYPE)!.handler;

/** A parent on its first visit of the re-entry body's subprocess step, its spawn still queued. */
async function reentryParent(tag: string) {
  const W_PID = `proc_cc_${tag}_w` as Instance["processId"];
  const P_PID = `proc_cc_${tag}_p` as Instance["processId"];
  const wv = await publishBody(W_PID, waitingChildBody(), publishRegistry, dataSourceReg);
  const pv = await publishBody(P_PID, reentryCallerBody(`cc_${tag}_p`, W_PID, wv.version), publishRegistry, dataSourceReg);
  const { registry } = engineRegistry();
  const parent = await startInstance(pv.definition, { processId: P_PID, version: pv.version }, actor);
  const firstChild = subprocessChildId(parent.instanceId, 1, "step_sub");
  expect(parent.awaitedChild as string).toBe(firstChild);
  // The timer forces the parent off the subprocess step onto the retry step.
  const leave = async () => fireTimer((await loadInstance(parent.instanceId))!, "timer_sub", pv.definition);
  // The retry step's manual path enters the subprocess step again.
  const reenter = async () => executeManualTransition((await loadInstance(parent.instanceId))!, "path_again", pv.definition, actor);
  return { wv, pv, registry, parent, firstChild, leave, reenter };
}

test.skipIf(!DB)("a queued spawn whose parent left the step by a timer creates no child", async () => {
  const { registry, parent, firstChild, leave } = await reentryParent("gate_left");
  const left = await leave();
  expect(left.currentStepId as string).toBe("step_retry");
  expect(left.awaitedChild).toBeNull();

  await drainAll(registry); // the queued spawn, then the leaving cancel
  expect(await loadInstance(firstChild)).toBeUndefined();
  expect(await countChildren(parent.instanceId)).toBe(0);
  expect(await rowStatuses(parent.instanceId, "action_spawn_step_sub")).toEqual(["delivered"]); // a success, not a failure
});

test.skipIf(!DB)("after a re-entry the first visit's spawn creates no child and the second visit's creates one", async () => {
  const { registry, parent, firstChild, leave, reenter } = await reentryParent("gate_reentry");
  await leave();
  const back = await reenter();
  const secondChild = subprocessChildId(parent.instanceId, 3, "step_sub");
  expect(back.currentStepId as string).toBe("step_sub");
  expect(back.awaitedChild as string).toBe(secondChild);

  await drainAll(registry); // both visits' spawns and the first visit's cancel
  expect(await loadInstance(firstChild)).toBeUndefined();
  expect((await loadInstance(secondChild))!.status).toBe("running");
  expect(await countChildren(parent.instanceId)).toBe(1);
  expect(await rowStatuses(parent.instanceId, "action_spawn_step_sub")).toEqual(["delivered", "delivered"]); // seq 1, seq 3
  expect((await loadInstance(parent.instanceId))!.awaitedChild as string).toBe(secondChild);
});

test.skipIf(!DB)("a cancel delivered before the spawn does nothing, and the spawn then creates no child", async () => {
  const { registry, parent, firstChild, leave } = await reentryParent("gate_cancel_first");
  await leave();

  // The leaving cancel arrives first: the child does not exist yet.
  const before = await snapshot();
  expect(await cancelHandler(registry)(cancelCtx(parent.instanceId, firstChild))).toEqual({});
  expect(await snapshot()).toEqual(before);
  // The queued spawn arrives second, for a parent that no longer awaits the child.
  expect(await spawnHandler(registry)(spawnCtx(parent.instanceId, 1))).toEqual({});
  expect(await loadInstance(firstChild)).toBeUndefined();

  await drainAll(registry); // the real rows, in whatever order
  expect(await countChildren(parent.instanceId)).toBe(0);
});

test.skipIf(!DB)("a stale return from the first visit's child changes nothing, and the second child's return drives the parent", async () => {
  const { wv, registry, parent, firstChild, leave, reenter } = await reentryParent("gate_stale_return");
  await drainAll(registry); // the first visit's child is spawned and waits
  expect((await loadInstance(firstChild))!.status).toBe("running");
  await leave();
  await reenter(); // the parent awaits the second visit's child before the cancel lands
  const secondChild = subprocessChildId(parent.instanceId, 3, "step_sub");

  // The leaving cancel ends the first child, whose cancel sink enqueues a
  // return with outcome `cancelled`; both visits share the child's step link.
  await drainAll(registry);
  expect((await loadInstance(firstChild))!.status).toBe("cancelled");
  expect(await rowStatuses(firstChild, `action_return_${firstChild}`)).toEqual(["delivered"]); // a no-op, not a failure
  let stored = await loadInstance(parent.instanceId);
  expect(stored!.currentStepId as string).toBe("step_sub");
  expect(stored!.transitionSeq).toBe(3);
  expect(stored!.awaitedChild as string).toBe(secondChild);
  expect((stored!.data as Record<string, unknown>).field_seen).toBeUndefined(); // no writeback
  expect((await sql`SELECT 1 FROM instance_events WHERE instance_id = ${parent.instanceId} AND kind = 'subprocess.outcome-unmatched'`) as unknown[]).toHaveLength(0);

  // The second child finishes; its own return drives the parent.
  await executeManualTransition((await loadInstance(secondChild))!, "path_w_done", wv.definition, actor);
  await drainAll(registry);
  stored = await loadInstance(parent.instanceId);
  expect(stored!.status).toBe("completed");
  expect(stored!.currentStepId as string).toBe("step_done");
  expect((stored!.data as Record<string, unknown>).field_seen).toBe("done");
  expect(stored!.awaitedChild).toBeNull();
});

test.skipIf(!DB)("the backstop cancels a child whose parent left the step after the spawn's check", async () => {
  const W_PID = "proc_cc_gate_backstop_w" as Instance["processId"];
  const P_PID = "proc_cc_gate_backstop_p" as Instance["processId"];
  const wv = await publishBody(W_PID, waitingChildBody(), publishRegistry, dataSourceReg);
  const pv = await publishBody(P_PID, reentryCallerBody("cc_gate_backstop_p", W_PID, wv.version), publishRegistry, dataSourceReg);
  const parent = await startInstance(pv.definition, { processId: P_PID, version: pv.version }, actor);
  const childId = subprocessChildId(parent.instanceId, 1, "step_sub");

  // The spawn resolves the child body after its awaited-child check and before
  // it creates the child: the parent's timer fires in that window.
  let armed = true;
  const { registry: racing } = engineRegistry((real) => async (pid, ver) => {
    if (armed && pid === W_PID) {
      armed = false;
      await fireTimer((await loadInstance(parent.instanceId))!, "timer_sub", pv.definition);
    }
    return real(pid, ver);
  });

  expect(await spawnHandler(racing)(spawnCtx(parent.instanceId, 1))).toEqual({});
  expect(armed).toBe(false);
  const stored = await loadInstance(parent.instanceId);
  expect(stored!.status).toBe("running"); // the parent is still running: only the awaited-child test catches this
  expect(stored!.currentStepId as string).toBe("step_retry");
  expect(stored!.awaitedChild).toBeNull();
  expect((await loadInstance(childId))!.status).toBe("cancelled");

  await drainAll(racing); // the real spawn and cancel rows find nothing left to do
  expect((await loadInstance(childId))!.status).toBe("cancelled");
});

// --- DB: the leaving commit cancels the child (B-2) ----------------------------------

// The child ids that one instance's cancel rows name, by sequence.
const cancelRowTargets = async (instanceId: string): Promise<string[]> =>
  ((await sql`SELECT action->'config'->>'childId' AS child_id FROM outbox WHERE instance_id = ${instanceId} AND action->>'type' = ${CANCEL_CHILD_ACTION_TYPE} ORDER BY transition_seq`) as
    { child_id: string }[]).map((r) => r.child_id);
// The instance row as the engine stores it: sequence, body, resolve state.
const instanceRow = async (id: string): Promise<unknown> =>
  JSON.parse(JSON.stringify(await sql`SELECT transition_seq, body, resolve_state FROM instances WHERE instance_id = ${id}`));

test.skipIf(!DB)("a timer exit cancels the child waiting on a manual task and runs its onCancel actions", async () => {
  const { registry, parent, firstChild, leave } = await reentryParent("exit_manual");
  await drainAll(registry); // the spawn creates the child, which parks at its manual step
  expect((await loadInstance(firstChild))!.status).toBe("running");
  expect(await outboxActionIds(firstChild)).not.toContain("action_w_on_cancel");

  const left = await leave();
  expect(left.currentStepId as string).toBe("step_retry");
  expect(left.awaitedChild).toBeNull();
  expect(await cancelRowTargets(parent.instanceId)).toEqual([firstChild]); // enqueued by the leaving commit
  expect((await loadInstance(firstChild))!.status).toBe("running"); // cancelled after the commit, not inside it

  await drainAll(registry);
  expect((await loadInstance(firstChild))!.status).toBe("cancelled");
  expect(await cancelSweepState(firstChild)).toBe("done");
  expect(await rowStatuses(firstChild, "action_w_on_cancel")).toEqual(["delivered"]);
  expect(await rowStatuses(parent.instanceId, "action_cancel_awaited_child")).toEqual(["delivered"]);
  // The child's cancel sink returned `cancelled` to a parent that no longer awaits it.
  const stored = await loadInstance(parent.instanceId);
  expect(stored!.status).toBe("running");
  expect(stored!.currentStepId as string).toBe("step_retry");
  expect(stored!.transitionSeq).toBe(2);
  expect((stored!.data as Record<string, unknown>).field_seen).toBeUndefined();
});

test.skipIf(!DB)("a timer exit cancels the child's own running child as well", async () => {
  const W_PID = "proc_cc_exit_chain_w" as Instance["processId"];
  const M_PID = "proc_cc_exit_chain_m" as Instance["processId"];
  const P_PID = "proc_cc_exit_chain_p" as Instance["processId"];
  const wv = await publishBody(W_PID, waitingChildBody(), publishRegistry, dataSourceReg);
  // The middle child parks on a subprocess step of its own, which declares an onCancel action.
  const middle = callerBody("cc_exit_chain_m", W_PID, wv.version, undefined, { onCancel: [{ id: "action_m_on_cancel", type: "test.noop", config: {} }] });
  const mv = await publishBody(M_PID, middle, publishRegistry, dataSourceReg);
  const pv = await publishBody(P_PID, reentryCallerBody("cc_exit_chain_p", M_PID, mv.version), publishRegistry, dataSourceReg);
  const { registry } = engineRegistry();
  const parent = await startInstance(pv.definition, { processId: P_PID, version: pv.version }, actor);
  await drainAll(registry); // spawns the middle child, which spawns the waiting grandchild
  const mId = subprocessChildId(parent.instanceId, 1, "step_sub");
  const wId = subprocessChildId(mId, 1, "step_sub");
  expect((await loadInstance(mId))!.status).toBe("running");
  expect((await loadInstance(wId))!.status).toBe("running");

  await fireTimer((await loadInstance(parent.instanceId))!, "timer_sub", pv.definition);
  await drainAll(registry);
  expect((await loadInstance(mId))!.status).toBe("cancelled");
  expect((await loadInstance(wId))!.status).toBe("cancelled");
  expect(await cancelSweepState(mId)).toBe("done");
  expect(await rowStatuses(mId, "action_m_on_cancel")).toEqual(["delivered"]);
  expect(await rowStatuses(wId, "action_w_on_cancel")).toEqual(["delivered"]);
  const stored = await loadInstance(parent.instanceId);
  expect(stored!.status).toBe("running");
  expect(stored!.currentStepId as string).toBe("step_retry");
});

test.skipIf(!DB)("a timer path back to the same step cancels the first child, spawns a second, and the first child's return changes nothing", async () => {
  const W_PID = "proc_cc_selfloop_w" as Instance["processId"];
  const P_PID = "proc_cc_selfloop_p" as Instance["processId"];
  const wv = await publishBody(W_PID, waitingChildBody(), publishRegistry, dataSourceReg);
  const pv = await publishBody(P_PID, selfLoopCallerBody("cc_selfloop_p", W_PID, wv.version), publishRegistry, dataSourceReg);
  const { registry } = engineRegistry();
  const parent = await startInstance(pv.definition, { processId: P_PID, version: pv.version }, actor);
  const firstChild = subprocessChildId(parent.instanceId, 1, "step_sub");
  const secondChild = subprocessChildId(parent.instanceId, 2, "step_sub");
  await drainAll(registry);
  expect((await loadInstance(firstChild))!.status).toBe("running");

  // One commit leaves the first visit and starts the second.
  const again = await fireTimer((await loadInstance(parent.instanceId))!, "timer_sub", pv.definition);
  expect(again.currentStepId as string).toBe("step_sub");
  expect(again.transitionSeq).toBe(2);
  expect(again.awaitedChild as string).toBe(secondChild);
  expect(await cancelRowTargets(parent.instanceId)).toEqual([firstChild]); // names the first visit's child only

  const parentBefore = await instanceRow(parent.instanceId);
  await drainAll(registry); // the second spawn, the first child's cancel, and the `cancelled` return that follows
  const first = await loadInstance(firstChild);
  expect(first!.status).toBe("cancelled");
  expect(first!.parent?.instanceId as string).toBe(parent.instanceId);
  expect(await rowStatuses(firstChild, "action_w_on_cancel")).toEqual(["delivered"]);
  expect((await loadInstance(secondChild))!.status).toBe("running");
  expect(await countChildren(parent.instanceId)).toBe(2); // the cancelled first child and the running second
  // The first child's return was delivered as a no-op: the parent row is exactly as the second entry left it.
  expect(await rowStatuses(firstChild, `action_return_${firstChild}`)).toEqual(["delivered"]);
  expect(await instanceRow(parent.instanceId)).toEqual(parentBefore);
  expect((await sql`SELECT 1 FROM instance_events WHERE instance_id = ${parent.instanceId} AND kind = 'subprocess.outcome-unmatched'`) as unknown[]).toHaveLength(0);
  const stored = await loadInstance(parent.instanceId);
  expect(stored!.status).toBe("running");
  expect(stored!.awaitedChild as string).toBe(secondChild);
  expect((stored!.data as Record<string, unknown>).field_seen).toBeUndefined();
});

test.skipIf(!DB)("a parent cancel enqueues no leaving row, and the sweep cancels the running child", async () => {
  const { pv, registry, parent, childId } = await parkedOverWaitingChild("parent_cancel");
  expect((await loadInstance(childId))!.status).toBe("running");
  const { resolveBody } = engineRegistry();

  await cancelInstance((await loadInstance(parent.instanceId))!, pv.definition, actor, sql, resolveBody);
  // The cancel commit leaves the subprocess step and clears the awaited child, but plans no cancel row.
  const stored = await loadInstance(parent.instanceId);
  expect(stored!.status).toBe("cancelled");
  expect(stored!.awaitedChild).toBeNull();
  expect(await cancelRowTargets(parent.instanceId)).toEqual([]);
  // The sweep already cancelled the child, before any outbox row was delivered.
  expect((await loadInstance(childId))!.status).toBe("cancelled");
  expect(await cancelSweepState(parent.instanceId)).toBe("done");
  expect(await outboxActionIds(childId)).toContain("action_w_on_cancel");

  await drainAll(registry); // the child's `cancelled` return finds a cancelled parent
  expect(await cancelRowTargets(parent.instanceId)).toEqual([]);
  expect((await loadInstance(parent.instanceId))!.status).toBe("cancelled");
  expect((await loadInstance(childId))!.status).toBe("cancelled");
});

// --- DB: the engine's pin sites hand the instance's hash to resolveBody ----------

/** Replace a row's body and its hash together: the row check passes, only a pin can tell. */
async function restoreRowWithAnotherBody(processId: string, version: number): Promise<void> {
  const rows = (await sql`SELECT body FROM definitions WHERE process_id = ${processId} AND version = ${version}`) as { body: unknown }[];
  const changed = { ...(rows[0]!.body as Record<string, unknown>), label: { en: "Restored" } } as unknown as ProcessBody;
  await sql`UPDATE definitions SET body = ${JSON.stringify(changed)}::jsonb, definition_hash = ${definitionHash(changed)}
    WHERE process_id = ${processId} AND version = ${version}`;
}
const thrownBy = (run: () => Promise<unknown>): Promise<unknown> => run().then(() => undefined, (e: unknown) => e);
function expectPinMismatch(error: unknown): void {
  expect(error).toBeInstanceOf(DefinitionHashMismatch);
  expect((error as DefinitionHashMismatch).reason).toBe("pin");
}

test.skipIf(!DB)("resolveLatestByContract throws DefinitionHashMismatch for an edited row it returns", async () => {
  const W_PID = "proc_cc_pin_latest_w" as Instance["processId"];
  const wv = await publishBody(W_PID, waitingChildBody(), publishRegistry, dataSourceReg);
  await sql`UPDATE definitions SET body = jsonb_set(body, '{label,en}', '"Edited"') WHERE process_id = ${W_PID}`;
  const ref = contractHash(wv.definition.contract!);
  const error = await thrownBy(() => createDefinitionStore(sql).resolveLatestByContract(W_PID, ref));
  expect(error).toBeInstanceOf(DefinitionHashMismatch);
  expect((error as DefinitionHashMismatch).reason).toBe("body");
});

test.skipIf(!DB)("the spawn pins its parent with the parent's hash and looks the child up with no pin", async () => {
  const W_PID = "proc_cc_pin_spy_w" as Instance["processId"];
  const P_PID = "proc_cc_pin_spy_p" as Instance["processId"];
  const wv = await publishBody(W_PID, waitingChildBody(), publishRegistry, dataSourceReg);
  const pv = await publishBody(P_PID, callerBody("cc_pin_spy_p", W_PID, wv.version), publishRegistry, dataSourceReg);
  const calls: [string, number, string | undefined][] = [];
  const { registry } = engineRegistry((real) => async (processId, version, pinHash) => {
    calls.push([processId, version, pinHash]);
    return real(processId, version, pinHash);
  });
  const parent = await startInstance(pv.definition, { processId: P_PID, version: pv.version }, actor);

  await spawnHandler(registry)(spawnCtx(parent.instanceId, 1));
  expect(calls).toContainEqual([P_PID, pv.version, parent.definitionHash]);
  expect(calls).toContainEqual([W_PID, wv.version, undefined]);
});

test.skipIf(!DB)("the spawn throws when its parent's stored row no longer matches the parent's pin", async () => {
  const W_PID = "proc_cc_pin_sp_p_w" as Instance["processId"];
  const P_PID = "proc_cc_pin_sp_p_p" as Instance["processId"];
  const wv = await publishBody(W_PID, waitingChildBody(), publishRegistry, dataSourceReg);
  const pv = await publishBody(P_PID, callerBody("cc_pin_sp_p_p", W_PID, wv.version), publishRegistry, dataSourceReg);
  const parent = await startInstance(pv.definition, { processId: P_PID, version: pv.version }, actor); // spawn still queued
  await restoreRowWithAnotherBody(P_PID, pv.version);

  const { registry } = engineRegistry();
  expectPinMismatch(await thrownBy(() => spawnHandler(registry)(spawnCtx(parent.instanceId, 1)) as Promise<unknown>));
  expect(await countChildren(parent.instanceId)).toBe(0);
});

test.skipIf(!DB)("the spawn throws when an existing child's stored row no longer matches the child's pin", async () => {
  const { W_PID, wv, parent } = await parkedOverWaitingChild("pin_sp_c");
  await restoreRowWithAnotherBody(W_PID, wv.version);

  const { registry } = engineRegistry();
  expectPinMismatch(await thrownBy(() => spawnHandler(registry)(spawnCtx(parent.instanceId, 1)) as Promise<unknown>));
});

function returnCtx(parentId: string, childId: string): HandlerContext {
  const config = { parentInstanceId: parentId, childOutcome: "done" };
  return {
    action: { id: `action_return_${childId}`, type: RETURN_ACTION_TYPE, config } as unknown as HandlerContext["action"],
    config,
    idempotencyKey: `test-return-${childId}`,
    instanceId: childId,
    db: sql,
    assignmentRegistry: createStaticAssignmentRegistry(),
  };
}
const returnHandler = (registry: Reg) => registry.get(RETURN_ACTION_TYPE)!.handler;

test.skipIf(!DB)("the return throws when the parent's stored row no longer matches the parent's pin", async () => {
  const { P_PID, pv, parent, childId } = await parkedOverWaitingChild("pin_ret_p");
  await restoreRowWithAnotherBody(P_PID, pv.version);

  const { registry } = engineRegistry();
  expectPinMismatch(await thrownBy(() => returnHandler(registry)(returnCtx(parent.instanceId, childId)) as Promise<unknown>));
  expect((await loadInstance(parent.instanceId))!.status).toBe("running");
});

test.skipIf(!DB)("the return throws when the child's stored row no longer matches the child's pin", async () => {
  const { W_PID, wv, parent, childId } = await parkedOverWaitingChild("pin_ret_c");
  await restoreRowWithAnotherBody(W_PID, wv.version);

  const { registry } = engineRegistry();
  expectPinMismatch(await thrownBy(() => returnHandler(registry)(returnCtx(parent.instanceId, childId)) as Promise<unknown>));
  expect((await loadInstance(parent.instanceId))!.status).toBe("running");
});

test.skipIf(!DB)("the cancel-child handler throws when the child's stored row no longer matches the child's pin", async () => {
  const { W_PID, wv, parent, childId } = await parkedOverWaitingChild("pin_cc");
  await restoreRowWithAnotherBody(W_PID, wv.version);

  const { registry } = engineRegistry();
  expectPinMismatch(await thrownBy(() => cancelHandler(registry)(cancelCtx(parent.instanceId, childId)) as Promise<unknown>));
  expect((await loadInstance(childId))!.status).toBe("running");
});

test.skipIf(!DB)("a parent cancel's sweep leaves a child running when the child's stored row no longer matches its pin", async () => {
  const { W_PID, wv, pv, parent, childId } = await parkedOverWaitingChild("pin_sweep");
  await restoreRowWithAnotherBody(W_PID, wv.version);

  const { resolveBody } = engineRegistry();
  await cancelInstance((await loadInstance(parent.instanceId))!, pv.definition, actor, sql, resolveBody);
  expect((await loadInstance(parent.instanceId))!.status).toBe("cancelled");
  expect((await loadInstance(childId))!.status).toBe("running"); // the sweep could not resolve it
  expect(await cancelSweepState(parent.instanceId)).toBe("pending");
});
