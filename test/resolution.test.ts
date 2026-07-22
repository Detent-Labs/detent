/**
 * Re-resolution: after an async writeback changes data, a parked automatic
 * wait-state takes its result-driven path. DB-backed; skips when DATABASE_URL is
 * unset — a skip is visible, a false green is not.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
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

test.skipIf(!DB)("a body resolver returning undefined leaves the instance flagged", async () => {
  const body = waitBody("sayYes");
  const inst = await createFrom(body);
  await executeManualTransition(inst, "path_ab", body, actor);
  await drainOutbox(sql, reg); // flags 'pending'

  expect(await drainResolutions(sql, () => undefined)).toBe(0); // nothing processed
  expect(await resolveState(inst.instanceId)).toBe("pending"); // still flagged
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

test.skipIf(!DB)("an unparseable claimed instance is requeued and does not starve the batch", async () => {
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

  // Both good instances are processed and the poison is requeued, instead of the
  // parse throw aborting the pass and stranding the rest of the batch.
  expect(await drainResolutions(sql, () => body)).toBe(2);
  expect((await readInst(g1.instanceId)).currentStepId as string).toBe("step_done");
  expect((await readInst(g2.instanceId)).currentStepId as string).toBe("step_done");
  expect(await resolveState("inst_poison")).toBe("pending"); // requeued, not lost
});
