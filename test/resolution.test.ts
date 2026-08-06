/**
 * Re-resolution: after an async writeback changes data, a parked automatic
 * wait-state takes its result-driven path. DB-backed; skips when DATABASE_URL is
 * unset — a skip is visible, a false green is not.
 */
import { test, expect, beforeAll, beforeEach, spyOn } from "bun:test";
import { sql, initSchema, createInstance } from "../src/engine/store.js";
import { executeManualTransition } from "../src/engine/transition.js";
import { drainOutbox } from "../src/engine/outbox.js";
import { drainResolutions } from "../src/engine/resolution.js";
import { createRegistry, register } from "../src/engine/registry.js";
import type { ProcessBody, Instance, Action } from "../src/schema/definition.js";
import type { Actor } from "../src/cel/eval.js";

const DB = !!process.env.DATABASE_URL;
const actor: Actor = { id: "user_1", roles: [] };

const cel = (src: string) => ({ lang: "cel", src });

// step_a --path_ab(manual)--> step_wait (all-automatic wait-state, guard data.go == "yes";
// onEntry writes field_go from the handler `<type>`) --path_go--> step_done (terminal).
// No default path, so the instance parks on step_wait until go == "yes".
const waitBody = (setterType: string): ProcessBody =>
  ({
    baseLocale: "en",
    fields: [{ id: "field_go", key: "go", label: { en: "Go" }, type: "text" }],
    workflow: {
      initialStep: "step_a",
      steps: [
        { id: "step_a", key: "a", label: { en: "A" }, type: "task", paths: [{ id: "path_ab", key: "ab", to: "step_wait", trigger: "manual" }] },
        {
          id: "step_wait", key: "wait", label: { en: "Wait" }, type: "task",
          onEntry: [{ id: "action_set", type: setterType, config: {}, output: { field_go: cel("result.v") } } as unknown as Action],
          paths: [{ id: "path_go", key: "go", to: "step_done", trigger: "automatic", priority: 1, guard: cel('data.go == "yes"') }],
        },
        { id: "step_done", key: "done", label: { en: "Done" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

// step_a --path_ae(manual)--> step_end (terminal, onEntry writes field_go). Entering
// step_end completes the instance, so its writeback is suppressed.
const terminalWriteBody = (): ProcessBody =>
  ({
    baseLocale: "en",
    fields: [{ id: "field_go", key: "go", label: { en: "Go" }, type: "text" }],
    workflow: {
      initialStep: "step_a",
      steps: [
        { id: "step_a", key: "a", label: { en: "A" }, type: "task", paths: [{ id: "path_ae", key: "ae", to: "step_end", trigger: "manual" }] },
        {
          id: "step_end", key: "end", label: { en: "End" }, type: "task", terminal: true,
          onEntry: [{ id: "action_set", type: "sayYes", config: {}, output: { field_go: cel("result.v") } } as unknown as Action],
        },
      ],
    },
  }) as unknown as ProcessBody;

const reg = createRegistry();
register(reg, "sayYes", { handler: async () => ({ v: "yes" }) });
register(reg, "sayNo", { handler: async () => ({ v: "no" }) });

const createFrom = (body: ProcessBody) => createInstance(body, { processId: "proc_1" as Instance["processId"], version: 1 });

const readInst = async (id: string): Promise<Instance> => {
  const r = (await sql`SELECT body FROM instances WHERE instance_id = ${id}`) as { body: unknown }[];
  return (typeof r[0].body === "string" ? JSON.parse(r[0].body as string) : r[0].body) as Instance;
};
const resolveState = async (id: string): Promise<string> =>
  ((await sql`SELECT resolve_state FROM instances WHERE instance_id = ${id}`) as { resolve_state: string }[])[0].resolve_state;

beforeAll(async () => {
  if (DB) await initSchema();
});
// drainOutbox and drainResolutions are global workers (drain the whole table),
// and drainResolutions counts instances flagged 'pending'. Some tests deliberately
// leave an instance pending, so instances must be truncated per test too — else a
// leftover contaminates a later count assertion (and across separate runs, since
// the table persists).
beforeEach(async () => {
  if (DB) await sql`TRUNCATE outbox, instances`;
});

// --- happy path: writeback drives the parked wait-state to its result path ----

test.skipIf(!DB)("a writeback satisfying the guard drives the instance off the wait-state", async () => {
  const body = waitBody("sayYes");
  const inst = await createFrom(body);
  await executeManualTransition(inst, "path_ab", body, actor); // parks on step_wait (go unset)
  expect((await readInst(inst.instanceId)).currentStepId as string).toBe("step_wait");

  expect(await drainOutbox(sql, reg)).toBe(1); // writes go="yes", flags resolve_state='pending'
  expect(await resolveState(inst.instanceId)).toBe("pending");

  expect(await drainResolutions(sql, () => body)).toBe(1);
  const after = await readInst(inst.instanceId);
  expect(after.currentStepId as string).toBe("step_done");
  expect(after.status).toBe("completed");
  expect(await resolveState(inst.instanceId)).toBe("idle");
});

// --- no match: instance stays parked, flag cleared ----------------------------

test.skipIf(!DB)("a writeback that satisfies no guard leaves the instance parked and clears the flag", async () => {
  const body = waitBody("sayNo");
  const inst = await createFrom(body);
  await executeManualTransition(inst, "path_ab", body, actor);

  expect(await drainOutbox(sql, reg)).toBe(1); // writes go="no"
  expect(await drainResolutions(sql, () => body)).toBe(1); // processed, but no transition
  const after = await readInst(inst.instanceId);
  expect(after.currentStepId as string).toBe("step_wait");
  expect(after.transitionSeq).toBe(1);
  expect(await resolveState(inst.instanceId)).toBe("idle");
});

// --- no-op on a non-wait-state instance ---------------------------------------

test.skipIf(!DB)("re-resolving an instance parked on a manual step is a no-op", async () => {
  const body = waitBody("sayYes");
  const inst = await createFrom(body); // sits on step_a (manual)
  await sql`UPDATE instances SET resolve_state = 'pending' WHERE instance_id = ${inst.instanceId}`;

  expect(await drainResolutions(sql, () => body)).toBe(1);
  const after = await readInst(inst.instanceId);
  expect(after.currentStepId as string).toBe("step_a");
  expect(after.transitionSeq).toBe(0);
  expect(await resolveState(inst.instanceId)).toBe("idle");
});

// --- race: a writeback re-flag during a claim is not lost ----------------------

test.skipIf(!DB)("a writeback lands while claimed: 'pending' overwrites 'claimed' and survives", async () => {
  const body = waitBody("sayYes");
  const inst = await createFrom(body);
  await executeManualTransition(inst, "path_ab", body, actor); // parks, enqueues the setter
  // Simulate an in-flight resolution pass that claimed the instance before the writeback.
  await sql`UPDATE instances SET resolve_state = 'claimed' WHERE instance_id = ${inst.instanceId}`;

  expect(await drainOutbox(sql, reg)).toBe(1); // writeback sets go + resolve_state='pending'
  expect(await resolveState(inst.instanceId)).toBe("pending"); // re-flag overwrote the claim

  expect(await drainResolutions(sql, () => body)).toBe(1);
  expect((await readInst(inst.instanceId)).currentStepId as string).toBe("step_done");
});

// --- stale claim reclaimed after a crashed pass -------------------------------

test.skipIf(!DB)("a claim past its lease is reclaimed and re-resolved (crashed mid-pass)", async () => {
  const body = waitBody("sayYes");
  const inst = await createFrom(body);
  await executeManualTransition(inst, "path_ab", body, actor); // parks on step_wait
  await drainOutbox(sql, reg); // writes go="yes", flags 'pending'
  // A worker that claimed the instance then crashed: 'claimed' with an old lease.
  await sql`UPDATE instances SET resolve_state = 'claimed', resolve_claimed_at = now() - interval '1 hour' WHERE instance_id = ${inst.instanceId}`;

  expect(await drainResolutions(sql, () => body)).toBe(1); // reclaimed and resolved
  expect((await readInst(inst.instanceId)).currentStepId as string).toBe("step_done");
  expect(await resolveState(inst.instanceId)).toBe("idle");
});

test.skipIf(!DB)("a fresh claim (within lease) is not stolen by another pass", async () => {
  const body = waitBody("sayYes");
  const inst = await createFrom(body);
  await executeManualTransition(inst, "path_ab", body, actor);
  await drainOutbox(sql, reg); // 'pending', go="yes"
  // Simulate a peer that just claimed it (lease fresh): must not be reclaimed.
  await sql`UPDATE instances SET resolve_state = 'claimed', resolve_claimed_at = now() WHERE instance_id = ${inst.instanceId}`;

  expect(await drainResolutions(sql, () => body)).toBe(0); // fresh claim skipped
  expect((await readInst(inst.instanceId)).currentStepId as string).toBe("step_wait"); // untouched
});

// --- resolver miss: left for a later pass, no crash ---------------------------

test.skipIf(!DB)("a body resolver returning undefined leaves the instance claimed for lease-expiry retry", async () => {
  const body = waitBody("sayYes");
  const inst = await createFrom(body);
  await executeManualTransition(inst, "path_ab", body, actor);
  await drainOutbox(sql, reg); // flags 'pending'

  expect(await drainResolutions(sql, () => undefined)).toBe(0); // nothing processed
  // Left 'claimed', not requeued to 'pending': an immediate requeue would make
  // the row selectable again on the very next pass, a write loop at the poll
  // interval for a persistently unresolvable process. The claim's own lease is
  // the retry cadence instead.
  expect(await resolveState(inst.instanceId)).toBe("claimed");
  expect((await readInst(inst.instanceId)).currentStepId as string).toBe("step_wait");
});

// --- a commit onto a terminal step does not (re-)flag; a suppressed writeback
// touches nothing either; the dead flag from creation is simply never revisited -

test.skipIf(!DB)("a commit onto a terminal step does not flag resolve_state, and a suppressed writeback adds nothing", async () => {
  const body = terminalWriteBody();
  const inst = await createFrom(body); // resolve_state = 'pending' from creation (a fresh instance is always running)
  expect(await resolveState(inst.instanceId)).toBe("pending");

  await executeManualTransition(inst, "path_ae", body, actor); // enters terminal step_end -> completed
  expect((await readInst(inst.instanceId)).status).toBe("completed");
  // The commit's resulting status is not `running`, so it leaves resolve_state
  // exactly as it found it — here still 'pending' from creation, not cleared,
  // because a completed instance can never again benefit from re-resolution and
  // the worker's own claim query excludes it (`WHERE status = 'running'`).
  expect(await resolveState(inst.instanceId)).toBe("pending");

  expect(await drainOutbox(sql, reg)).toBe(1); // delivered but writeback suppressed (0 rows affected)
  expect(await resolveState(inst.instanceId)).toBe("pending"); // suppressed writeback adds nothing, clears nothing
  expect(((await readInst(inst.instanceId)).data as Record<string, unknown>).field_go).toBeUndefined(); // data not written either

  // The worker never revisits a non-running instance, so the dead flag is
  // never cleared — harmless, since nothing else reads resolve_state.
  expect(await drainResolutions(sql, () => body)).toBe(0);
  expect(await resolveState(inst.instanceId)).toBe("pending");
  expect((await readInst(inst.instanceId)).currentStepId as string).toBe("step_end");
});

// --- poison-row isolation: one unparseable claimed row does not starve the batch --

test.skipIf(!DB)("an unparseable claimed instance is left claimed and does not starve the batch", async () => {
  const body = waitBody("sayYes");
  // Two good parked instances, both flagged 'pending' with go="yes" written.
  const g1 = await createFrom(body);
  const g2 = await createFrom(body);
  await executeManualTransition(g1, "path_ab", body, actor);
  await executeManualTransition(g2, "path_ab", body, actor);
  expect(await drainOutbox(sql, reg)).toBe(2); // both flagged 'pending'

  // A poison row: status 'running' so it is claimed, but no other Instance fields,
  // so instanceSchema.parse throws before the resolver is consulted.
  await sql`INSERT INTO instances (instance_id, transition_seq, body, resolve_state)
    VALUES (${"inst_poison"}, ${0}, ${{ status: "running" }}, 'pending')`;

  // Both good instances are processed and the poison is left claimed (its lease
  // is the retry cadence), instead of the parse throw aborting the pass and
  // stranding the rest of the batch, and instead of an immediate requeue that
  // would make it a write loop at the poll interval.
  expect(await drainResolutions(sql, () => body)).toBe(2);
  expect((await readInst(g1.instanceId)).currentStepId as string).toBe("step_done");
  expect((await readInst(g2.instanceId)).currentStepId as string).toBe("step_done");
  expect(await resolveState("inst_poison")).toBe("claimed"); // left for lease-expiry reclaim, not lost
});

// --- progress marker: not re-claimed until the lease expires -----------------

test.skipIf(!DB)("a resolver throw for one instance does not block another in the same pass, and the failed one waits out its lease", async () => {
  const body = waitBody("sayYes");
  // Two instances against distinct processIds, so the resolver can selectively
  // fail one by processId without either instance's own identity mattering.
  const createAs = (pid: string) => createInstance(body, { processId: pid as Instance["processId"], version: 1 });
  const good = await createAs("proc_resolve_good");
  const bad = await createAs("proc_resolve_bad");
  await executeManualTransition(good, "path_ab", body, actor);
  await executeManualTransition(bad, "path_ab", body, actor);
  expect(await drainOutbox(sql, reg)).toBe(2); // both flagged 'pending'

  const flaky = (pid: string) => {
    if (pid === "proc_resolve_bad") throw new Error("simulated resolver failure");
    return body;
  };
  expect(await drainResolutions(sql, flaky)).toBe(1); // good processed; bad isolated, not counted
  expect((await readInst(good.instanceId)).currentStepId as string).toBe("step_done");
  expect(await resolveState(good.instanceId)).toBe("idle");
  expect(await resolveState(bad.instanceId)).toBe("claimed"); // left for lease-expiry retry

  // Immediate re-drain: the lease has not elapsed, so the claim query does not
  // reselect it — not a write loop at the poll interval.
  expect(await drainResolutions(sql, flaky)).toBe(0);
  expect(await resolveState(bad.instanceId)).toBe("claimed");

  // Once its lease elapses it is reclaimed, and — with a working resolver —
  // resolves normally: the fault was transient, not terminal.
  await sql`UPDATE instances SET resolve_claimed_at = now() - interval '1 hour' WHERE instance_id = ${bad.instanceId}`;
  expect(await drainResolutions(sql, () => body)).toBe(1);
  expect(await resolveState(bad.instanceId)).toBe("idle");
  expect((await readInst(bad.instanceId)).currentStepId as string).toBe("step_done");
});

// --- the per-instance boundary logs -----------------------------------------

// surface-worker-failures: drainResolutions' per-instance catch used to discard
// its error with no line. The catch sits inside the drain loop, so the tick
// returns normally and pollForever's own line never fires — an instance failing
// every pass was invisible.
test.skipIf(!DB)("an instance the resolution drain skips logs an error line carrying its id", async () => {
  const body = waitBody("sayYes");
  const createAs = (pid: string) => createInstance(body, { processId: pid as Instance["processId"], version: 1 });
  const good = await createAs("proc_log_good");
  const bad = await createAs("proc_log_bad");
  await executeManualTransition(good, "path_ab", body, actor);
  await executeManualTransition(bad, "path_ab", body, actor);
  expect(await drainOutbox(sql, reg)).toBe(2);

  const flaky = (pid: string) => {
    if (pid === "proc_log_bad") throw new Error("simulated resolver failure");
    return body;
  };
  const errorSpy = spyOn(console, "error").mockImplementation(() => {});
  const processed = await drainResolutions(sql, flaky);
  const lines = errorSpy.mock.calls
    .map((c) => JSON.parse(c[0] as string) as Record<string, unknown>)
    .filter((l) => l.msg === "worker skipped a failing item");
  errorSpy.mockRestore();

  expect(lines).toHaveLength(1);
  expect(lines[0].level).toBe("error");
  expect(lines[0].worker).toBe("resolution");
  expect(lines[0].instanceId).toBe(bad.instanceId);
  expect(lines[0].error).toBe("simulated resolver failure");

  expect(processed).toBe(1); // the rest of the batch still ran
  expect((await readInst(good.instanceId)).currentStepId as string).toBe("step_done");
});
